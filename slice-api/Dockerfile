# artblu home slice API — OrcaSlicer CLI (Bambu P2S / PLA / supports)
# Base = Ubuntu 24.04 to match the official AppImage (glibc + WebKit 4.1).
FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive \
    ORCA_ROOT=/opt/orca \
    ORCA_BIN=/opt/orca/squashfs-root/AppRun \
    PROFILES_DIR=/profiles \
    SLICE_API_KEY=change-me \
    CORS_ORIGINS=* \
    MAX_UPLOAD_MB=50 \
    SLICE_TIMEOUT_SEC=300 \
    JOBS_DIR=/jobs \
    PYTHONUNBUFFERED=1 \
    LIBGL_ALWAYS_SOFTWARE=1 \
    GALLIUM_DRIVER=llvmpipe \
    WEBKIT_DISABLE_COMPOSITING_MODE=1 \
    WEBKIT_DISABLE_DMABUF_RENDERER=1

# Full host runtime Orca's Ubuntu2404 AppImage expects (GL + GTK + WebKit 4.1 + media + Xvfb)
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates curl wget xz-utils file python3 python3-pip \
      libgl1 libopengl0 libglu1-mesa libegl1 libglvnd0 libgles2 \
      libdrm2 libgbm1 mesa-utils mesa-vulkan-drivers \
      libx11-6 libxcb1 libxext6 libxrender1 libxi6 libxrandr2 \
      libxcomposite1 libxdamage1 libxfixes3 libxtst6 libxkbcommon0 \
      libxcb-cursor0 libxcb-xinerama0 libxinerama1 \
      libwayland-client0 libwayland-cursor0 libwayland-egl1 \
      xvfb xauth \
      libgtk-3-0t64 libglib2.0-0t64 libgdk-pixbuf-2.0-0 \
      libpango-1.0-0 libpangocairo-1.0-0 libcairo2 \
      libatk1.0-0t64 libatk-bridge2.0-0t64 libatspi2.0-0t64 \
      libdbus-1-3 libsm6 libice6 libfontconfig1 libfreetype6 \
      libwebkit2gtk-4.1-0 libjavascriptcoregtk-4.1-0 \
      libsoup-3.0-0 libsecret-1-0 libnss3 libnspr4 libcups2t64 \
      libasound2t64 libatomic1 libstdc++6 libmspack0 \
      gstreamer1.0-plugins-base gstreamer1.0-libav \
      libgstreamer1.0-0 libgstreamer-plugins-base1.0-0 libgstreamer-gl1.0-0 \
      libfuse2t64 \
    && rm -rf /var/lib/apt/lists/* \
    && ln -sf /usr/bin/python3 /usr/bin/python

# Pin OrcaSlicer Linux AppImage built for Ubuntu 24.04
ARG ORCA_URL=https://github.com/SoftFever/OrcaSlicer/releases/download/v2.4.2/OrcaSlicer_Linux_AppImage_Ubuntu2404_V2.4.2.AppImage
WORKDIR /opt/orca
RUN curl -L --fail -o OrcaSlicer.AppImage "$ORCA_URL" \
    && chmod +x OrcaSlicer.AppImage \
    && ./OrcaSlicer.AppImage --appimage-extract \
    && ln -sf /opt/orca/squashfs-root/AppRun /opt/orca/AppRun \
    && rm -f OrcaSlicer.AppImage \
    && test -x /opt/orca/squashfs-root/AppRun \
    && (test -x /opt/orca/squashfs-root/bin/orca-slicer || test -x /opt/orca/squashfs-root/usr/bin/orca-slicer || true)

# Fail the build early if critical .so files are still missing from the slicer binary
COPY check-libs.sh /usr/local/bin/check-orca-libs
RUN chmod +x /usr/local/bin/check-orca-libs && /usr/local/bin/check-orca-libs

WORKDIR /app
COPY requirements.txt .
RUN pip3 install --no-cache-dir --break-system-packages -r requirements.txt
COPY app ./app
COPY prepare_profiles.py /app/prepare_profiles.py
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh \
    && mkdir -p /profiles /tmp/artblu-slice /jobs \
    && printf '%s\n' '#!/bin/sh' 'export JOBS_DIR="${JOBS_DIR:-/jobs}"' 'cd /app' 'exec python3 -m app.jobs "$@"' > /usr/local/bin/slice-jobs \
    && chmod +x /usr/local/bin/slice-jobs

EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD curl -fsS http://127.0.0.1:8787/health || exit 1

ENTRYPOINT ["/entrypoint.sh"]
