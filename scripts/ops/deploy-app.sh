#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
APP_DIR="${APP_DIR:-$ROOT_DIR}"
SERVICE_NAME="${SERVICE_NAME:-ai-seed-project}"
NPM_BIN="${NPM_BIN:-npm}"
AI_BOOT_ENGINE_MODE="${AI_BOOT_ENGINE_MODE:-}"
AI_BOOT_ALLOW_GROUP_PRAISE="${AI_BOOT_ALLOW_GROUP_PRAISE:-}"
AI_BOOT_ALLOW_DAILY_DIGEST="${AI_BOOT_ALLOW_DAILY_DIGEST:-}"

cd "$APP_DIR"

echo "AI Boot deploy context:"
echo "  AI_BOOT_ENGINE_MODE=${AI_BOOT_ENGINE_MODE:-<unset>}"
echo "  AI_BOOT_ALLOW_GROUP_PRAISE=${AI_BOOT_ALLOW_GROUP_PRAISE:-<unset>}"
echo "  AI_BOOT_ALLOW_DAILY_DIGEST=${AI_BOOT_ALLOW_DAILY_DIGEST:-<unset>}"
echo "  This script does not change production AI Boot mode."
echo "  For shadow deployment, follow the runbook and verify v3_shadow health before live changes."

if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  git pull --ff-only || true
fi

if [ -f "$APP_DIR/package-lock.json" ]; then
  "$NPM_BIN" ci
else
  "$NPM_BIN" install
fi

"$NPM_BIN" run build
"$NPM_BIN" run seed:ensure

if [ "$(id -u)" -eq 0 ]; then
  systemctl restart "$SERVICE_NAME"
elif command -v sudo >/dev/null 2>&1; then
  sudo systemctl restart "$SERVICE_NAME"
fi

echo "deploy completed"
