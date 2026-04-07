#!/usr/bin/env bash
set -euo pipefail

PORT="${PORT:-3000}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:${PORT}/api/health}"

if command -v curl >/dev/null 2>&1; then
  curl -fsS "$HEALTH_URL"
else
  node --input-type=module -e "const res = await fetch(process.env.HEALTH_URL ?? '${HEALTH_URL}'); if (!res.ok) process.exit(1); console.log(await res.text());"
fi
