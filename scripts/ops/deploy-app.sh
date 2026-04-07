#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
APP_DIR="${APP_DIR:-$ROOT_DIR}"
SERVICE_NAME="${SERVICE_NAME:-ai-seed-project}"
NPM_BIN="${NPM_BIN:-npm}"

cd "$APP_DIR"

if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  git pull --ff-only || true
fi

if [ -f "$APP_DIR/package-lock.json" ]; then
  "$NPM_BIN" ci
else
  "$NPM_BIN" install
fi

"$NPM_BIN" run build

if [ "$(id -u)" -eq 0 ]; then
  systemctl restart "$SERVICE_NAME" || true
elif command -v sudo >/dev/null 2>&1; then
  sudo systemctl restart "$SERVICE_NAME" || true
fi

echo "deploy completed"
