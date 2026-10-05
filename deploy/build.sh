#!/usr/bin/env bash
# Builds InvidiousTube from the source checkout into /opt/invidioustube.
#
# Runs automatically before the service starts (ExecStartPre), so after a `git pull` a reboot or
# `systemctl restart invidioustube` is enough. It only rebuilds when the source actually changed.
#
# Environment (from /etc/invidioustube.env):
#   SOURCE_DIR   git checkout to build from (default: /opt/invidioustube)
#   AUTO_UPDATE  1 = `git pull` the checkout before building
#   FORCE_BUILD  1 = rebuild even if nothing changed
set -euo pipefail

APP_DIR=${INSTALL_DIR:-/opt/invidioustube}
SRC_DIR=${SOURCE_DIR:-$APP_DIR}
STAMP="$APP_DIR/.build-stamp"
log() { echo "[invidioustube-build] $*"; }

if [[ ! -f "$SRC_DIR/package.json" ]]; then
  log "SOURCE_DIR=$SRC_DIR has no package.json; skipping build"
  exit 0
fi

# Optional: pull the latest code first (never fail startup because the network is down)
if [[ "${AUTO_UPDATE:-0}" == "1" && -d "$SRC_DIR/.git" ]]; then
  owner=$(stat -c '%U' "$SRC_DIR")
  log "Pulling latest changes in $SRC_DIR"
  if [[ "$owner" != "root" ]] && command -v runuser >/dev/null; then
    runuser -u "$owner" -- git -C "$SRC_DIR" pull --ff-only || log "git pull failed; building current checkout"
  else
    git -c safe.directory="$SRC_DIR" -C "$SRC_DIR" pull --ff-only || log "git pull failed; building current checkout"
  fi
fi

# Fingerprint everything that affects the build
hash=$(
  cd "$SRC_DIR" &&
    find package.json package-lock.json server/package.json server/src web/package.json web/index.html \
      web/vite.config.ts web/tsconfig.json web/src web/public -type f -print0 2>/dev/null |
    sort -z | xargs -0 sha256sum | sha256sum | cut -d' ' -f1
)

if [[ "${FORCE_BUILD:-0}" != "1" && -f "$STAMP" && "$(cat "$STAMP")" == "$hash" && -f "$APP_DIR/web/dist/index.html" ]]; then
  log "Up to date ($hash)"
  exit 0
fi

if [[ "$(realpath "$SRC_DIR")" != "$(realpath -m "$APP_DIR")" ]]; then
  log "Syncing $SRC_DIR -> $APP_DIR"
  mkdir -p "$APP_DIR"
  if command -v rsync >/dev/null 2>&1; then
    rsync -a --delete --exclude node_modules --exclude .git --exclude 'web/dist' --exclude .env --exclude .build-stamp "$SRC_DIR/" "$APP_DIR/"
  else
    rm -rf "$APP_DIR/web/src" "$APP_DIR/server/src"
    (cd "$SRC_DIR" && tar --exclude=node_modules --exclude=.git --exclude=web/dist --exclude=.env -cf - .) | (cd "$APP_DIR" && tar -xf -)
  fi
fi

log "Installing dependencies and building (this can take a minute)"
cd "$APP_DIR"
# The service sets NODE_ENV=production, but building needs the dev dependencies (vite, typescript)
export NODE_ENV=development
export HOME=${HOME:-/root}
# If a rebuild fails while an older build exists, keep serving the old one instead of failing startup
if [[ -f "$APP_DIR/web/dist/index.html" && "${FORCE_BUILD:-0}" != "1" ]]; then
  cp -a "$APP_DIR/web/dist" "/tmp/invidioustube-dist.bak" 2>/dev/null || true
  trap 'rc=$?; if [[ $rc -ne 0 ]]; then log "Build failed (exit $rc); keeping the previous build"; rm -rf "$APP_DIR/web/dist"; mv /tmp/invidioustube-dist.bak "$APP_DIR/web/dist" 2>/dev/null; exit 0; fi; rm -rf /tmp/invidioustube-dist.bak' EXIT
fi
# When building inside the user's own checkout, build as its owner so the files stay theirs
as_owner=()
owner=$(stat -c '%U' "$APP_DIR")
if [[ "$(realpath "$SRC_DIR")" == "$(realpath -m "$APP_DIR")" && "$owner" != "root" ]] && command -v runuser >/dev/null; then
  as_owner=(runuser -u "$owner" --)
fi
"${as_owner[@]}" npm ci --include=dev --no-audit --no-fund || "${as_owner[@]}" npm install --include=dev --no-audit --no-fund
rm -rf web/dist
"${as_owner[@]}" npm run build
echo "$hash" > "$STAMP"
if [[ ${#as_owner[@]} -eq 0 && "$owner" != "root" || "$(realpath "$SRC_DIR")" != "$(realpath -m "$APP_DIR")" ]]; then
  if id -u invidioustube >/dev/null 2>&1; then chown -R invidioustube:invidioustube "$APP_DIR"; fi
fi
log "Build complete ($hash)"
