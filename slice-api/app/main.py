"""
Home slice/estimate API for artblu.
Uses OrcaSlicer CLI with Bambu Lab P2S + PLA + supports profiles.
"""
from __future__ import annotations

import asyncio
import json
import math
import os
import re
import shutil
import struct
import tempfile
import zipfile
from pathlib import Path
from typing import Optional

from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .threemf import convert_3mf_to_stl
from .jobs import archive_upload, finish_job, job_count, log_rejected

API_KEY = os.environ.get("SLICE_API_KEY", "change-me")
ORCA_BIN = os.environ.get("ORCA_BIN", "/opt/orca/AppRun")
PROFILES_DIR = Path(os.environ.get("PROFILES_DIR", "/profiles"))
MAX_UPLOAD_MB = int(os.environ.get("MAX_UPLOAD_MB", "50"))
CORS_ORIGINS = [o.strip() for o in os.environ.get("CORS_ORIGINS", "*").split(",") if o.strip()]
SLICE_TIMEOUT_SEC = int(os.environ.get("SLICE_TIMEOUT_SEC", "300"))

MACHINE_PROFILE = PROFILES_DIR / "machine.json"
PROCESS_PROFILE = PROFILES_DIR / "process.json"
FILAMENT_PROFILE = PROFILES_DIR / "filament.json"

app = FastAPI(title="artblu Slice API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS if CORS_ORIGINS != ["*"] else ["*"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


@app.middleware("http")
async def private_network_access(request, call_next):
    """Chrome Private Network Access: public sites (artblu.ro) → Tailscale funnel hostname."""
    response = await call_next(request)
    if request.headers.get("access-control-request-private-network") == "true":
        response.headers["Access-Control-Allow-Private-Network"] = "true"
    return response


def require_api_key(x_api_key: Optional[str] = Header(default=None)):
    if not API_KEY or API_KEY == "change-me":
        # still require a key match so misconfig is obvious in logs
        pass
    if not x_api_key or x_api_key != API_KEY:
        raise HTTPException(status_code=401, detail="Invalid or missing X-API-Key")


def parse_gcode_metadata(text: str) -> dict:
    print_hours = None
    filament_grams = None
    used_m = None
    header = text[:250000] if text else ""

    time_patterns = [
        r";\s*total estimated time:\s*(.+)",
        r";\s*estimated printing time.*=\s*(.+)",
        r";\s*model printing time:\s*(.+)",
    ]
    for pattern in time_patterns:
        match = re.search(pattern, header, re.IGNORECASE)
        if match:
            print_hours = duration_to_hours(match.group(1))
            if print_hours is not None:
                break

    gram_patterns = [
        r";\s*total filament weight\s*\[g\]\s*[:=]\s*([\d.]+)",
        r";\s*total filament used\s*\[g\]\s*[:=]\s*([\d.]+)",
        r";\s*filament used\s*\[g\]\s*[:=]\s*([\d.]+)",
        r";\s*filament weight\s*[:=]\s*([\d.]+)",
    ]
    for pattern in gram_patterns:
        matches = re.findall(pattern, header, re.IGNORECASE)
        if matches:
            total = sum(float(m) for m in matches)
            if total > 0:
                filament_grams = total
                break

    if filament_grams is None:
        used = re.findall(r'used_g="([\d.]+)"', header)
        if used:
            total = sum(float(m) for m in used)
            if total > 0:
                filament_grams = total

    density = first_float(re.findall(r";\s*filament_density\s*=\s*([\d.,;]+)", header, re.IGNORECASE))
    diameter = first_float(re.findall(r";\s*filament_diameter\s*=\s*([\d.,;]+)", header, re.IGNORECASE))

    mm_matches = re.findall(r";\s*(?:total\s+)?filament used\s*\[mm\]\s*[:=]\s*([\d.]+)", header, re.IGNORECASE)
    if mm_matches:
        used_m = sum(float(m) for m in mm_matches) / 1000.0

    if filament_grams is None:
        cm3_matches = re.findall(r";\s*(?:total\s+)?filament used\s*\[cm3\]\s*[:=]\s*([\d.]+)", header, re.IGNORECASE)
        if cm3_matches:
            dens = density or 1.26
            total_cm3 = sum(float(m) for m in cm3_matches)
            if total_cm3 > 0:
                filament_grams = total_cm3 * dens

    return {
        "printHours": print_hours,
        "filamentGrams": filament_grams,
        "filamentDensity": density,
        "filamentDiameter": diameter,
        "usedM": used_m,
    }


def first_float(matches: list) -> Optional[float]:
    if not matches:
        return None
    raw = str(matches[0]).replace(",", ";").split(";")[0].strip()
    try:
        return float(raw)
    except ValueError:
        return None


def duration_to_hours(text: str) -> Optional[float]:
    if not text:
        return None
    normalized = str(text).strip().lower()
    # Strip trailing junk after time token lists
    normalized = normalized.split(";")[0].strip()
    colon = re.match(r"^(\d+):(\d{2})(?::(\d{2}))?$", normalized)
    if colon:
        h = int(colon.group(1))
        m = int(colon.group(2))
        s = int(colon.group(3) or 0)
        return h + m / 60 + s / 3600

    seconds = 0
    day = re.search(r"(\d+)\s*d\b", normalized)
    hour = re.search(r"(\d+)\s*h\b", normalized)
    minute = re.search(r"(\d+)\s*m\b", normalized)
    sec = re.search(r"(\d+)\s*s\b", normalized)
    if day:
        seconds += int(day.group(1)) * 86400
    if hour:
        seconds += int(hour.group(1)) * 3600
    if minute:
        seconds += int(minute.group(1)) * 60
    if sec:
        seconds += int(sec.group(1))
    if seconds > 0:
        return seconds / 3600
    return None


def grams_from_length_m(used_m: float, diameter_mm: float, density_g_cm3: float) -> float:
    # Bambu CLI often leaves used_g=0; used_m is reliable.
    return math.pi * (diameter_mm / 2.0) ** 2 * used_m * density_g_cm3


def extract_gcode_from_3mf(path: Path) -> str:
    with zipfile.ZipFile(path, "r") as zf:
        names = zf.namelist()
        candidates = [
            n for n in names
            if n.lower().endswith(".gcode") or ("plate_" in n.lower() and n.lower().endswith(".gcode"))
        ]
        if not candidates:
            candidates = [n for n in names if "gcode" in n.lower()]
        if not candidates:
            raise RuntimeError("No G-code found inside sliced 3MF")
        candidates.sort(key=lambda n: (0 if "plate_1" in n.lower() else 1, n))
        return zf.read(candidates[0]).decode("utf-8", errors="ignore")


def extract_slice_info(path: Path) -> dict:
    """Authoritative plate stats from Metadata/slice_info.config."""
    result = {
        "printHours": None,
        "filamentGrams": None,
        "usedM": None,
        "supportUsed": None,
        "weight": None,
    }
    try:
        with zipfile.ZipFile(path, "r") as zf:
            info_names = [n for n in zf.namelist() if n.lower().endswith("slice_info.config")]
            if not info_names:
                return result
            text = zf.read(info_names[0]).decode("utf-8", errors="ignore")
    except Exception:
        return result

    preds = [float(x) for x in re.findall(r'key="prediction"\s+value="([\d.]+)"', text, re.IGNORECASE)]
    weights = [float(x) for x in re.findall(r'key="weight"\s+value="([\d.]+)"', text, re.IGNORECASE)]
    supports = re.findall(r'key="support_used"\s+value="([^"]+)"', text, re.IGNORECASE)
    used_g = [float(x) for x in re.findall(r'used_g="([\d.]+)"', text, re.IGNORECASE)]
    used_m = [float(x) for x in re.findall(r'used_m="([\d.]+)"', text, re.IGNORECASE)]

    if preds:
        result["printHours"] = sum(preds) / 3600.0
    if weights:
        result["weight"] = sum(weights)
    if used_g:
        result["filamentGrams"] = sum(used_g)
    if used_m:
        result["usedM"] = sum(used_m)
    if supports:
        result["supportUsed"] = any(s.strip().lower() == "true" for s in supports)
    return result


def filament_profile_physicals() -> tuple[Optional[float], Optional[float]]:
    try:
        data = json.loads(FILAMENT_PROFILE.read_text(encoding="utf-8"))
    except Exception:
        return None, None

    def as_float(value) -> Optional[float]:
        if value is None:
            return None
        if isinstance(value, (list, tuple)) and value:
            value = value[0]
        try:
            return float(str(value).split(";")[0].strip())
        except ValueError:
            return None

    return as_float(data.get("filament_density")), as_float(data.get("filament_diameter"))


def merge_slice_metadata(gcode_meta: dict, slice_info: dict, density: Optional[float] = None, diameter: Optional[float] = None) -> dict:
    print_hours = slice_info.get("printHours")
    if print_hours is None:
        print_hours = gcode_meta.get("printHours")

    dens = gcode_meta.get("filamentDensity") or density or 1.26
    diam = gcode_meta.get("filamentDiameter") or diameter or 1.75

    grams = None
    for candidate in (
        slice_info.get("filamentGrams"),
        slice_info.get("weight"),
        gcode_meta.get("filamentGrams"),
    ):
        if candidate is not None and float(candidate) > 0:
            grams = float(candidate)
            break

    used_m = None
    for candidate in (slice_info.get("usedM"), gcode_meta.get("usedM")):
        if candidate is not None and float(candidate) > 0:
            used_m = float(candidate)
            break

    if grams is None and used_m:
        grams = grams_from_length_m(used_m, float(diam), float(dens))

    return {
        "printHours": print_hours,
        "filamentGrams": grams,
        "supportUsed": slice_info.get("supportUsed"),
        "usedM": used_m,
    }


def detect_unit_scale(bounds: Optional[dict]) -> tuple[float, Optional[str]]:
    """Auto-fix STLs exported in meters to millimeters.

    Only the unambiguous case: max axis < 0.5 (e.g. 0.077 → 77 mm).
    Inches auto-detect is skipped — it mis-scales small mm parts and Orca --scale segfaults.
    """
    if not bounds or bounds["maxDim"] <= 0:
        return 1.0, None

    max_dim = float(bounds["maxDim"])
    if max_dim < 0.5:
        scaled = max_dim * 1000.0
        if 1.0 <= scaled <= 256:
            return 1000.0, "meters→mm (auto)"
    return 1.0, None


def scale_stl_file(path: Path, scale: float) -> None:
    """Scale STL vertices in-place (Orca --scale segfaults in headless CLI)."""
    if abs(scale - 1.0) < 1e-12:
        return
    triangles = load_stl_triangles(path)
    if not triangles:
        raise RuntimeError("STL has no triangles to scale")
    scaled = []
    for n, v0, v1, v2 in triangles:
        scaled.append((
            n,
            (v0[0] * scale, v0[1] * scale, v0[2] * scale),
            (v1[0] * scale, v1[1] * scale, v1[2] * scale),
            (v2[0] * scale, v2[1] * scale, v2[2] * scale),
        ))
    write_binary_stl(path, scaled)


def _vec_sub(a, b):
    return (a[0] - b[0], a[1] - b[1], a[2] - b[2])


def _vec_cross(a, b):
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])


def _vec_dot(a, b):
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def _vec_len(a):
    return math.sqrt(_vec_dot(a, a))


def _vec_norm(a):
    length = _vec_len(a)
    if length < 1e-12:
        return (0.0, 0.0, 0.0)
    return (a[0] / length, a[1] / length, a[2] / length)


def load_stl_triangles(path: Path) -> list:
    data = path.read_bytes()
    if len(data) < 84:
        return []
    tri_count = struct.unpack_from("<I", data, 80)[0]
    expected = 84 + tri_count * 50
    is_binary = tri_count > 0 and expected == len(data)
    triangles = []

    if is_binary:
        offset = 84
        for _ in range(tri_count):
            vals = struct.unpack_from("<12fH", data, offset)
            n = (vals[0], vals[1], vals[2])
            v0 = (vals[3], vals[4], vals[5])
            v1 = (vals[6], vals[7], vals[8])
            v2 = (vals[9], vals[10], vals[11])
            triangles.append((n, v0, v1, v2))
            offset += 50
        return triangles

    text = data.decode("utf-8", errors="ignore")
    verts = re.findall(r"vertex\s+([-+eE\d.]+)\s+([-+eE\d.]+)\s+([-+eE\d.]+)", text)
    for i in range(0, len(verts) - 2, 3):
        v0 = (float(verts[i][0]), float(verts[i][1]), float(verts[i][2]))
        v1 = (float(verts[i + 1][0]), float(verts[i + 1][1]), float(verts[i + 1][2]))
        v2 = (float(verts[i + 2][0]), float(verts[i + 2][1]), float(verts[i + 2][2]))
        n = _vec_norm(_vec_cross(_vec_sub(v1, v0), _vec_sub(v2, v0)))
        triangles.append((n, v0, v1, v2))
    return triangles


def write_binary_stl(path: Path, triangles: list) -> None:
    header = b"artblu-slice".ljust(80, b"\0")
    out = bytearray(header)
    out += struct.pack("<I", len(triangles))
    for n, v0, v1, v2 in triangles:
        # Recompute normal from vertices after transforms
        nn = _vec_norm(_vec_cross(_vec_sub(v1, v0), _vec_sub(v2, v0)))
        if _vec_len(nn) < 1e-9:
            nn = n if _vec_len(n) > 1e-9 else (0.0, 0.0, 1.0)
        out += struct.pack("<12fH", nn[0], nn[1], nn[2], v0[0], v0[1], v0[2], v1[0], v1[1], v1[2], v2[0], v2[1], v2[2], 0)
    path.write_bytes(out)


def place_stl_on_bed(path: Path) -> dict:
    """Keep file orientation (same as dropping the model into Orca) and sit it on Z=0."""
    triangles = load_stl_triangles(path)
    if not triangles:
        return {"oriented": False, "reason": "empty", "rotated": False}

    mins = [float("inf")] * 3
    maxs = [float("-inf")] * 3
    for _n, v0, v1, v2 in triangles:
        for v in (v0, v1, v2):
            for i in range(3):
                mins[i] = min(mins[i], v[i])
                maxs[i] = max(maxs[i], v[i])

    dz = -mins[2]
    dx = -(mins[0] + maxs[0]) / 2.0
    dy = -(mins[1] + maxs[1]) / 2.0
    placed = []
    for n, v0, v1, v2 in triangles:
        placed.append((
            n,
            (v0[0] + dx, v0[1] + dy, v0[2] + dz),
            (v1[0] + dx, v1[1] + dy, v1[2] + dz),
            (v2[0] + dx, v2[1] + dy, v2[2] + dz),
        ))
    write_binary_stl(path, placed)
    size = [maxs[i] - mins[i] for i in range(3)]
    return {
        "oriented": False,
        "rotated": False,
        "method": "translate-to-bed",
        "sizeMm": size,
    }


def stl_bounds(path: Path) -> Optional[dict]:
    """Return axis-aligned bounds for ASCII/binary STL (mm as authored)."""
    data = path.read_bytes()
    if len(data) < 84:
        return None
    # Binary STL: 80-byte header + uint32 tri count
    try:
        tri_count = struct.unpack_from("<I", data, 80)[0]
        expected = 84 + tri_count * 50
        is_binary = tri_count > 0 and expected == len(data)
    except Exception:
        is_binary = False

    mins = [float("inf")] * 3
    maxs = [float("-inf")] * 3
    found = 0

    if is_binary:
        offset = 84
        for _ in range(tri_count):
            if offset + 50 > len(data):
                break
            # normal(3f) + 3 verts(9f) + attr(u16)
            vals = struct.unpack_from("<12fH", data, offset)
            for i in range(3):
                x, y, z = vals[3 + i * 3], vals[4 + i * 3], vals[5 + i * 3]
                mins[0] = min(mins[0], x); maxs[0] = max(maxs[0], x)
                mins[1] = min(mins[1], y); maxs[1] = max(maxs[1], y)
                mins[2] = min(mins[2], z); maxs[2] = max(maxs[2], z)
                found += 1
            offset += 50
    else:
        text = data.decode("utf-8", errors="ignore")
        for match in re.finditer(r"vertex\s+([-+eE\d.]+)\s+([-+eE\d.]+)\s+([-+eE\d.]+)", text):
            x, y, z = float(match.group(1)), float(match.group(2)), float(match.group(3))
            mins[0] = min(mins[0], x); maxs[0] = max(maxs[0], x)
            mins[1] = min(mins[1], y); maxs[1] = max(maxs[1], y)
            mins[2] = min(mins[2], z); maxs[2] = max(maxs[2], z)
            found += 1

    if found == 0:
        return None
    size = [maxs[i] - mins[i] for i in range(3)]
    return {
        "min": mins,
        "max": maxs,
        "size": size,
        "maxDim": max(size),
    }


def find_output_artifact(work_dir: Path) -> Path:
    for pattern in ("*.gcode.3mf", "*.gcode", "*.3mf"):
        matches = sorted(work_dir.glob(pattern), key=lambda p: p.stat().st_mtime, reverse=True)
        if matches:
            return matches[0]
    raise RuntimeError("Slicer produced no output file")


def summarize_orca_log(text: str) -> str:
    skip_substrings = ("orientation:", "cost:", "best:", "sets debug logging", "downward-check", "downward compatible")
    lines = []
    for ln in text.splitlines():
        stripped = ln.strip()
        if not stripped:
            continue
        low = stripped.lower()
        # Help dump on invalid params — ignore option catalog lines
        if stripped.startswith("--") and (" " in stripped[2:] or stripped.endswith("error")):
            continue
        if any(s in low for s in skip_substrings):
            continue
        if "unrecognised" in low or "unrecognized" in low or "invalid" in low or "error" in low or "fail" in low or "nothing to be sliced" in low or "empty" in low or "return -" in low or "compatible" in low:
            lines.append(stripped)
    if not lines:
        # Last non-help lines
        for ln in text.splitlines():
            stripped = ln.strip()
            if stripped and not stripped.startswith("--"):
                lines.append(stripped)
        lines = lines[-20:]
    return "\n".join(lines[-30:])


ORCA_EXIT_HINTS = {
    -2: "invalid CLI parameters (unsupported flag or bad args)",
    -5: "invalid preset JSON (type/from/parse)",
    -17: "process not compatible with printer (compatible_printers / inherits mismatch)",
    -21: "auto-arrange failed",
    -22: "auto-orient failed",
    -50: "nothing to slice / object not fully on bed",
    -51: "invalid slicing parameters",
    -52: "object partly outside bed",
    -61: "filament not compatible with bed type",
    -100: "slicing failed (empty layers / mesh)",
}


def orca_exit_hint(returncode: int) -> str:
    code = returncode - 256 if returncode > 127 else returncode
    hint = ORCA_EXIT_HINTS.get(code)
    if hint:
        return f"Orca code {code}: {hint}"
    return f"Orca code {code}"


async def run_orca_slice(stl_path: Path, out_dir: Path) -> Path:
    if not Path(ORCA_BIN).exists():
        raise RuntimeError(f"OrcaSlicer binary not found at {ORCA_BIN}")

    for required in (MACHINE_PROFILE, PROCESS_PROFILE, FILAMENT_PROFILE):
        if not required.exists():
            raise RuntimeError(f"Missing profile: {required}")

    out_3mf = out_dir / "sliced.gcode.3mf"
    orca = ORCA_BIN
    settings = f"{MACHINE_PROFILE};{PROCESS_PROFILE}"
    filament = str(FILAMENT_PROFILE)

    # Keep CLI flags to the official set. Do NOT use --scale / --orient (CLI crashes or -50).
    # Unit fix is applied to the STL in Python; orientation is left as in the uploaded file.
    # Supports come from flattened process.json.
    attempts = [
        [
            "xvfb-run", "-a", "-s", "-screen 0 1024x768x24",
            orca,
            "--arrange", "1",
            "--load-settings", settings,
            "--load-filaments", filament,
            "--slice", "0",
            "--export-3mf", str(out_3mf),
            str(stl_path),
        ],
        [
            "xvfb-run", "-a", "-s", "-screen 0 1024x768x24",
            orca,
            "--arrange", "1",
            "--curr-bed-type", "Textured PEI Plate",
            "--load-settings", settings,
            "--load-filaments", filament,
            "--slice", "0",
            "--export-3mf", str(out_3mf),
            str(stl_path),
        ],
        [
            "xvfb-run", "-a", "-s", "-screen 0 1024x768x24",
            orca,
            "--load-settings", settings,
            "--load-filaments", filament,
            "--slice", "0",
            "--export-3mf", str(out_3mf),
            str(stl_path),
        ],
    ]

    errors = []
    for cmd in attempts:
        if out_3mf.exists():
            out_3mf.unlink()
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=str(out_dir),
        )
        try:
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=SLICE_TIMEOUT_SEC)
        except asyncio.TimeoutError:
            proc.kill()
            errors.append(f"timed out after {SLICE_TIMEOUT_SEC}s")
            continue

        if proc.returncode == 0 and (out_3mf.exists() or list(out_dir.glob("*.gcode*"))):
            if out_3mf.exists():
                return out_3mf
            return find_output_artifact(out_dir)

        err = (stderr or b"").decode("utf-8", errors="ignore")
        out = (stdout or b"").decode("utf-8", errors="ignore")
        summary = summarize_orca_log(err + "\n" + out)
        # Include the exact argv we ran so invalid-flag issues are obvious
        shown = " ".join(cmd[4:])  # skip xvfb-run wrapper
        errors.append(f"exit {proc.returncode} ({orca_exit_hint(proc.returncode)}): cmd=[{shown}] :: {summary or (err or out)[-800:] or 'no log'}")

    raise RuntimeError("OrcaSlicer failed after retries:\n" + "\n---\n".join(errors))


@app.get("/health")
async def health():
    bed = None
    machine_from = None
    process_compat = None
    machine_name = None
    try:
        if MACHINE_PROFILE.exists():
            machine = json.loads(MACHINE_PROFILE.read_text(encoding="utf-8"))
            bed = machine.get("printable_area")
            machine_from = machine.get("from")
            machine_name = machine.get("name")
        if PROCESS_PROFILE.exists():
            process = json.loads(PROCESS_PROFILE.read_text(encoding="utf-8"))
            process_compat = process.get("compatible_printers")
    except Exception:
        bed = None
    return {
        "ok": True,
        "orca": Path(ORCA_BIN).exists(),
        "profiles": {
            "machine": MACHINE_PROFILE.exists(),
            "process": PROCESS_PROFILE.exists(),
            "filament": FILAMENT_PROFILE.exists(),
            "printable_area": bed,
            "machine_from": machine_from,
            "machine_name": machine_name,
            "compatible_printers": process_compat,
        },
        "printer": "Bambu Lab P2S",
        "preset": "0.20mm Standard PLA + tree supports",
        "jobs": job_count(),
    }


@app.post("/estimate")
async def estimate(
    file: UploadFile = File(...),
    material: str = Form("PLA"),
    _: None = Depends(require_api_key),
):
    original_name = file.filename or "model.stl"
    name = original_name.lower()
    if not (name.endswith(".stl") or name.endswith(".3mf")):
        log_rejected(original_name, "Only .stl and .3mf files are supported for exact estimates")
        raise HTTPException(status_code=400, detail="Only .stl and .3mf files are supported for exact estimates")

    data = await file.read()
    if len(data) > MAX_UPLOAD_MB * 1024 * 1024:
        log_rejected(original_name, f"File exceeds {MAX_UPLOAD_MB} MB")
        raise HTTPException(status_code=400, detail=f"File exceeds {MAX_UPLOAD_MB} MB")

    job = None
    try:
        job = archive_upload(original_name, data, material)
    except Exception as exc:
        print("[slice-job] failed to archive upload: " + str(exc), flush=True)

    work = Path(tempfile.mkdtemp(prefix="artblu-slice-"))
    try:
        stl_path = work / "model.stl"
        converted_3mf = None
        if name.endswith(".3mf"):
            src_3mf = work / "upload.3mf"
            src_3mf.write_bytes(data)
            try:
                converted_3mf = convert_3mf_to_stl(src_3mf, stl_path)
            except Exception as exc:
                raise HTTPException(status_code=400, detail=f"Could not read 3MF mesh: {exc}") from exc
        else:
            stl_path.write_bytes(data)

        bounds = stl_bounds(stl_path)
        scale, unit_fix = detect_unit_scale(bounds)
        scaled_size = None
        if bounds:
            scaled_size = [s * scale for s in bounds["size"]]
            max_after = max(scaled_size) if scaled_size else 0
            if max_after > 256:
                raise HTTPException(
                    status_code=400,
                    detail=f"Model is too large for P2S bed ({max_after:.1f} mm max axis after unit fix). Export at print size in millimeters.",
                )
            if scale == 1.0 and bounds["maxDim"] < 0.5:
                raise HTTPException(
                    status_code=400,
                    detail=f"Model is tiny ({bounds['maxDim']:.3f} mm) and could not be auto-scaled safely. Re-export in millimeters.",
                )

        if scale != 1.0:
            scale_stl_file(stl_path, scale)
            bounds = stl_bounds(stl_path)
            if bounds:
                scaled_size = bounds["size"]

        orient_info = place_stl_on_bed(stl_path)
        bounds = stl_bounds(stl_path)
        if bounds:
            scaled_size = bounds["size"]
            if bounds["maxDim"] > 256:
                raise HTTPException(
                    status_code=400,
                    detail=f"Model is too large for P2S bed ({bounds['maxDim']:.1f} mm) after placing on the bed. Export at print size in millimeters.",
                )

        artifact = await run_orca_slice(stl_path, work)

        if artifact.suffix.lower() == ".gcode" or artifact.name.endswith(".gcode"):
            gcode_text = artifact.read_text(encoding="utf-8", errors="ignore")
            source = "gcode"
            slice_info = {}
        else:
            gcode_text = extract_gcode_from_3mf(artifact)
            source = "gcode.3mf"
            slice_info = extract_slice_info(artifact)

        gcode_meta = parse_gcode_metadata(gcode_text)
        dens, diam = filament_profile_physicals()
        meta = merge_slice_metadata(gcode_meta, slice_info, dens, diam)

        if meta["printHours"] is None:
            raise HTTPException(status_code=500, detail="Slice finished but print time was missing from output")
        if meta["filamentGrams"] is None or meta["filamentGrams"] <= 0:
            raise HTTPException(
                status_code=500,
                detail="Slice finished but filament weight was 0/missing. Try another export of the model.",
            )

        payload = {
            "ok": True,
            "printHours": round(float(meta["printHours"]), 4),
            "filamentGrams": round(float(meta["filamentGrams"]), 2),
            "material": (material or "PLA").upper(),
            "printer": "Bambu Lab P2S",
            "preset": "0.20mm Standard PLA + tree supports (Orca/Bambu profile)",
            "source": source,
            "supportUsed": meta.get("supportUsed"),
            "fileName": original_name,
            "inputFormat": "3mf" if name.endswith(".3mf") else "stl",
            "converted3mf": converted_3mf,
            "modelSizeMm": scaled_size if scaled_size is not None else (bounds["size"] if bounds else None),
            "unitFix": unit_fix,
            "scaleApplied": scale,
            "orient": orient_info,
        }
        finish_job(job, True, result=payload)
        return JSONResponse(payload)
    except HTTPException as exc:
        finish_job(job, False, error=exc.detail)
        raise
    except Exception as exc:
        finish_job(job, False, error=str(exc))
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    finally:
        shutil.rmtree(work, ignore_errors=True)
