"""Persist slice uploads and print a job log in the SSH/CLI."""
from __future__ import annotations

import argparse
import json
import os
import re
import secrets
import sys
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

JOBS_DIR = Path(os.environ.get("JOBS_DIR", "/jobs"))
JSONL_NAME = "jobs.jsonl"
LOG_NAME = "jobs.log"


def jobs_dir() -> Path:
    path = Path(os.environ.get("JOBS_DIR", str(JOBS_DIR)))
    path.mkdir(parents=True, exist_ok=True)
    return path


def jsonl_path() -> Path:
    return jobs_dir() / JSONL_NAME


def log_path() -> Path:
    return jobs_dir() / LOG_NAME


def safe_filename(name: str) -> str:
    base = Path(name or "model.stl").name
    cleaned = re.sub(r"[^A-Za-z0-9._-]+", "_", base).strip("._")
    if not cleaned:
        cleaned = "model.stl"
    return cleaned[:120]


def format_bytes(n: int) -> str:
    if n < 1024:
        return str(n) + " B"
    if n < 1024 * 1024:
        return "{:.1f} KB".format(n / 1024)
    return "{:.1f} MB".format(n / (1024 * 1024))


def _now() -> datetime:
    return datetime.now().astimezone()


def _lock_and_append(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as fp:
        try:
            import fcntl
            fcntl.flock(fp.fileno(), fcntl.LOCK_EX)
        except Exception:
            pass
        fp.write(text)
        if not text.endswith("\n"):
            fp.write("\n")
        fp.flush()


def append_record(record: Dict[str, Any]) -> None:
    _lock_and_append(jsonl_path(), json.dumps(record, ensure_ascii=False) + "\n")
    when = record.get("receivedAt") or record.get("updatedAt") or ""
    name = record.get("fileName") or "-"
    saved = record.get("savedAs") or ""
    status = record.get("status") or ""
    extra = ""
    if status == "ok":
        hours = record.get("printHours")
        grams = record.get("filamentGrams")
        extra = "  OK"
        if hours is not None:
            extra += "  {:.2f} h".format(float(hours))
        if grams is not None:
            extra += "  {:.1f} g".format(float(grams))
    elif status == "error":
        extra = "  ERROR  " + str(record.get("error") or "")
    elif saved:
        extra = "  saved=" + saved + "  " + format_bytes(int(record.get("bytes") or 0))
    line = "{}  {}{}".format(when, name, extra)
    _lock_and_append(log_path(), line)
    print("[slice-job] " + line, flush=True)


def archive_upload(original_name: str, data: bytes, material: str) -> Dict[str, Any]:
    now = _now()
    token = secrets.token_hex(3)
    day = now.strftime("%Y-%m-%d")
    stamp = now.strftime("%H-%M-%S")
    job_id = now.strftime("%Y%m%d-%H%M%S") + "-" + token
    saved_name = "{}_{}_{}".format(stamp, token, safe_filename(original_name))
    rel = "{}/{}".format(day, saved_name)
    dest = jobs_dir() / day / saved_name
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(data)
    record = {
        "id": job_id,
        "receivedAt": now.strftime("%Y-%m-%d %H:%M:%S"),
        "iso": now.isoformat(timespec="seconds"),
        "fileName": original_name,
        "savedAs": rel,
        "savedPath": str(dest),
        "bytes": len(data),
        "material": (material or "PLA").upper(),
        "status": "received",
    }
    append_record(record)
    return record


def finish_job(job: Optional[Dict[str, Any]], ok: bool, result: Optional[dict] = None, error: Any = None) -> None:
    if not job:
        return
    now = _now()
    record = {
        "id": job.get("id"),
        "receivedAt": job.get("receivedAt"),
        "updatedAt": now.strftime("%Y-%m-%d %H:%M:%S"),
        "iso": now.isoformat(timespec="seconds"),
        "fileName": job.get("fileName"),
        "savedAs": job.get("savedAs"),
        "savedPath": job.get("savedPath"),
        "bytes": job.get("bytes"),
        "material": job.get("material"),
        "status": "ok" if ok else "error",
    }
    if ok and result:
        record["printHours"] = result.get("printHours")
        record["filamentGrams"] = result.get("filamentGrams")
        record["printer"] = result.get("printer")
    if not ok:
        if isinstance(error, list):
            error = json.dumps(error)
        record["error"] = str(error or "unknown error")
    try:
        append_record(record)
    except Exception as exc:
        print("[slice-job] failed to write finish log: " + str(exc), flush=True)


def log_rejected(original_name: str, reason: str) -> None:
    now = _now()
    record = {
        "id": now.strftime("%Y%m%d-%H%M%S") + "-" + secrets.token_hex(3),
        "receivedAt": now.strftime("%Y-%m-%d %H:%M:%S"),
        "iso": now.isoformat(timespec="seconds"),
        "fileName": original_name,
        "bytes": 0,
        "status": "error",
        "error": reason,
    }
    try:
        append_record(record)
    except Exception:
        pass


def load_jobs() -> List[Dict[str, Any]]:
    path = jsonl_path()
    if not path.exists():
        return []
    by_id: Dict[str, Dict[str, Any]] = {}
    order: List[str] = []
    for raw in path.read_text(encoding="utf-8", errors="ignore").splitlines():
        line = raw.strip()
        if not line:
            continue
        try:
            rec = json.loads(line)
        except json.JSONDecodeError:
            continue
        job_id = str(rec.get("id") or "")
        if not job_id:
            continue
        if job_id not in by_id:
            order.append(job_id)
            by_id[job_id] = rec
        else:
            by_id[job_id].update(rec)
    return [by_id[i] for i in order]


def job_count() -> int:
    return len(load_jobs())


def print_jobs(limit: int, as_json: bool, show_paths: bool) -> int:
    all_jobs = load_jobs()
    jobs = all_jobs[-limit:] if limit > 0 else all_jobs
    if as_json:
        json.dump(jobs, sys.stdout, indent=2, ensure_ascii=False)
        sys.stdout.write("\n")
        return 0
    print("artblu slice jobs  ({} shown, {} total)".format(len(jobs), len(all_jobs)))
    print("log:  " + str(log_path()))
    print("files:" + " " + str(jobs_dir()))
    print("-" * 88)
    if not jobs:
        print("No uploads yet.")
        return 0
    print("{:>4}  {:19}  {:28}  {:>8}  {}".format("#", "received", "file", "size", "result"))
    start = len(all_jobs) - len(jobs) + 1
    for i, job in enumerate(jobs, start=start):
        name = str(job.get("fileName") or "-")
        if len(name) > 28:
            name = name[:25] + "..."
        size = format_bytes(int(job.get("bytes") or 0)) if job.get("bytes") else "-"
        status = job.get("status") or ""
        if status == "ok":
            hours = job.get("printHours")
            grams = job.get("filamentGrams")
            result = "OK"
            if hours is not None:
                result += "  {:.2f} h".format(float(hours))
            if grams is not None:
                result += "  {:.1f} g".format(float(grams))
        elif status == "error":
            err = str(job.get("error") or "error")
            if len(err) > 42:
                err = err[:39] + "..."
            result = "ERR  " + err
        elif status == "received":
            result = "slicing / incomplete"
        else:
            result = status
        print("{:4d}  {:19}  {:28}  {:>8}  {}".format(i, str(job.get("receivedAt") or "-"), name, size, result))
        if show_paths and job.get("savedPath"):
            print("      " + str(job.get("savedPath")))
    print("-" * 88)
    print("Tip: slice-jobs -n 50     more rows")
    print("     slice-jobs --files   show saved paths")
    print("     slice-jobs --json    raw JSON")
    return 0


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(prog="slice-jobs", description="List 3D files sent to the artblu slice server")
    parser.add_argument("-n", "--limit", type=int, default=30, help="How many recent jobs to show (0 = all)")
    parser.add_argument("--json", action="store_true", help="Print JSON instead of a table")
    parser.add_argument("--files", action="store_true", help="Show full saved file paths")
    parser.add_argument("--dir", default=None, help="Jobs directory (default: $JOBS_DIR or /jobs)")
    args = parser.parse_args(argv)
    if args.dir:
        os.environ["JOBS_DIR"] = args.dir
    return print_jobs(args.limit, args.json, args.files)


if __name__ == "__main__":
    raise SystemExit(main())
