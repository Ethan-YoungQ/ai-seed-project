# Release Runbook

## Goal

Bring the project from a fresh checkout to the Feishu-native phase-one release path:
Feishu knowledge base / document homepage for learners, Feishu Base for ranking and ops,
and an Aliyun always-on backend for scoring and sync.

## Current State

- The backend runs locally with Fastify and SQLite.
- Feishu inbound ingest, file download, document parsing, bot send, and Base sync are wired.
- The phase-one official delivery surfaces are Feishu native surfaces and Base views.
- The standalone web board and `/operator` routes are available for engineering diagnostics,
  but they are not the formal phase-one acceptance target.

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

Start from [`.env.example`](../.env.example) and fill in the live Feishu values before
connecting the tenant.

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

### Reserved For Feishu Native Entry Surfaces

- `FEISHU_LEARNER_HOME_DOC_TOKEN`
- `FEISHU_LEARNER_HOME_DOC_URL`
- `FEISHU_OPERATOR_HOME_DOC_TOKEN`
- `FEISHU_OPERATOR_HOME_DOC_URL`
- These are placeholders for the later Feishu homepage rollout and are not consumed by the current runtime.

### Reserved For Provider-Neutral LLM Routing

- `LLM_ENABLED=true`
- `LLM_PROVIDER=aliyun`
- `LLM_BASE_URL`
- `LLM_API_KEY`
- `LLM_TEXT_MODEL=qwen3-flash`
- `LLM_FILE_MODEL=qwen-doc`
- `LLM_TIMEOUT_MS`
- `LLM_MAX_INPUT_CHARS`
- `LLM_CONCURRENCY`
- These keys freeze the phase-one config contract for later runtime integration and are not yet read by scoring.

## Bring-Up Order

1. Fill `.env` from `.env.example`.
2. Run `npm install`.
3. Seed local demo data with `npm run seed:demo`.
4. Start the app with `npm run dev`.
5. Confirm `GET /api/health`.
6. Confirm `GET /api/feishu/status`.
7. Run `npm run bootstrap:feishu` if you need the repo to create the test chat and Base schema.
8. Restart the app after writing the bootstrap output back into `.env`.

## Real Group Acceptance Flow

1. Open the live Feishu acceptance group and the Feishu native entry surfaces.
2. Send a test bot message with `POST /api/feishu/send-test`.
3. Verify the bot message appears in the group.
4. Send a real PDF or DOCX submission in the group. Tags are optional in phase one.
5. Check `GET /api/feishu/status` and confirm:
   - `lastInboundEventAt` updates
   - `lastNormalizedMessage.messageType=file`
   - `lastNormalizedMessage.documentParseStatus=parsed`
   - `lastNormalizedMessage.documentTextLength > 0`
6. Check the Feishu Base raw-events and scores tables and confirm the document submission is mirrored.
7. Trigger an announcement with `POST /api/announcements/run`.
8. Confirm the announcement job is recorded and the bot posts the summary into the group.

## Failure Entry Points

- `GET /api/health`
- `GET /api/feishu/status`
- `src/app.ts`
- `src/services/feishu/client.ts`
- `src/services/documents/extract-text.ts`
- `src/services/feishu/base-sync.ts`

## Exit Criteria

The release is ready for sign-off when:

- `npm run build` passes.
- `npm test` passes.
- `GET /api/feishu/status` shows valid credentials, long connection mode, bot chat binding,
  and Base readiness.
- A live Feishu bot test message succeeds.
- A live PDF or DOCX submission in the real group is parsed, scored, and persisted.
- Base mirrors the raw event and score for that live document submission.
