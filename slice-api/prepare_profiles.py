#!/usr/bin/env python3
"""Build flattened Orca BBL profiles for CLI slicing (inherits must be resolved)."""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import Any, Dict, Optional, Tuple


def load_json(path: Path) -> Optional[dict]:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None
    if isinstance(data, dict):
        return data
    return None


def index_by_name(bbl_dir: Path) -> Dict[str, Tuple[Path, dict]]:
    index: Dict[str, Tuple[Path, dict]] = {}
    for path in bbl_dir.rglob("*.json"):
        data = load_json(path)
        if not data:
            continue
        name = data.get("name")
        if isinstance(name, str) and name:
            index[name] = (path, data)
    return index


def deep_merge(base: dict, overlay: dict) -> dict:
    out = dict(base)
    for key, value in overlay.items():
        if key == "inherits":
            continue
        out[key] = value
    return out


def flatten_named(name: str, index: Dict[str, Tuple[Path, dict]], stack: Optional[list] = None) -> dict:
    if stack is None:
        stack = []
    if name in stack:
        raise RuntimeError(f"inherits cycle at {name}: {' -> '.join(stack)}")
    if name not in index:
        raise RuntimeError(f"profile not found by name: {name}")
    path, data = index[name]
    parent_name = data.get("inherits")
    if isinstance(parent_name, str) and parent_name:
        merged = flatten_named(parent_name, index, stack + [name])
        return deep_merge(merged, data)
    return dict(data)


def flatten_file(path: Path, index: Dict[str, Tuple[Path, dict]]) -> dict:
    data = load_json(path)
    if not data:
        raise RuntimeError(f"invalid json: {path}")
    name = data.get("name")
    if isinstance(name, str) and name and name in index:
        return flatten_named(name, index)
    parent = data.get("inherits")
    if isinstance(parent, str) and parent and parent in index:
        return deep_merge(flatten_named(parent, index), data)
    return dict(data)


def pick_path(bbl_dir: Path, rel_candidates: list[str]) -> Path:
    for rel in rel_candidates:
        path = bbl_dir / rel
        if path.is_file():
            return path
    raise RuntimeError("none of the candidate profiles exist:\n  " + "\n  ".join(rel_candidates))


def pick_standard_extruder_variant(data: dict) -> dict:
    """CLI has no GUI hotend picker — keep Direct Drive Standard, drop High Flow duplicates."""
    variants = data.get("print_extruder_variant")
    if not isinstance(variants, list) or len(variants) < 2:
        return data
    idx = 0
    for i, name in enumerate(variants):
        if "high flow" in str(name).lower():
            continue
        idx = i
        break
    out = dict(data)
    skip = {"compatible_printers"}
    for key, value in list(out.items()):
        if key in skip:
            continue
        if isinstance(value, list) and len(value) == len(variants):
            out[key] = [value[idx]]
    return out


def finalize(data: dict, typ: str, supports: bool = False) -> dict:
    out = dict(data)
    out["type"] = typ
    # CLI treats from=user as needing inherits == compatible printer system name.
    # Flattened full configs must stay from=system so system_name == name.
    out["from"] = "system"
    name = out.get("name")
    if isinstance(name, str) and name:
        out["inherits"] = name
    if supports and typ == "process":
        # Enable supports; keep the preset's type (Orca 2.4 BBL default is tree(auto)).
        out["enable_support"] = "1"
        out = pick_standard_extruder_variant(out)
    if typ == "filament":
        dens = out.get("filament_density")
        diam = out.get("filament_diameter")
        if dens is None or dens == [] or dens == "":
            out["filament_density"] = ["1.26"]
        if diam is None or diam == [] or diam == "":
            out["filament_diameter"] = ["1.75"]
    if typ == "machine":
        # Avoid filament/bed mismatch under CLI.
        if not out.get("curr_bed_type"):
            out["curr_bed_type"] = "Textured PEI Plate"
    return out


def write_profile(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")


def main() -> int:
    bbl_dir = Path(os.environ.get("BBL_DIR") or (sys.argv[1] if len(sys.argv) > 1 else ""))
    out_dir = Path(os.environ.get("PROFILES_DIR") or (sys.argv[2] if len(sys.argv) > 2 else "/profiles"))
    if not bbl_dir.is_dir():
        print(f"[artblu] ERROR: BBL dir missing: {bbl_dir}", file=sys.stderr)
        return 1

    index = index_by_name(bbl_dir)
    print(f"[artblu] Indexed {len(index)} named presets under {bbl_dir}")

    machine_src = pick_path(bbl_dir, [
        "machine/Bambu Lab P2S 0.4 nozzle.json",
        "machine/Bambu Lab P1S 0.4 nozzle.json",
        "machine/Bambu Lab X1 Carbon 0.4 nozzle.json",
    ])
    process_src = pick_path(bbl_dir, [
        "process/0.20mm Standard @BBL P2S.json",
        "process/0.20mm Standard @BBL P1S.json",
        "process/0.20mm Standard @BBL X1C.json",
        "process/0.20mm Standard @BBL P1P.json",
    ])
    filament_src = pick_path(bbl_dir, [
        "filament/Bambu PLA Basic @BBL P2S.json",
        "filament/Bambu PLA Basic @BBL X1C.json",
        "filament/Bambu PLA Basic @base.json",
        "filament/Generic PLA.json",
    ])

    machine = finalize(flatten_file(machine_src, index), "machine")
    process = finalize(flatten_file(process_src, index), "process", supports=True)
    filament = finalize(flatten_file(filament_src, index), "filament")

    machine_name = machine.get("name") or "Bambu Lab P2S 0.4 nozzle"
    process["compatible_printers"] = [machine_name]
    filament["compatible_printers"] = [machine_name]

    if not machine.get("printable_area"):
        print("[artblu] ERROR: flattened machine has no printable_area (inherits broken)", file=sys.stderr)
        return 1

    write_profile(out_dir / "machine.json", machine)
    write_profile(out_dir / "process.json", process)
    write_profile(out_dir / "filament.json", filament)

    print(f"[artblu] machine : {machine_src.name} -> printable_area={machine.get('printable_area')}")
    print(f"[artblu] process : {process_src.name} (supports on, type={process.get('support_type')})")
    print(f"[artblu] filament: {filament_src.name}")
    print(f"[artblu] Profiles ready in {out_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
