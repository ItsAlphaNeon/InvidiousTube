#!/usr/bin/env bash
# Pulls the latest code and restarts the service (which rebuilds on start).
# Equivalent to: git pull && sudo systemctl restart invidioustube
set -euo pipefail
SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
git -C "$SRC_DIR" pull --ff-only || true
# Reinstall the unit file in case it changed, then restart (ExecStartPre rebuilds)
install -m 644 "$SRC_DIR/deploy/invidioustube.service" /etc/systemd/system/invidioustube.service
systemctl daemon-reload
systemctl restart invidioustube
systemctl --no-pager --lines=5 status invidioustube || true
