#!/usr/bin/env bash
# Rebuilds InvidiousTube from a source checkout and restarts the service.
#   cd /path/to/InvidiousTube && git pull && sudo ./deploy/update.sh
set -euo pipefail
SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [[ "$SRC_DIR" == "/opt/invidioustube" ]]; then
  echo "Run this from your source checkout (e.g. ~/InvidiousTube), not from /opt/invidioustube." >&2
  exit 1
fi
exec "$SRC_DIR/deploy/install.sh"
