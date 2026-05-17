# AI Boot Operations Bot North-Star Redesign

## Goal

Make AI Boot operate the Feishu group with low noise and high usefulness: answer learner questions, recognize valuable learning behavior, score fairly, and keep enough learners progressing without tying promotion to a cycle-end "water release".

## Server Facts Used

All facts below come from the running server on 2026-05-17, not from handoff notes.

- Production text model is `glm-4.7`; production vision model is `qwen-vl-max-latest`.
- Real server latency tests on the same Feishu image:
  - `qwen3.5-flash` text: about 1.55s.
  - `qwen3.5-flash` image: about 74.27s.
  - `glm-4.6v` image: about 77.04s.
  - `qwen-vl-max-latest` image: about 73.66s.
- Alibaba Cloud Model Studio documents `qwen3.5-flash` as supporting text, image, and video input with text output and structured output, so a unified Qwen model is technically feasible.
- Active learner score distribution after the promotion repair:
  - 15 active learners.
  - 2 learners are Lv2.
  - 13 learners are Lv1.
  - Dimension zero counts: K=1, H=2, C=10, S=10, G=12.
  - Average dimension scores: K=5.7, H=8.1, C=2.2, S=1.6, G=0.9.
  - Total dimension scores: H=122, K=86, C=33, S=24, G=13.

These facts imply that promotion scarcity is mostly caused by weak access to C/S/G points, not by a need to lower the level threshold at the end of a study cycle.

## Model Strategy

Use `qwen3.5-flash` as the unified text, chat, praise, and scoring model, but do not let image bytes enter the synchronous group chat path.

The model layer should expose one provider config for normal calls:

- `LLM_PROVIDER=aliyun`
- `LLM_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1`
- `LLM_TEXT_MODEL=qwen3.5-flash`
- `LLM_VISION_MODEL=qwen3.5-flash`

This removes unnecessary GLM/Qwen split-brain for text behavior. The exception is operational, not model-selection based: image recognition remains async because real latency is 70s+.

## Image Handling

Images should be scoreable but should not trigger immediate group praise.

Add an image understanding cache keyed by stable evidence identity:

- `file_key`
- `message_id`
- `content_hash`
- `model_name`
- `caption`
- `score_hint`
- `latency_ms`
- `status`
- `created_at`
- `updated_at`

When a learner sends an image:

1. Store the event immediately.
2. If the image has no cached caption, enqueue async image understanding.
3. Do not block chat reply or proactive praise on the image.
4. When the caption is ready, run scoring using the caption plus message text.
5. If approved, update score silently or include it in a later operator digest.

When Bot answers a later question and recent context includes images:

- Include only cached image captions.
- If no caption exists, include a short placeholder: `image pending async review`.
- Never reload image bytes into the chat context.

This means images can still earn points, but image-heavy discussions do not make Bot appear frozen.

## Scoring Opportunity Redesign

Do not solve promotion by cycle-end threshold relaxation. Instead, make valuable behavior easier to score continuously.

The current data shows C/S/G are under-awarded:

- C is missing for 10 of 15 learners.
- S is missing for 10 of 15 learners.
- G is missing for 12 of 15 learners.

Adjust scoring rules toward common real behaviors:

### C: AI Creation And Practice

Give C credit for any concrete AI-assisted artifact or work result, not only prompt sharing.

Examples that should score:

- AI image, poster, slide, table, workflow, script, app, customer demo, or internal work product.
- A screenshot or file showing the result.
- A written description of a concrete AI-assisted customer or work scenario, if it includes actor, action, tool, and outcome.

Prompt is optional. Prompt only matters when the category is specifically prompt/method sharing.

### S: Social Learning And Peer Activation

Make S easier through visible group operation behavior:

- Answering another learner's question.
- Giving a useful suggestion, correction, or resource in reply.
- Reacting to another learner with a substantive comment, not just an emoji.
- Reporting a test result or saying "this worked / this failed because...".

Pure "收到", "OK", emoji, or generic praise still scores 0.

### G: Growth Reflection

Make G easier through short but concrete reflection:

- "I tried X, got Y, next time I will change Z."
- "This AI tool was useful/not useful in this business scenario because..."
- "I learned one method from another learner and applied it to..."

Do not require long essays. A concrete 2-3 sentence reflection should be enough.

## Promotion Policy

Promotion is continuous and decoupled from learning cycles. No cycle-end water release.

The system should aim for about 50% of active learners to have a realistic path to promotion by improving scoring opportunities, not by automatically promoting the top half regardless of quality.

Recommended Lv2 rule:

- Primary path: `AQ >= 24` and at least one of C/S/G is greater than 0.
- Strong-work path: `AQ >= 32` and at least one dimension is `>= 8`.
- Excellence path: `AQ >= 20` and at least two dimensions are `>= 5`, with at least one of those dimensions being C/S/G.

Rationale:

- The previous `AQ >= 32 + dimension >= 8` promoted only 2 of 15 learners.
- A pure `AQ >= 16` rule promoted weak 16/17-point learners and produced wrong announcements.
- Requiring some C/S/G evidence keeps promotion tied to actual learning contribution, while the lower AQ paths make promotion reachable for active learners.

Lv3+ can keep higher cumulative thresholds initially, but should later be calibrated against real data after more learners have Lv2.

## Bot Operations Behavior

Add an operations router before generic chat. It classifies incoming messages into:

- admin command
- score candidate
- score opt-out or correction
- learner Q&A
- praise candidate
- ordinary chat

Each route has different behavior:

- Admin command: deterministic card/action, never generic chat.
- Score opt-out: deterministic acknowledgement and correction workflow.
- Learner Q&A: use recent user messages, recent group text, and cached image captions.
- Praise candidate: only praise when contribution is high value and context is clear.
- Ordinary chat: answer briefly or stay silent, depending on whether Bot was mentioned.

## Praise And Notification Policy

Praise should be rare, specific, and operationally useful.

Rules:

- No immediate praise for image-only messages. Score them asynchronously.
- No praise for daily participation.
- No praise for low-confidence scoring.
- No praise when the learner says not to score.
- No template fallback for short ambiguous messages.
- Prefer one concrete sentence about what was valuable and what next step would help.

Group-facing summaries should be minimal:

- Do not post full daily operations summaries into the learner group.
- In the learner group, only post low-noise "near promotion" nudges, for example: `本周有 3 位同学离 Lv2 还差 3 分以内，可以补一次实践复盘或作品说明。`
- Do not list every suspected miss in the learner group.

Operator-only digest should include:

- suspected missed scoring events,
- slow image jobs,
- near-promotion learners and missing point types,
- learners with C/S/G still at 0,
- repeated Bot fallback/error cases.

## Success Criteria

- Text Bot replies stay usually under 3 seconds.
- Image submissions never block group chat replies.
- Image score decisions use cached captions when available.
- C/S/G zero counts decrease over time.
- Lv2 promotion becomes reachable for about half of active learners through real contributions, without promoting pure low-effort participation.
- Bot sends fewer but more context-aware group messages.
- Operators receive actionable missed-score and near-promotion signals without flooding learners.

## Out Of Scope

- Rewriting all historical scores in this design step.
- Enabling v3 live scoring without a separate cutover check.
- Posting detailed daily analytics into the learner group.
