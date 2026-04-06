# Release Runbook

## Goal

Bring the project from a fresh checkout to a real Feishu acceptance run with a live group, a live Base, and a reproducible smoke-test path.

## Current State

- The repo supports local API and web startup.
- The Feishu integration path is wired through long connection mode, bot message send, group message ingest, file download, document parsing, and Base sync.
- The current production submission path is document-first: learners send PDF or DOCX files in the group, and tags are optional when there is a single active biweekly session window.

## Commands

- `npm install`
- `npm run dev`
- `npm run dev:api`
- `npm run dev:web`
- `npm run seed:demo`
- `npm run bootstrap:feishu`
- `npm run build`
- `npm test`

## Environment Variables

Start from [`.env.example`](../.env.example) and fill in the real Feishu values before connecting the live tenant.

### Required For Live Feishu

- `FEISHU_APP_ID`
- `FEISHU_APP_SECRET`
- `FEISHU_EVENT_MODE=long_connection`
- `FEISHU_VERIFICATION_TOKEN`
- `FEISHU_ENCRYPT_KEY`
- `FEISHU_BOT_CHAT_ID`
- `FEISHU_BOT_RECEIVE_ID_TYPE=chat_id`

### Required For Base Sync

- `FEISHU_BASE_ENABLED=true`
- `FEISHU_BASE_APP_TOKEN`
- `FEISHU_BASE_MEMBERS_TABLE`
- `FEISHU_BASE_RAW_EVENTS_TABLE`
- `FEISHU_BASE_SCORES_TABLE`
- `FEISHU_BASE_WARNINGS_TABLE`
- `FEISHU_BASE_SNAPSHOTS_TABLE`

## Feishu Console Setup

1. Create a self-built Feishu app and enable the bot capability.
2. Subscribe to `im.message.receive_v1`.
3. Grant the permissions used by the code paths in this repo:
   - message send
   - group message list/read
   - chat search and chat create
   - file download for message attachments
   - Base create, table create, and record read/write
4. Add the bot to the acceptance group that will be used for live testing.
5. Create the Feishu Base app and capture the app token plus table IDs.

## Recommended Bring-Up Order

1. Fill `.env` from `.env.example`.
2. Run `npm install`.
3. Seed local demo data with `npm run seed:demo`.
4. Start the app with `npm run dev`.
5. Confirm `GET /api/health`.
6. Confirm `GET /api/feishu/status`.
7. Run `npm run bootstrap:feishu` if you need the repo to create the test chat and Base schema.
8. Restart the app after writing the bootstrap output back into `.env`.

## Real Group Acceptance Flow

1. Open the real Feishu acceptance group.
2. Send a test bot message with `POST /api/feishu/send-test`.
3. Verify the bot message appears in the group.
4. Send a real PDF or DOCX submission in the group. Tags are optional for the current document-first workflow.
5. Check `GET /api/feishu/status` and confirm:
   - `lastInboundEventAt` updates
   - `lastNormalizedMessage.messageType=file`
   - `lastNormalizedMessage.documentParseStatus=parsed`
   - `lastNormalizedMessage.documentTextLength > 0`
6. Check `GET /api/operator/submissions?campId=<camp-id>` and confirm the candidate is scored.
7. Check `GET /api/public-board?campId=<camp-id>` and confirm the score is visible for members who are participants and not excluded from the board.
8. Trigger an announcement with `POST /api/announcements/run`.
9. Confirm the announcement job is recorded and the bot posts the summary into the group.
10. Confirm the new raw event and score are mirrored into Feishu Base.

## Failure Entry Points

- `GET /api/feishu/status`
- `GET /api/operator/submissions`
- `GET /api/public-board`
- `src/app.ts`
- `src/services/feishu/client.ts`
- `src/services/documents/extract-text.ts`

## Exit Criteria

The release is ready for sign-off when:

- `npm run build` passes.
- `npm test` passes.
- `GET /api/feishu/status` shows valid credentials, long connection mode, bot chat binding, and Base readiness.
- A live Feishu bot test message succeeds.
- A live PDF or DOCX submission in the real group is parsed, scored, and persisted.
- Base mirrors the raw event and score for that live document submission.
