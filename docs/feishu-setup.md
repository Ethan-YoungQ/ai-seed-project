# Feishu Setup

This project can run in local-only mode, but a real Feishu acceptance run needs the app credentials, event subscription, bot chat binding, and Base tables from the live tenant.

## What To Configure

1. Create a self-built Feishu app.
2. Enable the bot capability.
3. Subscribe to `im.message.receive_v1`.
4. Fill in `FEISHU_APP_ID`, `FEISHU_APP_SECRET`, `FEISHU_VERIFICATION_TOKEN`, and `FEISHU_ENCRYPT_KEY` in `.env`.
5. Set `FEISHU_EVENT_MODE=long_connection` for the live integration.
6. Grant the app the capabilities it actually uses:
   - message send
   - group message list/read
   - chat search and chat create
   - file download for message attachments
   - Base create, table create, and record read/write
7. Add the bot to the real acceptance group and write that chat ID to `FEISHU_BOT_CHAT_ID`.
8. Create the Feishu Base app and put the generated app token and table IDs into the `FEISHU_BASE_*` variables.

## Environment Variables

Use [`.env.example`](../.env.example) as the source of truth for the current variable set. The most important values for live Feishu are:

- `FEISHU_APP_ID`
- `FEISHU_APP_SECRET`
- `FEISHU_EVENT_MODE=long_connection`
- `FEISHU_BOT_CHAT_ID`
- `FEISHU_BASE_ENABLED=true`
- `FEISHU_BASE_APP_TOKEN`
- `FEISHU_BASE_MEMBERS_TABLE`
- `FEISHU_BASE_RAW_EVENTS_TABLE`
- `FEISHU_BASE_SCORES_TABLE`
- `FEISHU_BASE_WARNINGS_TABLE`
- `FEISHU_BASE_SNAPSHOTS_TABLE`

## Local Checks

- `npm run dev` starts the API and web app together.
- `GET /api/health` confirms the API process is alive.
- `GET /api/feishu/status` reports whether credentials, bot chat binding, long connection mode, and Base tables are ready.
- `POST /api/feishu/send-test` verifies the bot can send a message to the configured chat.

## Where To Go Next

- [Release runbook](./release-runbook.md)
- [Smoke test checklist](./release-smoke-tests.md)
- [Thread handoff from 2026-04-05](./feishu-thread-handoff-2026-04-05.md)
