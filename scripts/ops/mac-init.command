#!/usr/bin/env bash
set -euo pipefail

TARGET="${OPS_SSH_TARGET:-}"
REMOTE_DIR="${OPS_REMOTE_APP_DIR:-/opt/ai-seed-project}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

if [ -z "$TARGET" ]; then
  echo "请先设置 OPS_SSH_TARGET，例如 root@1.2.3.4"
  echo "本地脚本路径：$SCRIPT_DIR"
  exit 1
fi

ssh "$TARGET" "cd '$REMOTE_DIR' && bash scripts/ops/bootstrap-server.sh"
