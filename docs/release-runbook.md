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
- `FEISHU_LEARNER_HOME_URL`
- `FEISHU_OPERATOR_HOME_DOC_TOKEN`
- `FEISHU_OPERATOR_HOME_URL`
- `FEISHU_LEADERBOARD_URL`
- These links are consumed by `readFeishuConfig()` and appear in `GET /api/feishu/status`.
- The runtime still accepts the legacy `FEISHU_LEARNER_HOME_DOC_URL` and
  `FEISHU_OPERATOR_HOME_DOC_URL` keys for backward compatibility, but new releases should only
  publish the `*_HOME_URL` names above.

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
- The scoring runtime already reads these keys; when enabled it uses compatible model scoring
  and falls back to heuristic scoring if the LLM path is disabled or fails.

## Bring-Up Order

1. Fill `.env` from `.env.example`.
2. Run `npm install`.
3. Seed local demo data with `npm run seed:demo`.
4. Start the API with `npm run dev:api`.
5. Confirm `GET /api/health`.
6. Confirm `GET /api/feishu/status`.
7. Run `npm run bootstrap:feishu` if you need the repo to create the test chat and Base schema.
8. Restart the app after writing the bootstrap output back into `.env`.

## Local Verification Baseline

The current phase-one baseline has already been verified locally with:

- `npm test`
- `npm run build`
- `npm run seed:demo`
- `GET /api/health`
- `GET /api/feishu/status`

On a blank local `.env`, `/api/feishu/status` is expected to return `200` with:

- `enabled=false`
- `eventMode="disabled"`
- `baseEnabled=false`
- phase-one link fields present but not configured

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

## Live Domestic-Model Smoke

Run this only after the real domestic-model API key is available.

1. Fill the provider-neutral runtime keys:
   - `LLM_ENABLED=true`
   - `LLM_PROVIDER=aliyun`
   - `LLM_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1`
   - `LLM_API_KEY=<real_key>`
   - `LLM_TEXT_MODEL=qwen3-flash`
   - `LLM_FILE_MODEL=qwen-doc`
2. Restart the API.
3. Submit:
   - one normal PDF
   - one normal DOCX
   - one parse-failure style document
4. Verify:
   - normal documents score through `qwen3-flash`
   - parse-failure fallback goes through `qwen-doc`
   - SQLite and Base both receive the attempt and final session result
   - learner/operator one-click links still point to the live release surfaces

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
- The domestic-model smoke passes with the configured `LLM_*` provider-neutral keys.
- Base mirrors the raw event and score for that live document submission.
