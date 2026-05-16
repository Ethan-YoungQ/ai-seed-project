#!/usr/bin/env bash
set -euo pipefail

PORT="${PORT:-3000}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:${PORT}/api/health}"
FEISHU_STATUS_URL="${FEISHU_STATUS_URL:-http://127.0.0.1:${PORT}/api/feishu/status}"

fetch_url() {
  local url="$1"

  if command -v curl >/dev/null 2>&1; then
    curl -fsS "$url"
  else
    TARGET_URL="$url" node --input-type=module -e 'const res = await fetch(process.env.TARGET_URL); if (!res.ok) process.exit(1); console.log(await res.text());'
  fi
}

fetch_url "$HEALTH_URL"
echo

if status_json="$(fetch_url "$FEISHU_STATUS_URL" 2>/dev/null)"; then
  STATUS_JSON="$status_json" node --input-type=module -e '
const status = JSON.parse(process.env.STATUS_JSON ?? "{}");
const aiBoot = status.aiBoot;
if (aiBoot) {
  console.log(`aiBoot.engineMode=${aiBoot.engineMode ?? "unknown"}`);
  console.log(`aiBoot.allowGroupPraise=${String(Boolean(aiBoot.allowGroupPraise))}`);
  console.log(`aiBoot.allowDailyDigest=${String(Boolean(aiBoot.allowDailyDigest))}`);
}
' || true
else
  echo "AI Boot status unavailable at $FEISHU_STATUS_URL" >&2
fi
