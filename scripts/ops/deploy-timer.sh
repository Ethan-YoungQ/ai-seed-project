#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
UNIT_DIR="/etc/systemd/system"

cp "$SCRIPT_DIR/../../deploy/systemd/weekly-ranking.service" "$UNIT_DIR/"
cp "$SCRIPT_DIR/../../deploy/systemd/weekly-ranking.timer" "$UNIT_DIR/"

systemctl daemon-reload
systemctl enable weekly-ranking.timer
systemctl start weekly-ranking.timer

echo "Timer installed:"
systemctl list-timers weekly-ranking.timer --no-pager
