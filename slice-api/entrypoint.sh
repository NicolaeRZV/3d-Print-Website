#!/usr/bin/env bash
set -euo pipefail

PROFILES_DIR="${PROFILES_DIR:-/profiles}"
ORCA_ROOT="${ORCA_ROOT:-/opt/orca}"
REFRESH_PROFILES="${REFRESH_PROFILES:-1}"

mkdir -p "$PROFILES_DIR"

find_bbl_dir() {
  local candidates=(
    "$ORCA_ROOT/squashfs-root/resources/profiles/BBL"
    "$ORCA_ROOT/resources/profiles/BBL"
    "/opt/orca/resources/profiles/BBL"
  )
  for d in "${candidates[@]}"; do
    if [[ -d "$d" ]]; then
      echo "$d"
      return 0
    fi
  done
  return 1
}

need_profiles=0
if [[ "$REFRESH_PROFILES" == "1" ]]; then
  need_profiles=1
elif [[ ! -f "$PROFILES_DIR/machine.json" || ! -f "$PROFILES_DIR/process.json" || ! -f "$PROFILES_DIR/filament.json" ]]; then
  need_profiles=1
elif ! python3 -c 'import json; d=json.load(open("/profiles/machine.json")); raise SystemExit(0 if d.get("printable_area") else 1)'; then
  echo "[artblu] Existing machine.json missing printable_area — rebuilding"
  need_profiles=1
fi

if [[ "$need_profiles" == "1" ]]; then
  BBL_DIR="$(find_bbl_dir || true)"
  if [[ -z "$BBL_DIR" ]]; then
    echo "[artblu] ERROR: BBL profiles not found under $ORCA_ROOT"
    exit 1
  fi
  export BBL_DIR PROFILES_DIR
  python3 /app/prepare_profiles.py
else
  echo "[artblu] Using existing profiles in $PROFILES_DIR"
fi

export ORCA_BIN="${ORCA_BIN:-$ORCA_ROOT/AppRun}"
if [[ ! -x "$ORCA_BIN" && -x "$ORCA_ROOT/squashfs-root/AppRun" ]]; then
  export ORCA_BIN="$ORCA_ROOT/squashfs-root/AppRun"
fi

echo "[artblu] Starting API with ORCA_BIN=$ORCA_BIN"
exec uvicorn app.main:app --host 0.0.0.0 --port 8787
