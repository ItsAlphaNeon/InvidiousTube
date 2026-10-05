#!/usr/bin/env bash
# InvidiousTube installer for a Debian/Ubuntu LXC container.
#
# Run from a checkout of this repository as root:
#   sudo ./deploy/install.sh
#
# Optional environment overrides (otherwise you'll be asked):
#   INVIDIOUS_URL=http://192.168.1.113:3000 COMPANION_URL=http://192.168.1.113:8282 PORT=8080 sudo -E ./deploy/install.sh
set -euo pipefail

APP_DIR=/opt/invidioustube
ENV_FILE=/etc/invidioustube.env
SERVICE=invidioustube
NODE_MAJOR=22
SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ $EUID -ne 0 ]]; then
  echo "Please run as root (sudo $0)" >&2
  exit 1
fi

say() { printf '\n\033[1;31m▶\033[0m %s\n' "$*"; }

# ------------------------------------------------------------------ Node.js
need_node=1
if command -v node >/dev/null 2>&1; then
  cur=$(node -p 'process.versions.node.split(".")[0]')
  if (( cur >= NODE_MAJOR )); then need_node=0; fi
fi
if (( need_node )); then
  say "Installing Node.js ${NODE_MAJOR}.x"
  apt-get update
  apt-get install -y ca-certificates curl gnupg
  mkdir -p /etc/apt/keyrings
  curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor --yes -o /etc/apt/keyrings/nodesource.gpg
  echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_${NODE_MAJOR}.x nodistro main" > /etc/apt/sources.list.d/nodesource.list
  apt-get update
  apt-get install -y nodejs
fi
echo "Node $(node -v), npm $(npm -v)"

# ------------------------------------------------------------------ user + files
if ! id -u invidioustube >/dev/null 2>&1; then
  say "Creating system user 'invidioustube'"
  useradd --system --home "$APP_DIR" --shell /usr/sbin/nologin invidioustube
fi

say "Building InvidiousTube from $SRC_DIR"
FORCE_BUILD=1 SOURCE_DIR="$SRC_DIR" AUTO_UPDATE=0 bash "$SRC_DIR/deploy/build.sh"

# ------------------------------------------------------------------ configuration
if [[ ! -f "$ENV_FILE" ]]; then
  say "Creating $ENV_FILE"
  INVIDIOUS_URL=${INVIDIOUS_URL:-}
  COMPANION_URL=${COMPANION_URL:-}
  PORT=${PORT:-8080}
  if [[ -z "$INVIDIOUS_URL" ]]; then read -rp "Invidious URL (e.g. http://192.168.1.113:3000): " INVIDIOUS_URL; fi
  if [[ -z "$COMPANION_URL" ]]; then read -rp "invidious-companion URL (e.g. http://192.168.1.113:8282): " COMPANION_URL; fi
  cat > "$ENV_FILE" <<EOF
PORT=${PORT}
HOST=0.0.0.0
INVIDIOUS_URL=${INVIDIOUS_URL}
COMPANION_URL=${COMPANION_URL}
ENABLE_SPONSORBLOCK=1
ENABLE_RYD=1
ENABLE_SHORTS_CHECK=1
# Set to 1 if you serve InvidiousTube over HTTPS through a reverse proxy
COOKIE_SECURE=0
# In-memory thumbnail cache size
IMAGE_CACHE_MB=256
# Git checkout the service rebuilds from at startup (after a git pull, just restart or reboot)
SOURCE_DIR=${SRC_DIR}
# Set to 1 to also run "git pull" in SOURCE_DIR on every start
AUTO_UPDATE=0
EOF
  chmod 640 "$ENV_FILE"
  chgrp invidioustube "$ENV_FILE"
else
  echo "Keeping existing $ENV_FILE"
  if ! grep -q '^SOURCE_DIR=' "$ENV_FILE"; then
    printf '\n# Git checkout the service rebuilds from at startup (after a git pull, just restart or reboot)\nSOURCE_DIR=%s\n# Set to 1 to also run "git pull" in SOURCE_DIR on every start\nAUTO_UPDATE=0\n' "$SRC_DIR" >> "$ENV_FILE"
    echo "Added SOURCE_DIR=$SRC_DIR to $ENV_FILE"
  fi
fi

# ------------------------------------------------------------------ systemd
say "Installing systemd service"
install -m 644 "$APP_DIR/deploy/invidioustube.service" /etc/systemd/system/${SERVICE}.service
systemctl daemon-reload
systemctl enable --now ${SERVICE}
systemctl restart ${SERVICE}
sleep 1
systemctl --no-pager --lines=5 status ${SERVICE} || true

PORT_NOW=$(grep -E '^PORT=' "$ENV_FILE" | cut -d= -f2)
IP=$(hostname -I 2>/dev/null | awk '{print $1}')
say "Done! Open http://${IP:-<container-ip>}:${PORT_NOW:-8080}"
echo "Config: $ENV_FILE   Logs: journalctl -u ${SERVICE} -f"
echo "Updating: git pull in $SRC_DIR, then reboot or 'sudo systemctl restart ${SERVICE}' (it rebuilds on start)."
