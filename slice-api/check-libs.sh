#!/usr/bin/env bash
# Verify Orca binary can resolve shared libraries before we ship the image.
set -euo pipefail

echo "[check-orca-libs] Looking for orca-slicer ELF…"
mapfile -t elves < <(find /opt/orca/squashfs-root -type f -name 'orca-slicer' 2>/dev/null | head -n 5)

if [[ ${#elves[@]} -eq 0 ]]; then
  echo "[check-orca-libs] ERROR: orca-slicer binary not found after AppImage extract"
  find /opt/orca/squashfs-root -maxdepth 4 -type f -iname '*orca*' 2>/dev/null | head -n 40 || true
  exit 1
fi

failed=0
for elf in "${elves[@]}"; do
  echo "[check-orca-libs] Checking: $elf"
  if ! file "$elf" | grep -qi 'ELF'; then
    echo "[check-orca-libs] skip (not ELF): $elf"
    continue
  fi
  missing="$(ldd "$elf" 2>/dev/null | grep 'not found' || true)"
  if [[ -n "$missing" ]]; then
    echo "[check-orca-libs] ERROR: missing shared libraries for $elf:"
    echo "$missing"
    failed=1
  else
    echo "[check-orca-libs] OK — $elf"
  fi
done

# Explicit host libs we already hit in production
required_sos=(
  libOpenGL.so.0
  libGL.so.1
  libwebkit2gtk-4.1.so.0
  libjavascriptcoregtk-4.1.so.0
  libgtk-3.so.0
  libmspack.so.0
)
for so in "${required_sos[@]}"; do
  if find /usr/lib /lib -name "$so" 2>/dev/null | grep -q .; then
    echo "[check-orca-libs] host has $so"
  else
    echo "[check-orca-libs] ERROR: host missing $so — add apt package to Dockerfile"
    failed=1
  fi
done

# xauth / xvfb presence
command -v xvfb-run >/dev/null || { echo "[check-orca-libs] ERROR: xvfb-run missing"; failed=1; }
command -v xauth >/dev/null || { echo "[check-orca-libs] ERROR: xauth missing"; failed=1; }

if [[ "$failed" -ne 0 ]]; then
  echo
  echo "Fix the Dockerfile apt packages, then rebuild."
  exit 1
fi

echo "[check-orca-libs] All checks passed."
