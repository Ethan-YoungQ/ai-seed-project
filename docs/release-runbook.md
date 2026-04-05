# Release Runbook

## Goal

Bring the project from a fresh checkout to a real Feishu acceptance run with a live group, a live Base, and a reproducible smoke-test path.

## Current State

- The repo already supports local API and web startup.
- The Feishu integration path is wired through long connection mode, bot message send, group message ingest, and Base sync.
- The only known external blocker is Feishu file-resource download permission for PDF/DOCX submissions.

## Commands

- `npm install` installs dependencies.
- `npm run dev` starts the API and web dev server together.
- `npm run dev:api` starts only the API.
- `npm run dev:web` starts only the frontend.
- `npm run seed:demo` loads demo camp/member data into SQLite.
- `npm run bootstrap:feishu` creates or binds the test Feishu chat and creates the Base schema.
- `npm run build` verifies the release build.
- `npm test` runs the test suite.

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

### Bootstrap Helpers

- `FEISHU_TEST_CAMP_ID`
- `FEISHU_TEST_CHAT_ID`
- `FEISHU_TEST_CHAT_NAME`
- `FEISHU_TEST_CHAT_OWNER_OPEN_ID`
- `FEISHU_TEST_CHAT_MEMBER_OPEN_IDS`
- `FEISHU_BASE_NAME`

## Feishu Console Setup

1. Create a self-built Feishu app and enable the bot capability.
2. Subscribe to `im.message.receive_v1`.
3. Grant the permissions used by the code paths in this repo:
   - message send
   - message list/read
   - chat search and chat create
   - file download for message attachments
   - Base create, table create, and record read/write
4. Add the bot to the acceptance group that will be used for live testing.
5. If the group is newly created, keep the owner as a real user and add the bot after the group exists.
6. Create the Feishu Base app and capture the app token plus table IDs.

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
4. Send a real text submission that matches the scoring rules, for example a message with `#HW01 #作业提交`.
5. Check `GET /api/feishu/status` and confirm the inbound message fields update.
6. Check `GET /api/operator/submissions?campId=<camp-id>` and `GET /api/public-board?campId=<camp-id>`.
7. Trigger an announcement with `POST /api/announcements/run`.
8. Confirm the announcement job is recorded and, if `FEISHU_BOT_CHAT_ID` is set, the bot posts the summary into the group.
9. Send a real PDF or DOCX submission only after the file-download permission has been granted.

## Known External Blocker

The file-submission path still depends on Feishu being able to download the attachment bytes from the message file API. If that permission is missing, the app can still accept text submissions, but file submissions will stop at document parsing and will be marked as failed.

Symptoms to expect when the blocker is still present:

- `GET /api/feishu/status` shows the base readiness fields as configured, but file-based acceptance does not complete.
- `lastNormalizedMessage.documentParseStatus` becomes `failed`.
- The parse reason points at the file download call path.
- The downstream score stays on the pending-review path instead of completing as a normal parsed file submission.

## Failure Entry Points

- `GET /api/feishu/status` for readiness and probe data.
- `lastInboundReason` and `lastInboundError` from the same status endpoint.
- `lastNormalizedMessage.documentParseStatus` for file-submission parse failures.
- `src/app.ts` for inbound message enrichment and status reporting.
- `src/services/feishu/client.ts` for Feishu API calls, including file download.
- `src/services/feishu/bootstrap.ts` for chat and Base bootstrap failures.

## Exit Criteria

The release is ready for sign-off when:

- `npm run build` passes.
- `npm test` passes.
- `GET /api/feishu/status` shows valid credentials, long connection mode, bot chat binding, and Base readiness.
- A live Feishu bot test message succeeds.
- A live text submission in the real group is accepted and scored.
- The only remaining gap is the file-resource download permission, and that is explicitly called out in the handoff.
