#!/usr/bin/env bash
set -euo pipefail

TARGET="${OPS_SSH_TARGET:-}"
REMOTE_DIR="${OPS_REMOTE_APP_DIR:-/opt/ai-seed-project}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
TMP_DIR="${TMPDIR:-/tmp}/ai-seed-project"
ARCHIVE_FILE="$TMP_DIR/phase-one-init.tar"

if [ -z "$TARGET" ]; then
  echo "请先设置 OPS_SSH_TARGET，例如 root@1.2.3.4"
  echo "本地脚本路径：$SCRIPT_DIR"
  exit 1
fi

mkdir -p "$TMP_DIR"
git -C "$REPO_ROOT" archive --format=tar HEAD -o "$ARCHIVE_FILE"
ssh "$TARGET" "mkdir -p '$REMOTE_DIR'"
scp "$ARCHIVE_FILE" "$TARGET:$REMOTE_DIR/phase-one-init.tar"
ssh "$TARGET" "cd '$REMOTE_DIR' && tar -xf phase-one-init.tar && rm -f phase-one-init.tar && bash scripts/ops/bootstrap-server.sh"
