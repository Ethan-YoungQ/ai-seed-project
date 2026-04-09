# Sub-project 2: Feishu Card Protocol — Design Spec

**Date:** 2026-04-10
**Author:** brainstorming session with user
**Status:** design approved, ready for writing-plans
**Depends on:** sub-project 1 (`2026-04-10-scoring-v2-core-domain-design.md`) Phase A-I
**Depends on outputs of:** sub-project 4 (`2026-04-10-sub4-llm-reselection-research.md`) model reselection
**Influences:** sub-project 1 Phase D1/E4 plan revisions (multimodal payload)
**Pre-research:** `docs/superpowers/brainstorms/2026-04-10-sub2-feishu-card-protocol-research.md`

---

## 1. Purpose and scope

Sub-project 2 delivers the Feishu interactive card surface that sits on top of the v2 scoring domain from sub-project 1. Its job is to translate every rule-mandated interaction (scoring submission, operator command, notification) into a Feishu card payload, route button clicks through the card-action webhook, persist the interaction audit trail, and keep card state in sync with backing domain state.

**In scope:**
- 16 interactive card templates covering all rules v1.1 §3 scoring items, lifecycle commands, and admin surfaces
- A synchronous click path that writes `card_interactions` + triggers `EventIngestor.ingest` and returns an updated card
- An asynchronous patch path that reacts to server-initiated events (LLM scoring result, window settle, daily reset) and updates the correct live card via `im.v1.message.patch`
- A new Sub2-owned table `feishu_live_cards` that tracks the 4 high-frequency patched cards
- H2 multimodal submission path (text + screenshot) routed to `glm-4v-flash`
- Card version migration with a 7-day grace window

**Out of scope:**
- The scoring domain itself (sub-project 1 owns `EventIngestor`, `ScoringAggregator`, `WindowSettler`, and all `v2_*` tables except `feishu_live_cards`)
- The gamified H5 dashboard (sub-project 3)
- LLM model re-selection beyond the H2 multimodal routing decision (sub-project 4)
- Peer review vote counting (spec §5.3 — sub-project 1 implements the Ingestor path; Sub2 only renders the card)
- Admin H5 console (deferred to sub-project 3)

---

## 2. Protocol choice: Option D (hybrid)

Four candidate protocols were evaluated during the pre-research session:

- **Option A** — static JSON templates + new card per interaction (lowest cost, highest chat noise)
- **Option B** — all cards patched in place via `im.v1.message.patch` (cleanest UX, most schema)
- **Option C** — TypeScript DSL + new card (type safety, but Feishu card editor exports JSON not TS)
- **Option D** — hybrid: 4 high-frequency cards patched, 13 static cards use new-card-per-interaction

**Decision: Option D.** Rationale:
1. `im.v1.message.patch` has two Feishu-enforced constraints that bite more cards the wider the patch surface gets: 5 QPS per single message and 14-day retention. Patching only the 4 high-frequency cards concentrates the contention surface where the UX reward is highest.
2. One-shot cards (period open, level announcement, graduation) have no rolling state to patch; forcing them through the patch path is wasted complexity.
3. `feishu_live_cards` stays small (bounded to 4 card types) which makes the expiry-scan job cheap.
4. Option C was dropped because the Feishu card editor exports JSON and designers cannot hand over TS components; the TS DSL would be write-only.

### 2.1 Feishu API constraints verified during brainstorming

| Constraint | Value | Source | Sub2 implication |
|---|---|---|---|
| `im.v1.message.patch` availability | Supported for `msg_type=interactive` only | Feishu doc, verified 2026-04-10 via context7 + webfetch | Option D is viable |
| Per-card rate limit | 5 QPS per single `feishu_message_id` | Feishu doc | High-frequency cards need write serialization (better-sqlite3 sync transactions give this for free in the sync path; the async path adds a 10s debounce window) |
| Global rate limit | 1000/min + 50/s | Feishu doc | Far above realistic volume; 14 learners × 84 clicks/day ≈ 1176 / period |
| Card payload size | 30 KB | Feishu doc | Templates must pass a `<= 25 * 1024` assertion in unit tests (safety margin) |
| Patch retention | 14 days from `send_at`; error 230031 beyond | Feishu doc | `feishu_live_cards.expires_at` triggers proactive replacement at 12 days; runtime 230031 triggers immediate fallback |
| `CardActionHandler` response semantics | Returning an `InteractiveCard` from the callback handler auto-updates the card in place, no separate patch API call required | `@larksuiteoapi/node-sdk` docs | Synchronous button-triggered updates cost zero extra API calls |

---

## 3. Architecture and data flow

### 3.1 Two update paths

**Synchronous path (button click):** The CardActionHandler callback writes `card_interactions` + dispatches `EventIngestor.ingest` synchronously (`better-sqlite3` is sync, typical round-trip is 1-5ms) and returns the updated `InteractiveCard` as the callback response. The SDK uses the response body as the Feishu patch payload, so no explicit `message.patch` call is made. This applies to every click-initiated update on any card (static or patched).

**Asynchronous path (server event):** Triggered by `LlmScoringWorker.notifyMemberScoringDecision`, `WindowSettler.notifyMembersWindowSettled`, or the daily-reset scheduler. The trigger looks up the live card instance in `feishu_live_cards`, merges the new state into `state_json`, renders a new card JSON, and calls `client.im.v1.message.patch(message_id, content)`. Errors (230031, 5 QPS, oversize) fall back to replacing the card instance.

### 3.2 Sync path example — K3 daily checkin

```
Student clicks 🧠 K3 button on daily-checkin card
  → Feishu delivers InteractiveCardActionEvent to our webhook
  → CardActionHandler routes to POST /api/v2/feishu/card-action
  → Fastify handler (inside a single better-sqlite3 transaction):
      1. Idempotent INSERT into card_interactions
           UNIQUE(feishu_open_id, trigger_id, action_name)
      2. Soft validation: payload.text.length >= 20 && !pureEmoji(text)
      3. EventIngestor.ingest(memberId, 'K3', cap=3, sourceRef, { text })
      4. Ingestor writes v2_scoring_item_events status='pending'
         + writes v2_llm_scoring_tasks status='pending'
      5. Read feishu_live_cards.state_json for daily-checkin card
      6. Merge: state_json.items.K3.push(memberId)
      7. Update feishu_live_cards.state_json + last_patched_at
      8. Render new card JSON from template + updated state
  → Return new card JSON as CardActionHandler response
  → SDK forwards as Feishu patch response
  → Card updates in place in the group chat
```

### 3.3 Sync path example — H2 multimodal (screenshot + description)

```
Student clicks 🔧 H2 button on daily-checkin card
  → Card expands to form: description text + file chooser
  → Student fills text, picks local image
  → Student taps "提交"
  → Feishu uploads image, returns file_key with the action payload
  → CardActionHandler receives { text, file_key }
  → Handler transaction:
      1. Idempotent INSERT card_interactions, payload_json = { text, file_key }
      2. Soft validation: text.length >= 20 && file_key non-empty
      3. EventIngestor.ingest(memberId, 'H2', cap=3, sourceRef, { text, fileKey: file_key })
      4. v2_scoring_item_events.payload_json preserves { text, file_key }
      5. v2_llm_scoring_tasks.prompt_text = renderPrompt('H2', { text, fileKey })
      6. state_json.items.H2.push(memberId)
  → Return updated daily-checkin card
  → Card now shows "🔧 张三 审核中"
  
  (later, asynchronously)
  
LlmScoringWorker picks H2 task
  → Detects itemCode === 'H2' → multimodal route
  → Downloads image via Feishu im:message scope using file_key
  → Calls glm-4v-flash with multimodal messages:
      [{ role: 'user', content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: cdnOrBase64 } }
      ]}]
  → Parses JSON response { pass, score, reason }
  → ScoringAggregator.applyDecision(eventId, 'approved'|'rejected', reason)
  → Sub-project 1 fires notifyMemberScoringDecision hook
  → Sub2 receives the hook:
      a. Async patch of daily-checkin card: "🔧 张三 审核中" → "🔧 张三 ✓(+3)"
      b. Send DM to 张三 as new LLM Decision Card with full reason + appeal button
```

### 3.4 Boundary with sub-project 1

Sub2 is a strict consumer of the v2 scoring domain, with exactly three write touchpoints into sub-project 1 tables:

| Sub1 table | Sub2 access | Touchpoint |
|---|---|---|
| `card_interactions` | Write (direct INSERT) | Every button click first lands here |
| `v2_scoring_item_events` | Write only via `EventIngestor.ingest()` | Never direct UPDATE |
| `members.source_feishu_open_id` / `hidden_from_board` / `display_name_override` | Write via admin PATCH endpoint | Sub2 calls `/api/v2/admin/members/:id` which sub-project 1 Phase G implements |
| All other `v2_*` tables | Read only | Render state for cards |
| `members` (other columns) | Read only | Render names, avatars |
| `peer_review_votes` | Write (peer review card) | Sub-project 1 spec §5.3 table; **missing from Phase A2 DDL** — added as Phase B pre-fix (see §15 cross-subproject coordination) |
| `reaction_tracked_messages` | Write (C1 echo card → C2 reaction source) | Sub-project 1 spec §5.2 table; **missing from Phase A2 DDL** — added as Phase B pre-fix (see §15 cross-subproject coordination) |
| `feishu_live_cards` | Read/write/clean (Sub2 owns it) | New table introduced by this spec |

---

## 4. Card inventory (16 cards after removing redundant #12)

### 4.1 Patched cards (4) — live state in `feishu_live_cards`

| # | Name | Trigger | Patch frequency | state_json shape | Audience |
|---|---|---|---|---|---|
| 8 | Daily checkin card (K3+K4+H2+C1+C3+G2) | `/打卡` or daily auto-post | High (per click + per LLM decision) | `{ items: { K3: [memberId], K4: [memberId], H2: [memberId], C1: [memberId], C3: [memberId], G2: [memberId] }, postedAt }` | Group |
| 4 | Homework submit card (H1+H3) | `/作业 <title>` | Medium (per submission) | `{ sessionId, deadline, submitters: [{ memberId, submittedAt, firstSubmitter }] }` | Group |
| 9 | Leaderboard card | `/排行` or auto on window settle | Low (per settle) | `{ settledWindowId, topN: [{ memberId, cumulativeAq, latestWindowAq, dims }], radarPngUrl }` | Group |
| 15 | Admin review queue card | `/复核队列` or new pending event | Medium (per operator action) | `{ currentPage, totalPages, events: [{ eventId, memberName, itemCode, scoreDelta, llmReason, textExcerpt }] }` | Operator DM |

### 4.2 Static cards (12) — new card per interaction, no `feishu_live_cards` row

| # | Name | Trigger | Writes | Audience |
|---|---|---|---|---|
| 1 | Period open card | `/开期 <n>` | — confirmation only | Group |
| 2 | Window open card | `/开窗 <code>` | — confirmation only | Group |
| 3 | Quiz card (K1+K2) | `/测验 <setCode>` | `card_interactions` → K1/K2 ingest | Group @all-students |
| 5 | Video checkin card (G1) | `/视频 <title>` | `card_interactions` → G1 ingest | Group |
| 6 | Peer review vote card (S1+S2) | `/互评` | `peer_review_votes` rows | **14 private DMs** |
| 7 | Peer review settle card | `/互评结算 <sid>` | triggers S1/S2 Ingestor | Group |
| 10 | Level announcement card | `WindowSettler.notifyMembersWindowSettled` | — read-only | Group |
| 11 | Graduation final card | `/结业` | — read-only | Group |
| 13 | LLM decision card | `LlmScoringWorker.handleSuccess` | — DM with reason + appeal | Student DM |
| 14 | C1 group echo card | `applyDecision` pass C1 | — reaction source for C2 | Group |
| 16 | Member management card | `/成员管理` | `members.role_type` / `hidden_from_board` / `display_name_override` via admin PATCH | Operator DM |
| 17 | Manual score adjust card | `/调分` or queue button | `v2_scoring_item_events` sourceType='operator_manual' | Operator DM |

**Total: 16 cards** (original inventory was 17; removed the LLM Review Pending Card because the daily-checkin card's "审核中" patch conveys the same signal without a separate DM).

### 4.3 Card source_ref construction (dedupe key for `v2_scoring_item_events`)

| Scoring item | sourceType | sourceRef format | Uniqueness rationale |
|---|---|---|---|
| K3, K4, C1, C3, H2, G2 | `card_interaction` | `card_interactions.id` (uuid) | One click = one uuid |
| K1, K2 | `card_interaction` (K1) / `quiz_result` (K2) | K1: `card_interactions.id`. K2: `{card_interactions.id}:k2` | K2 is a derived event from the same click |
| H1 | `card_interaction` | `card_interactions.id` | Multiple submissions allowed within cap |
| H3 (first submitter bonus) | `card_interaction` | `h3-first-{periodId}` | Cap logic prevents double-fire |
| G1 | `card_interaction` | `g1-{periodId}:{memberId}` | Exactly one G1 per member per period |
| S1, S2 | `card_interaction` | S1: `s1-{peerReviewSessionId}:{votedMemberId}`; S2: `s2-{peerReviewSessionId}:{voterMemberId}` | Per spec §5.3 |
| C2 (reactions) | `emoji_reaction` | `{messageId}:{reactionBatchIndex}` | Per spec §5.2 — Sub2 reads reaction webhook and emits |
| Operator manual | `operator_manual` | Auto-generated uuid by Ingestor | Per spec §2.2.4 |

---

## 5. Data model — new table `feishu_live_cards`

Sub2 owns exactly one new table; all other v2 tables belong to sub-project 1.

```sql
CREATE TABLE IF NOT EXISTS feishu_live_cards (
  id TEXT PRIMARY KEY,                      -- uuid, we generate
  card_type TEXT NOT NULL,                  -- 'daily_checkin' | 'homework' | 'leaderboard' | 'review_queue'
  feishu_message_id TEXT NOT NULL UNIQUE,   -- returned by Feishu after send
  feishu_chat_id TEXT NOT NULL,             -- group chat_id or operator open_id for DM
  camp_id TEXT NOT NULL,                    -- fixed single value in current deployment, reserved for multi-camp
  period_id TEXT,                           -- bound to period (NULL = cross-period like review queue)
  window_id TEXT,                           -- optional scoping
  card_version TEXT NOT NULL,               -- e.g. 'daily-checkin-v1'
  state_json TEXT NOT NULL,                 -- current rendered state
  sent_at TEXT NOT NULL,
  last_patched_at TEXT,
  expires_at TEXT NOT NULL,                 -- sent_at + 14 days (Feishu retention)
  closed_reason TEXT                        -- 'expired' | 'period_closed' | 'replaced_by_new' | NULL
);

CREATE INDEX idx_feishu_live_cards_active ON feishu_live_cards(card_type, feishu_chat_id)
  WHERE closed_reason IS NULL;
CREATE INDEX idx_feishu_live_cards_expires ON feishu_live_cards(expires_at)
  WHERE closed_reason IS NULL;
```

Rationale for the columns:
- `expires_at` supports a cheap "SELECT WHERE expires_at < NOW() AND closed_reason IS NULL" scan job running hourly to pre-emptively mark cards as expired 2 days before Feishu would reject the patch (i.e. when `now > sent_at + 12 days`).
- `state_json` holds each card type's rendered state as a serialized blob. Each card type defines its own schema; the renderer is the single consumer.
- `card_version` pairs with card renderer dispatch (§6).
- `closed_reason` is nullable so only the latest active card per chat per type satisfies `closed_reason IS NULL`; the partial index above makes that lookup O(1).

---

## 6. Card version migration (Q10 decision: 7-day grace window)

Each card template is versioned via `feishu_live_cards.card_version`. The runtime supports the current version and one previous version for a 7-day grace period. Older versions are rejected.

```ts
type CardVersionDirective = 'current' | 'legacy' | 'expired';

function resolveCardVersion(
  instance: FeishuLiveCardRow,
  currentVersion: string,
  legacyVersion: string
): CardVersionDirective {
  if (instance.card_version === currentVersion) return 'current';
  if (instance.card_version === legacyVersion) {
    const daysSinceSent = (Date.now() - Date.parse(instance.sent_at)) / (86400 * 1000);
    return daysSinceSent < 7 ? 'legacy' : 'expired';
  }
  return 'expired';
}
```

Handler dispatch pattern:

```ts
switch (resolveCardVersion(instance, 'daily-checkin-v2', 'daily-checkin-v1')) {
  case 'current':
    return handleCurrent(instance, action, payload);
  case 'legacy':
    return handleLegacy(instance, action, payload); // read-only or degraded path
  case 'expired':
    return { toast: { type: 'error', content: '此卡片已过期,请执行 /打卡 获取新卡' } };
}
```

Deployment workflow for version bumps:
1. Edit the current template and bump `CARD_VERSION` constant.
2. Keep the old template file in tree, renamed to `*-v{n-1}.ts`, for one release cycle (14 days = 1 patch window).
3. Handler registers both `current` and `legacy` versions explicitly.
4. After 14 days (next patch cycle), delete the legacy template file.

---

## 7. Error handling and edge cases

### 7.1 Feishu API constraint responses

| Constraint | Symptom | Sub2 response |
|---|---|---|
| 5 QPS per `feishu_message_id` | Feishu returns rate limit error | 10s exponential backoff up to 3 attempts; on final failure move card instance to dead letter and DM operator |
| 14-day retention (error 230031) | Patch rejected | Mark old instance `closed_reason='expired'` + immediately send a new card with accumulated state + insert new row |
| 30 KB payload limit | Rendered JSON too large | Unit tests enforce `< 25 * 1024` at render time; review queue card enforces 10-per-page strictly; leaderboard collapses to top 14 (single cohort is already bounded) |
| Callback token expiry | CardActionHandler timeout | All sync work stays under `better-sqlite3` one-transaction budget (~5ms); if that ever exceeds 1s alert + fall back to 2-phase response (toast ack + follow-up patch) |
| Global 1000/min | Extremely unlikely | Counter + 80% alert threshold; nothing else |

### 7.2 Business error responses

| Error (from sub1 DomainError) | HTTP | Card-layer treatment | Log level |
|---|---|---|---|
| Soft validation (Sub2-local) | 200 + toast | "描述太短,至少 20 字" in toast | info |
| `NotEligibleError` | 400 | "你不在本营学员名单" | info |
| `PerPeriodCapExceededError` | 200 | "今日 K3 已满额,可继续提交但不计分" | info |
| `DuplicateEventError` | 200 | Show card unchanged (idempotent) | debug |
| `NoActivePeriodError` / `NoActiveWindowError` | 400 | "期未开/窗未开,请等讲师开启" | warn |
| `IceBreakerPeriodError` | 200 | "破冰期提交保留,不计入 AQ" | info |
| `InvalidDecisionStateError` (operator double-review) | 409 | "此条已被其他运营处理" + refresh queue | warn |
| Stale card version (> grace window) | 200 + toast | "此卡片已过期,请执行 /打卡 获取新卡" | info |
| LLM result arrives before card exists | n/a | Skip patch; LLM decision card DM still fires | warn |

### 7.3 Concurrency model

| Scenario | Mitigation |
|---|---|
| Student double-click same button (<2s apart) | `card_interactions` UNIQUE `(feishu_open_id, trigger_id, action_name)` — second INSERT OR IGNORE |
| Two students submit K3 simultaneously | Both sync patch paths serialize through `better-sqlite3` single-process sync transactions |
| LLM worker patches daily-checkin card while a student is clicking H2 | Both paths run `SELECT state_json FROM feishu_live_cards WHERE id=? ` inside a transaction and update — serialized |
| Two operators review the same event simultaneously | `ScoringAggregator.applyDecision` checks `status === 'review_required'` before transition; second caller gets `InvalidDecisionStateError` |
| Card version bump during live traffic | `handleLegacy` path kicks in for pending old cards; no downtime |

### 7.4 Soft validation rules (Sub2-local)

Applied in `/api/v2/feishu/card-action` handler before calling `EventIngestor.ingest`:

- For all 6 LLM-gated items: `payload.text` must be trimmed length >= 20
- Pure-emoji rejection: after stripping whitespace and Unicode emoji (`\p{Emoji}`), text must have >= 5 remaining characters
- For H2: `file_key` must be non-empty and resolvable (200-ok HEAD against the Feishu file endpoint)
- For G2: payload must contain at least one `http(s)://` URL

Validation failures return a Feishu toast and do not invoke the Ingestor. They still write to `card_interactions` with `rejected_reason` for audit.

---

## 8. LLM model routing (derived from sub-project 4 reconsideration + H2 multimodal requirement)

**Decision: unified GLM family.**

- Text-only 5 items (K3, K4, C1, C3, G2): `glm-4.5-flash` (cheap, strict JSON, `LLM_TEXT_MODEL` env var)
- Multimodal 1 item (H2): `glm-4v-flash` (vision-enabled, image + text multimodal API, `LLM_VISION_MODEL` env var — new)

Rationale:
1. Rules v1.1 §3 for H2 explicitly require "上传截图+描述" — the scoring signal is 'this is a valid AI tool usage screenshot'. Text-only scoring would be trivially gamed.
2. Staying in the GLM family means a single provider config (`provider-config.ts` already defaults to GLM), a single API key, and a single error-handling code path.
3. Volume is small: ~252 H2 calls per cohort, ~2184 other LLM calls per cohort. Cost estimate ≈ ¥2-3 per cohort total, within budget.
4. Alternative Qwen path (~¥1.7) was cheaper but requires Aliyun Bailian API key provisioning (per aliyun-baseline P0) which is un-activated today.

**Downstream plan edits required (recorded in sub-project 1 execution checklist):**
- Sub-project 1 Plan D1: extend `LlmPromptPayload` type with optional `fileKey?: string` field; H2 prompt template is updated to reference the image
- Sub-project 1 Plan E4: `LlmScoringClient` adds multimodal API path; detects `itemCode === 'H2'` and routes to `LLM_VISION_MODEL`
- Sub-project 1 env: resolve the existing discrepancy between `.env.example` (`glm-4.5-flash`) and `provider-config.ts:85` default (`glm-4.7`) in favor of `glm-4.5-flash`; add new `LLM_VISION_MODEL=glm-4v-flash` variable
- Sub-project 1 Phase E4 test coverage: H2 multimodal success + failure paths

These edits land in sub-project 1 before Phase D and Phase E execute, not as part of sub-project 2.

---

## 9. Callback routing and HTTP endpoints

Sub2 introduces exactly two new HTTP routes (and one webhook handler wired into the existing Feishu WSClient):

### 9.1 Fastify routes

| Route | Method | Purpose | Auth |
|---|---|---|---|
| `/api/v2/feishu/card-action` | POST | Receive CardActionHandler callbacks from Feishu, route to per-card handler, return updated card JSON | Feishu verification token (existing `encryptKey`/`verificationToken` pattern) |
| `/api/v2/feishu/commands/:name` | POST | Receive `/开期`, `/开窗`, `/打卡`, `/测验`, ... command triggers from the event subscription dispatcher | Same as above |

### 9.2 Webhook event handler additions

`im.message.receive_v1` already flows through the existing Feishu WSClient in sub-project 1. Sub2 adds these handlers on top:

- `im.message.receive_v1` with text matching `^/(开期|开窗|打卡|作业|视频|测验|互评|互评结算|排行|复核队列|成员管理|调分|结业)\b` → dispatch to `/api/v2/feishu/commands/:name`
- `im.message.receive_v1` with parent message matching a known H1 card's `card_instance_id` → treat as homework attachment reply, forward file_key to H1 handler (Q6 decision)
- `im.message.reaction.created_v1` (existing scope per sub1 §5.2) → route to C2 reaction tracker (sub-project 1 `reaction-tracker.ts` in Phase F)

### 9.3 Handler shape

Every card handler follows the same type:

```ts
interface CardActionContext {
  operatorOpenId: string;
  triggerId: string;
  actionName: string;
  actionPayload: Record<string, unknown>; // typed per card
  messageId: string;
  chatId: string;
}

interface CardActionResult {
  newCardJson?: InteractiveCard;           // if patching
  toast?: { type: 'info' | 'error'; content: string };
  followUp?: () => Promise<void>;          // side effects outside the response loop
}

type CardHandler = (
  ctx: CardActionContext,
  deps: { repo: SqliteRepository; ingestor: EventIngestor; llmClient: LlmScoringClient }
) => Promise<CardActionResult>;
```

A per-card-type registry maps `card_type` + `action_name` to the handler implementation. The router applies soft validation + version resolution + DomainError → Feishu toast mapping uniformly.

---

## 10. File layout

New files introduced by sub-project 2. All paths are under the repository root.

```
src/services/feishu/cards/
├── registry.ts                        # Maps card_type+action to handler
├── router.ts                          # Fastify plugin registering the 2 routes
├── version.ts                         # resolveCardVersion + grace window logic
├── soft-validation.ts                 # Text length + pure-emoji check
├── renderer.ts                        # Shared template renderer
├── live-card-repository.ts            # feishu_live_cards CRUD (Sub2-owned)
├── patch-worker.ts                    # Async patch dispatcher (LLM results, settles)
├── expiry-scanner.ts                  # Hourly job, marks expired cards
├── dead-letter.ts                     # Feishu API failure tracking
├── templates/
│   ├── common/
│   │   ├── header.ts
│   │   ├── member-badge.ts
│   │   └── progress-bar.ts
│   ├── daily-checkin/
│   │   ├── daily-checkin-v1.ts
│   │   └── daily-checkin-v1.test.ts
│   ├── homework-submit/
│   │   ├── homework-submit-v1.ts
│   │   └── homework-submit-v1.test.ts
│   ├── leaderboard/
│   │   ├── leaderboard-v1.ts
│   │   └── leaderboard-v1.test.ts
│   ├── review-queue/
│   │   ├── review-queue-v1.ts
│   │   └── review-queue-v1.test.ts
│   ├── period-open-v1.ts
│   ├── window-open-v1.ts
│   ├── quiz-v1.ts
│   ├── video-checkin-v1.ts
│   ├── peer-review-v1.ts
│   ├── peer-review-settle-v1.ts
│   ├── level-announcement-v1.ts
│   ├── graduation-v1.ts
│   ├── llm-decision-v1.ts
│   ├── c1-echo-v1.ts
│   ├── member-mgmt-v1.ts
│   └── manual-adjust-v1.ts
├── handlers/
│   ├── quiz-handler.ts
│   ├── homework-handler.ts
│   ├── video-handler.ts
│   ├── daily-checkin-handler.ts
│   ├── peer-review-handler.ts
│   ├── review-queue-handler.ts
│   ├── member-mgmt-handler.ts
│   ├── manual-adjust-handler.ts
│   └── command-dispatcher.ts
└── observability.ts                   # Counters, gauges, log helpers

src/storage/sqlite-repository.ts       # Extended with feishu_live_cards DDL + methods

tests/services/feishu/cards/
├── registry.test.ts
├── router.test.ts
├── version.test.ts
├── soft-validation.test.ts
├── renderer.test.ts
├── live-card-repository.test.ts
├── patch-worker.test.ts
├── expiry-scanner.test.ts
├── handlers/                          # Per-handler integration tests
│   ├── quiz-handler.test.ts
│   ├── daily-checkin-handler.test.ts
│   ├── homework-handler.test.ts
│   ├── review-queue-handler.test.ts
│   └── ... (one per handler)
└── templates/                         # Per-template render + size tests
    └── ... (co-located above instead, see tree)
```

All files stay outside `web/src/**` so sub-project 1 Phase I1 (`git rm web/src/**`) does not touch them.

---

## 11. Testing strategy

| Layer | Target | Approach | Coverage goal |
|---|---|---|---|
| **Unit — renderer** | `render(template, state) → JSON`, type-safe, pure | Vitest, per-template snapshot + size assertion (`<= 25 * 1024`) | 100% of render logic |
| **Unit — soft validation** | Text length, pure-emoji stripping, file_key check | Vitest | 100% branches |
| **Unit — version resolver** | current/legacy/expired dispatch | Vitest with fake timers | 100% branches |
| **Unit — live card repo** | CRUD + expiry scan + concurrency | Vitest + `better-sqlite3` `:memory:` | 100% methods |
| **Integration — handler** | Fastify inject, mock Feishu client, real ingestor | Per handler | 90% lines |
| **Integration — end-to-end card flow** | `/api/v2/feishu/card-action` → `card_interactions` → `EventIngestor` → `feishu_live_cards` update → response shape | Vitest + `:memory:` DB + fake SDK | 85% lines overall |
| **Contract — Feishu API** | Fake SDK + captured request body assertions | Vitest with spy-replaced `client.im.v1.message.patch` | Critical paths only |
| **Manual smoke** | One end-to-end camp run: 开期→开窗→测验→打卡→LLM→排行→结窗→段位→结业 | Human test on 1-person fixture camp with real Feishu bot, screenshots saved as evidence | Go/no-go gate |

Overall Sub2 coverage target: **>= 85% lines / 90% branches** on `src/services/feishu/cards/**`, consistent with sub-project 1's §6.5 thresholds.

---

## 12. Phased delivery (risk-ordered)

**Phase S1 — skeleton + sync path**
- C6 real-device spike: send 1 dummy static card, verify CardActionHandler response returns new JSON and updates in place (~30 min). Validates Option D end-to-end.
- `src/services/feishu/cards/` directory + shared renderer + `/api/v2/feishu/card-action` route skeleton + `card_interactions` write path
- First card: Quiz card (K1+K2) — validates sync button flow + EventIngestor hookup
- Second card: Daily-checkin card with patch + state_json read/write
- Exit: both sync static and sync-patch paths work; 2 cards pass TDD tests

**Phase S2 — async path + LLM result loop**
- `notifySub2CardPatch` hook called from `LlmScoringWorker`
- `feishu_live_cards.expires_at` scanner
- 230031 fallback
- Third card: LLM Decision Card (async DM)
- Exit: LLM result round-trip updates daily-checkin card in place + sends student DM

**Phase S3 — H2 multimodal path** (depends on sub-project 1 Phase D1/E4 pre-execution edits being live)
- H2 template with file chooser or reply-message fallback (Q6 decision: reply-message primary)
- `glm-4v-flash` client wrapping (builds on Phase E4 multimodal)
- Exit: H2 happy path: student submits text + screenshot, glm-4v-flash rejects non-AI-tool images

**Phase S4 — operator cards**
- Review queue (pagination + inline patch + operator identity gating)
- Member management
- Manual score adjust
- Exit: operator can DM-manage the camp end-to-end

**Phase S5 — remaining static cards**
- 7 remaining (period open, window open, homework, video, peer review, level announcement, graduation, C1 echo)
- Exit: 16-card surface live

**Phase S6 — observability and hardening**
- Counters + gauges + dead letter
- Version migration dispatch
- 14-day fallback soak test
- Manual smoke end-to-end camp run

---

## 13. Success criteria (Sub2 "done")

- [ ] 16 cards implemented, 4 patched cards update in place on sync and async paths
- [ ] Synchronous CardActionHandler path survives 14 learners × 6 daily-checkin buttons concurrent click without errors
- [ ] Asynchronous `im.v1.message.patch` from LLM worker updates daily-checkin card; 230031 triggers seamless fallback
- [ ] H2 multimodal path: `glm-4v-flash` correctly discriminates AI tool screenshot vs noise at ≥ 60% agreement rate on a 60-sample eval set (stretch; baseline is ≥ 50%)
- [ ] Card layer line coverage ≥ 85%, branch coverage ≥ 90%
- [ ] One complete camp run (open to graduation) on a test camp with clean data and no error logs
- [ ] Operator can independently run review queue + member mgmt + manual adjust flows
- [ ] `feishu_live_cards` 14-day expiry + 7-day version grace path both exercised by tests

---

## 14. Open questions resolved during brainstorming

For record — these were the 10 questions flagged by the pre-research doc, all resolved:

| Q | Decision |
|---|---|
| Q1 LLM async result delivery | Dual channel: patch daily-checkin card in place + DM student with detail (LLM Decision Card) |
| Q2 Daily-checkin rolling list | Patch in place (implicit from Option D; card #8 is a patched card) |
| Q3 Admin review queue format | Paginated single card (10 per page) with inline ✅/❌/✏️ patch |
| Q4 Radar chart scope | Only on leaderboard (#9) and level announcement (#10). Other cards use per-dimension progress bars. |
| Q5 Anti-abuse for self-submission | Soft validation at card layer: reject text.length < 20 or pure-emoji; for H2 require file_key |
| Q6 Homework H1 file upload | Reply-to-message flow (existing `im:message` scope) instead of inline card file chooser |
| Q7 Callback sync vs async | Synchronous optimistic response; better-sqlite3 synchronous writes are fast enough under the Feishu timeout budget |
| Q8 Peer review card visibility | 14 private DMs (card #6), one per student |
| Q9 Card i18n | Chinese only (matches rules and mockups, avoids unnecessary scaffolding) |
| Q10 Version migration | 7-day grace window: handler supports current + one previous version for up to 7 days after deploy |

Additionally, one new decision emerged outside the initial Q list:

| — | Decision |
|---|---|
| Model selection for LLM scoring (M1) | Unified GLM family: `glm-4.5-flash` for text items, `glm-4v-flash` for H2 multimodal. Drives sub-project 1 Plan D1/E4 edits before Phase D/E execution. |

---

## 15. Cross-subproject coordination

Sub2 depends on or influences these sibling sub-projects:

- **Sub-project 1 (scoring v2 core domain):**
  - Pre-execution plan edits required in D1 (`LlmPromptPayload.fileKey` optional field), D3 (ingestor preserves file_key), E4 (multimodal routing), env config (`LLM_VISION_MODEL` variable + align existing `LLM_TEXT_MODEL` default to `glm-4.5-flash`)
  - **Phase B pre-fix (new, discovered during Sub2 spec self-review):** add `peer_review_votes` and `reaction_tracked_messages` tables to `tableDefinitions` in `src/storage/sqlite-repository.ts`. These two tables are referenced by sub-project 1 design spec §5.2 and §5.3 but were missing from the Phase A2 DDL delivery. Without this fix, Sub2 peer review card (#6) and C1 echo card (#14) have nowhere to write. The fix is a single commit that appends two `CREATE TABLE IF NOT EXISTS` statements to `tableDefinitions`; sub-project 1 Phase B task B1 (or a new preamble task B0) should include the DDL for these tables along with their repository CRUD methods.
  - G7/G8 API contract is consumed read-only by sub-project 3 (dashboard) and indirectly by Sub2 leaderboard card #9
  - Sub2 never writes directly to `v2_*` scoring tables. Write touchpoints into sub-project 1 tables: `card_interactions` (direct), `peer_review_votes` (direct, after Phase B pre-fix), `reaction_tracked_messages` (direct, after Phase B pre-fix), and `members.source_feishu_open_id` / `hidden_from_board` / `display_name_override` (via admin PATCH endpoint).
- **Sub-project 3 (gamified dashboard):**
  - Sub3 will live in a new folder (`dashboard-web/` or `apps/dashboard/`) to avoid Phase I1 `web/src` deletion — Sub2 stays in `src/services/feishu/cards/**` which is also safe
  - Sub3 may reshape G8 (ranking endpoint) if it picks auth model A2 (semi-private); that decision does not affect Sub2 because Sub2 reads ranking data directly from the DB, not from the HTTP endpoint
- **Sub-project 4 (LLM economics):**
  - Sub4's initial recommendation was DeepSeek V3.2 (text-only) which missed the H2 multimodal requirement — this spec corrects that decision upstream
  - If Sub4 later runs the 540-call blind eval and finds a better multimodal candidate, the `LLM_VISION_MODEL` env var makes swapping trivial

---

## 16. Risks and mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| Feishu patch API behavior differs from documentation (e.g. some card elements cannot be patched) | Medium | Phase S1 spike validates end-to-end real-device patch on day 1; if it fails, fall back to Option A (no patch) with a known rework scope |
| Daily-checkin card contention under burst (14 concurrent clicks) exceeds 5 QPS single-message limit | Medium | Sync path serializes through `better-sqlite3`; realistic burst is < 5/second in a 14-person cohort; if 230031 starts happening, introduce a 200ms per-card token bucket |
| glm-4v-flash judgement quality too noisy on H2 screenshots | Medium | Set the H2 pass threshold conservative (require both text and image to be plausible); add operator review-required fallback path |
| 14-day patch retention cuts off cards unexpectedly across a 12-period camp | Low | Proactive expiry scan at day 12 replaces cards before they hit the boundary |
| Feishu SDK upgrade (v1.42 → future) changes CardActionHandler shape | Low | Handler types wrapped in a Sub2 adapter layer; version pin in package.json + dependabot warning |
| Phase I1 deletes `web/src/**` during Sub-project 1 execution while Sub2 is in flight | Low | Sub2 lives entirely in `src/services/feishu/cards/**` — outside the Phase I1 deletion set |
| Sub-project 1 Plan D1/E4 pre-execution edits not landed in time | High (blocks S3) | Edits land as part of Phase D/E execution pre-fix checklist already tracked in sub-project 1 |
| Operator DM scaling (16 + 17 + 15 cards DMed to operators) creates DM clutter | Low | Post-MVP: introduce an operator console web page (sub-project 3 Phase 2) |

---

**End of spec. Ready for `superpowers:writing-plans`.**
