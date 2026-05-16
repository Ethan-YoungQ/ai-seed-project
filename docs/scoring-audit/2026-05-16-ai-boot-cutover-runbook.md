# AI Boot Production Shadow Cutover Runbook

Date: 2026-05-16

Scope: deploy AI Boot v3 in production shadow mode without changing existing production score behavior. This runbook is documentation only; do not SSH or deploy from local automation while preparing the cutover.

## Local preflight

Run this exact local sequence before touching the server:

```bash
npm run build
npm test
npm run ai-boot:freeze-legacy
npm run ai-boot:cutover-check
```

Record:

- Local git SHA:
- Operator:
- Preflight timestamp:

## Server shadow sequence

Run this exact server sequence during the deployment window:

```bash
cd /opt/ai-seed-project
./scripts/ops/backup-db.sh
AI_BOOT_ENGINE_MODE=v3_shadow systemctl restart ai-seed-project.service
curl -fsS http://127.0.0.1:3001/api/health
curl -fsS http://127.0.0.1:3001/api/feishu/status
```

Record before and after restart:

- DB backup path:
- server git SHA:
- engine mode:
- `/api/health` response:
- `/api/feishu/status` response:

## Shadow mode expectations

In `v3_shadow` mode:

- v3 events and shadow score events are created;
- no v3 group praise is sent;
- existing production score behavior remains unchanged;
- shadow replay metrics are available for review.

Review shadow replay metrics before considering any live-mode follow-up. Do not enable group praise or daily digest as part of this shadow deployment.

## 24-hour observation window

Keep `v3_shadow` mode under observation for at least 24 hours before considering live-mode changes. During that 24-hour window, acceptance requires:

- v3 events and shadow score events are created;
- no v3 group praise is sent;
- existing production score behavior remains unchanged;
- shadow replay metrics are available for review.

## Rollback

If health checks fail, Feishu status does not report the expected mode, or production score behavior changes unexpectedly, return the service to legacy mode and restart:

```bash
AI_BOOT_ENGINE_MODE=legacy systemctl restart ai-seed-project.service
curl -fsS http://127.0.0.1:3001/api/health
curl -fsS http://127.0.0.1:3001/api/feishu/status
```

Record:

- Rollback timestamp:
- Rollback operator:
- DB backup path used for recovery decision:
- server git SHA:
- engine mode after rollback:
- Reason for rollback:

Restore from the recorded DB backup path only if application rollback is insufficient and the incident owner approves data restoration.
