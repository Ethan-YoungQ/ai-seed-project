#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
APP_DIR="${APP_DIR:-$ROOT_DIR}"
DATA_DIR="${DATA_DIR:-$APP_DIR/data}"
BACKUP_DIR="${BACKUP_DIR:-$APP_DIR/backups}"
DB_PATH="${DB_PATH:-$DATA_DIR/app.db}"
STAMP="$(date +%Y%m%d-%H%M%S)"

mkdir -p "$BACKUP_DIR"

if [ ! -f "$DB_PATH" ]; then
  echo "数据库不存在：$DB_PATH"
  exit 0
fi

tar -czf "$BACKUP_DIR/app-db-$STAMP.tgz" -C "$DATA_DIR" "$(basename "$DB_PATH")"
echo "backup saved to $BACKUP_DIR/app-db-$STAMP.tgz"
