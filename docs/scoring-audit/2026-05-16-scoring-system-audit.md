# 2026-05-16 Scoring System Audit

本审计以服务器运行态为准，GitHub/本地源码只作为对照。未写入密钥、open_id、群消息原文或学员原始提交内容。

## Ground Truth

- Server: `43.108.20.246`, service `ai-seed-project.service`, active.
- Runtime command: `PORT=3001 NODE_ENV=production /usr/bin/node /opt/ai-seed-project/dist/server.js`.
- Server git head: `fc1d515516788bca6b48100b03d298cc93f2bbb0`, tracked tree clean; only untracked `.backup-20260516/`.
- LLM runtime env: `LLM_PROVIDER=glm`, `LLM_TEXT_MODEL=glm-4.7`, `LLM_VISION_MODEL=glm-4.6v`, `LLM_TIMEOUT_MS=60000`, `LLM_CONCURRENCY=3`, `FEISHU_AUTO_REPLY_ENABLED=true`.
- Important drift: current running `dist` is not the same behavior as the TypeScript source build.
  - Local source build hash for `dist/services/feishu/message-commands.js`: `73eaf0c3634469f147711727d1cbc6b032b78f4bbd8c6234246cdb75a2355f4f`.
  - Server `.backup-20260516/message-commands.js` has the same hash as source build.
  - Current server `dist/services/feishu/message-commands.js` hash is `229fdf68c6e59bab505b2e34de760e19dd8da54049d5ac910f239ba3f14b1021`.
  - Current server `dist/app.js` does not wire `semanticScoring`; source build and backup do.
- Local source verification in the clean worktree:
  - `npm run build` passed.
  - `vitest` result: 721/735 tests passed, 14 failed. Failures are concentrated in operator cards, missing ops docs, env example contract, and board member detail fields; the scoring-related tests mostly pass against the source-build behavior, not the current hotfixed server behavior.
- Plan/spec hygiene:
  - Existing `docs/superpowers/plans/*` and `docs/superpowers/specs/*` are treated as historical references only.
  - New scoring audit material lives in `docs/scoring-audit/` to avoid mixing with older agent-generated plans.

## Production Data Snapshot

SQLite DB: `/opt/ai-seed-project/data/app.db`, read-only queries.

- `v2_scoring_item_events`: 306 total events.
- Status distribution: 93 approved, 212 rejected, 1 review_required.
- `v2_llm_scoring_tasks`: 29 succeeded, 2 failed, all using `glm/glm-4.7`.
- 24 events are `approved` even though the linked LLM task succeeded with `pass=false`.
  - H2: 18
  - C1: 4
  - C3: 2
- All 212 rejected events have `review_note IS NULL`, including likely cap-exceeded rows.
- Last 7 days logs: 35 semantic LLM failures, 25 proactive praise sends, 6 ChatBot replies. Most semantic failures were timeout/abort or rate limit.
- After the current server restart at `2026-05-16 22:12:40 +0800`, logs show 7 AutoCapture lines, 0 SemanticScoring lines, and 0 Praise lines. This confirms current runtime is the hotfixed non-semantic path.

## Current Runtime Behavior

Current server `dist/services/feishu/message-commands.js` is a hotfixed keyword path:

1. `@Bot` messages go to ChatBot and return without scoring.
2. Non-@ group messages run `needsSemanticScoring` only as a gate.
3. If gated in, `classifyMessage` keyword rules assign all applicable items.
4. Each accepted non-K1 item is immediately summarized to the group with a `✅ member labels` message.
5. For `needsLlm` items, the event can still be pending/reviewed by the LLM worker after the group notification has already been sent.

This means current runtime reduces the previous proactive-praise spam, but it still has two correctness risks:

- It can notify the group before the LLM final decision.
- It depends heavily on broad keywords such as "分享", "推荐", "好用", URL presence, image presence, and long text length.

## Source Build Behavior

The TypeScript source build (also backed up on server) contains a different semantic path:

- `src/app.ts` wires `semanticScoring` into message commands.
- `src/services/feishu/message-commands.ts` first ingests K1, then asynchronously runs `semanticClassifyAndIngest`.
- `semanticClassifyAndIngest` calls `multiScore(..., timeoutMs: 15000)`, ignoring server `LLM_TIMEOUT_MS=60000`.
- Accepted semantic items are counted immediately for proactive praise, before the downstream per-item LLM worker approves/rejects the event.
- On LLM failure, it falls back to the keyword classifier and can still praise.

This explains the observed pattern before the latest hotfix: semantic LLM aborts produced fallback scoring and praise; concurrent async tasks could send praise close together.

## Root Causes

### 1. Runtime drift is now a primary operational risk

The running server is not reproducible from git by `npm run build`. A normal deploy from current TypeScript source would re-enable the semantic/proactive-praise behavior in `.backup-20260516`, not the hotfixed current behavior.

### 2. Scoring has two conflicting judge layers

The source build has both:

- a unified semantic classifier over 9 items: `K3,K4,C1,C3,H2,H3,G1,G2,S1`;
- a per-item LLM worker only for 6 configured `needsLlm` items: `K3,K4,H2,C1,C3,G2`.

The definitions are not the same. `H3/G1/S1` can be returned by the semantic classifier, but are non-LLM direct-approved items in config. Meanwhile H2/C3 can be accepted for praise and then rejected or sent to manual review later.

### 3. Rules are too rigid for the product goal

Several rules encode task-form assumptions instead of operational-learning incentives:

- C3 requires a reusable prompt template. This makes "AI image sharing" or "experience sharing without prompt" look invalid even when it is useful learning behavior.
- H2 requires tool/task/result text and may reject image-only or artifact-first sharing.
- K3 requires a specific knowledge-summary shape and length.
- G2 requires link plus recommendation reason.

These are reasonable for formal assignments, but they are too narrow for "use leaderboard/scoring to motivate group interaction and AI learning".

### 4. Keyword rules are too broad when used as production scoring

The keyword classifier treats broad signals as scoring candidates:

- URL -> G2.
- Image -> H2.
- Text >= 50 chars with no other match -> K3.
- C1 keywords include generic words such as "分享", "推荐", "好用", "有意思".
- C3 keywords include "AI说", "我问AI", "我让AI", which can match ordinary discussion, not reusable prompt sharing.

In current runtime, this keyword path is the primary scorer.

### 5. H2/vision scoring is effectively not wired end to end

The code has `LLM_VISION_MODEL` and an `imageUrl` capability in `OpenAiCompatibleLlmScoringClient`, but the LLM worker calls `score(task.promptText, ...)` without passing `imageUrl`.

For card H2, `fileKey` is intended to be stored in event payload, but production `v2_scoring_item_events` has no `payload_json` column. The prompt also deliberately does not embed `fileKey`. Result: the worker often evaluates an H2 prompt with no actual image or text.

This matches DB evidence: 18 H2 events were approved while the LLM reason said the submission was empty or non-compliant.

### 6. Audit trail is incomplete

The domain ingestor tries to pass `reviewNote` and `payloadJson`, but repository/schema do not persist payload JSON and `insertScoringItemEvent` does not preserve the ingestor's cap-exceeded note. Result:

- rejected rows lose the reason;
- review queue lacks the original evidence payload;
- later manual/recovery changes are hard to distinguish from automated decisions unless `reviewed_by_op_id` was set.

### 7. K1 semantics are inconsistent

Code comments call K1 a daily check-in, but config caps it per period (`defaultScoreDelta=3`, `perPeriodCap=3`). The ingestor sourceRef is per message, not per day. Production has 162 rejected K1 rows, consistent with repeated attempts after the period cap is exhausted.

### 8. Praise anti-spam exists but is not wired

`chat-bot/excellence-gate.ts` has per-student/day, per-chat/hour, and cooldown logic, but no production code imports it. The active praise path uses a single global `lastPraiseAt`, updated only after send, so concurrent async praise sends can race. Logs show two praise sends in the same second before the current hotfix.

The praise prompt also contains examples that contradict product intent, including "快分享 prompt", which reinforces the rigid prompt-sharing bias.

## Model Assessment

The main failures are not explained primarily by weak model choice.

Facts:

- Server already uses `glm-4.7`, which Z.AI documents as a 200K-context text model with improved reasoning and conversational capability.
- Logs show many scoring failures are timeouts/rate limits from the application path, especially a hard-coded 15s semantic timeout.
- Vision model config exists, but image bytes/URLs are not passed to the worker, so changing `LLM_VISION_MODEL` alone would not fix image scoring.

Possible later model work:

- Keep `glm-4.7` until the scoring chain is deterministic and auditable.
- Evaluate `glm-5.1` on a labeled golden set for final scoring/praise quality before switching. Z.AI currently positions GLM-5.1 as its latest flagship foundation model for long-horizon/agentic tasks.
- For image/artifact scoring, first wire actual multimodal input; then compare `glm-4.6v`/available VLM options on image-heavy samples.

References:

- Z.AI GLM-4.7 docs: https://docs.z.ai/guides/llm/glm-4.7
- Z.AI GLM-5.1 docs: https://docs.z.ai/guides/llm/glm-5.1
- Z.AI GLM-4.6V docs: https://docs.z.ai/guides/vlm/glm-4.6v
