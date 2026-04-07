#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
APP_DIR="${APP_DIR:-$ROOT_DIR}"
SERVICE_NAME="${SERVICE_NAME:-ai-seed-project}"
NODE_BIN="${NODE_BIN:-node}"
NPM_BIN="${NPM_BIN:-npm}"
SYSTEMD_DIR="${SYSTEMD_DIR:-/etc/systemd/system}"
SERVICE_FILE="${SERVICE_FILE:-$SYSTEMD_DIR/$SERVICE_NAME.service}"
ENV_FILE="${ENV_FILE:-$APP_DIR/.env}"

cd "$APP_DIR"

mkdir -p "$APP_DIR/data" "$APP_DIR/backups"

if [ -f "$APP_DIR/package-lock.json" ]; then
  "$NPM_BIN" ci
else
  "$NPM_BIN" install
fi

"$NPM_BIN" run build

if [ -f "$ROOT_DIR/deploy/systemd/ai-seed-project.service" ]; then
  if [ "$(id -u)" -eq 0 ]; then
    install -Dm644 "$ROOT_DIR/deploy/systemd/ai-seed-project.service" "$SERVICE_FILE"
    systemctl daemon-reload
    systemctl enable "$SERVICE_NAME"
    systemctl restart "$SERVICE_NAME"
  elif command -v sudo >/dev/null 2>&1; then
    sudo install -Dm644 "$ROOT_DIR/deploy/systemd/ai-seed-project.service" "$SERVICE_FILE"
    sudo systemctl daemon-reload
    sudo systemctl enable "$SERVICE_NAME"
    sudo systemctl restart "$SERVICE_NAME"
  else
    echo "缺少 root/sudo，已完成构建，但未安装 systemd 服务。"
    echo "请手动执行：install -Dm644 \"$ROOT_DIR/deploy/systemd/ai-seed-project.service\" \"$SERVICE_FILE\""
  fi
fi

if [ -f "$ENV_FILE" ]; then
  echo "已检测到环境文件：$ENV_FILE"
fi

echo "bootstrap completed"
