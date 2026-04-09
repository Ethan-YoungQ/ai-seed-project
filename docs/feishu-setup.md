# Feishu Setup

Phase one uses a Feishu-native delivery surface with an Aliyun always-on backend.
The official user-facing path is:

- Learner entry in Feishu knowledge base / document homepage
- Ranking and ops views in Feishu Base
- Bot announcements and mirrored snapshots in Feishu

The standalone web UI and `/operator` routes remain engineering surfaces and are not the phase-one sign-off target.

## What To Configure

1. Create a self-built Feishu app.
2. Enable the bot capability.
3. Subscribe to `im.message.receive_v1`.
4. Fill in the Feishu credentials in `.env`:
   - `FEISHU_APP_ID`
   - `FEISHU_APP_SECRET`
   - `FEISHU_EVENT_MODE=long_connection`
   - `FEISHU_VERIFICATION_TOKEN`
   - `FEISHU_ENCRYPT_KEY`
5. Bind the bot to the live acceptance group and set:
   - `FEISHU_BOT_CHAT_ID`
   - `FEISHU_BOT_RECEIVE_ID_TYPE=chat_id`
6. Create the Feishu Base app and write the token plus table IDs into:
   - `FEISHU_BASE_APP_TOKEN`
   - `FEISHU_BASE_MEMBERS_TABLE`
   - `FEISHU_BASE_RAW_EVENTS_TABLE`
   - `FEISHU_BASE_SCORES_TABLE`
   - `FEISHU_BASE_WARNINGS_TABLE`
   - `FEISHU_BASE_SNAPSHOTS_TABLE`
7. Reserve the phase-one learner and operator homepage entry placeholders for later Feishu homepage rollout:
   - `FEISHU_LEARNER_HOME_DOC_TOKEN`
   - `FEISHU_LEARNER_HOME_URL`
   - `FEISHU_OPERATOR_HOME_DOC_TOKEN`
   - `FEISHU_OPERATOR_HOME_URL`
   - `FEISHU_LEADERBOARD_URL`
   These links are consumed by `readFeishuConfig()` and surface in `/api/feishu/status`.
   For backward compatibility, the runtime still accepts the legacy
   `FEISHU_LEARNER_HOME_DOC_URL` and `FEISHU_OPERATOR_HOME_DOC_URL` keys, but new environments
   should use the `*_HOME_URL` names shown above.
8. Set the provider-neutral LLM contract in `.env`:
   - `LLM_ENABLED=true`
   - `LLM_PROVIDER=glm`
   - `LLM_BASE_URL=https://open.bigmodel.cn/api/paas/v4`
   - `LLM_API_KEY`
   - `LLM_TEXT_MODEL=glm-4.7`
   - `LLM_FILE_MODEL`
   - `LLM_FILE_EXTRACTOR=glm_file_parser`
   - `LLM_FILE_PARSER_TOOL_TYPE=lite`
   - `LLM_TIMEOUT_MS`
   - `LLM_MAX_INPUT_CHARS`
   - `LLM_CONCURRENCY`
   The current release path uses GLM-compatible chat scoring and GLM file parser fallback.
   If the LLM path is disabled or fails, the scoring runtime still falls back to heuristics.

Use [`.env.example`](../.env.example) as the source of truth for the current variable set.

## Local Checks

- `npm run dev` starts the API and the web preview server together for engineering use.
- `GET /api/health` confirms the API process is alive.
- `GET /api/feishu/status` reports whether credentials, bot chat binding, long connection mode,
  Base tables, and inbound diagnostics are ready.
- `POST /api/feishu/send-test` verifies the bot can send a message to the configured chat.
- A new PDF or DOCX sent into the bound group should drive:
  - `lastNormalizedMessage.messageType=file`
  - `lastNormalizedMessage.documentParseStatus=parsed`
  - `lastNormalizedMessage.documentTextLength > 0`

## Where To Go Next

- [Release runbook](./release-runbook.md)
- [Smoke test checklist](./release-smoke-tests.md)
- [Next-thread handoff](./handoffs/2026-04-06-next-thread-handoff.md)
