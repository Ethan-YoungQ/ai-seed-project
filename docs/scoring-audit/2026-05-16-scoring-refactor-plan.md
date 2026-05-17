# 2026-05-16 Scoring Refactor Plan

本计划放在 `docs/scoring-audit/`，不继续写入 `docs/superpowers/`，避免和旧 agent 生成的 plans/specs 混在一起。

## Product Goal

AI Boot should operate the Feishu group as an assistant and community operator. Scoring should motivate useful AI learning behaviors: interaction, experimentation, sharing artifacts, sharing experience, asking/answering questions, and completing camp tasks.

The scoring system should not require every useful share to include a prompt. Prompt sharing is valuable, but it should be one optional contribution type, not a hard gate for all AI practice.

## Phase 0 - Stabilize Runtime

1. Decide canonical runtime.
   - Option A: port the current server hotfix from `dist` back into TypeScript, then redeploy from source.
   - Option B: fix the TypeScript semantic path first, then deploy source.
   - Do not run a normal deploy before this is decided, because source build currently differs from production behavior.

2. Stop premature group notifications.
   - No group-facing score/praise message until final approved state.
   - Pending/review_required/rejected events should not produce "scored" language.
   - Current hotfix path's direct `✅ member labels` message should either be gated off or changed to a quiet internal record.

3. Preserve audit data.
   - Add/persist `payload_json` or a redacted evidence excerpt for scoring events.
   - Persist cap-exceeded and duplicate reasons in `review_note`.
   - Add `engine_version`, `ruleset_version`, `decision_source`, and operator/recovery reason for manual updates.

4. Fix K1 semantics.
   - If K1 is daily check-in: make cap window daily and sourceRef include `memberId + date + K1`.
   - If K1 is per-period activity: rename it and stop attempting it on every message after cap.

## Phase 1 - Redesign Rules Around Desired Behavior

Use behavior categories that map to the training camp objective:

- AI artifact/share: image, poster, workflow, app, document, analysis output, demo screenshot.
- AI practice reflection: what was tried, what worked, what failed, what was learned.
- Prompt/method sharing: prompt, workflow steps, reusable method, comparison of tools/settings.
- Resource recommendation: external AI resource with a reason or use case.
- Mutual help: answering, debugging, extending someone else's attempt.
- Formal task submission: quiz, homework, card submission, required camp artifacts.
- Participation: meaningful daily activity, reactions, follow-up questions.

Recommended scoring rule shape:

- One message produces one `ScoringDecision` envelope.
- The envelope has `shouldScore`, `primaryCategory`, optional `badges`, `scoreDelta`, `confidence`, `evidence`, and `replyPolicy`.
- Prompt is never mandatory except for the prompt/method category.
- Image/artifact-only shares can score if the artifact is visibly AI-related or context indicates AI usage; extra explanation can add confidence or bonus.
- Pure chat, pure thanks, pure forwarded link/file with no context, and duplicate/reposted content should not score.

## Phase 2 - Collapse Duplicate Judge Layers

Replace the current split between unified semantic classifier and per-item LLM worker with a single authoritative decision engine.

Pipeline:

1. Normalize message and attachments.
2. Deduplicate by `messageId + engineVersion`, and optionally by content hash for repeated files/images.
3. Run deterministic guards:
   - ignore operators/trainers for student scoring;
   - short trivial chat -> only participation if applicable;
   - known command/@Bot -> no auto scoring;
   - cap check before LLM if no score can be awarded.
4. Build one LLM scoring prompt with the full ruleset and examples.
5. Validate JSON schema.
6. Write event as approved/review_required/rejected with evidence.
7. Only after approved, update leaderboard and maybe notify.

If asynchronous LLM processing is needed, keep the event as `pending_candidate`, not "accepted", until final approval.

## Phase 3 - Notification And Praise Policy

Use a separate reply policy, not raw score delta:

- No notification for K1-only or cap-exceeded events.
- No notification for pending/review_required.
- Praise only for high-signal contributions, not every 3-point item.
- Wire `excellence-gate.ts` or an equivalent stateful limiter:
  - per student per day;
  - per chat per hour;
  - global cooldown reserved before send, not after send;
  - content/topic memory to avoid repeated templates.
- Remove praise examples that push "share prompt" as a default ask.
- Prefer concise specific praise: name the artifact/idea/result and one reason it helps the group.

## Phase 4 - Evaluation Harness

Before changing production scoring, create a small labeled dataset.

Data sources:

- recent Feishu group messages sampled from the current camp;
- existing scoring DB events;
- false-positive cases from approved events with `pass=false`;
- known image/artifact shares;
- no-score casual chat.

Labels:

- should score: yes/no;
- category;
- score band;
- should notify: yes/no;
- reviewer note.

Metrics:

- false positive rate;
- false negative rate;
- duplicate notification rate;
- review queue noise;
- average LLM latency/failure rate;
- number of group messages sent per day by bot.

Model comparison should happen here, not before:

- baseline `glm-4.7`;
- candidate `glm-5.1` for text scoring and praise;
- candidate VLM for images after actual image input is wired.

## Phase 5 - Deployment Sequence

1. Implement changes in TypeScript source only.
2. Add tests for:
   - image/artifact share without prompt should be scorable;
   - experience sharing without prompt should be scorable;
   - pure link without reason should not score G2;
   - pure image with no AI context should require review or no score;
   - pending/rejected events must not notify;
   - K1 daily/per-period semantics.
3. Build and run tests.
4. Deploy to server with DB backup.
5. Verify `/api/health`, `/api/feishu/status`, LLM worker status, and logs.
6. Run read-only DB checks after 24 hours:
   - rejected rows have reasons;
   - no `pass=false approved` drift;
   - no praise bursts;
   - bot message count is within target.
