# Sub-project 2: Feishu Card Protocol — Pre-brainstorm research

**Status:** Research draft, awaiting user brainstorm
**Date:** 2026-04-10
**Author:** sub2-research subagent
**Source of truth (rules):** `output/AI训练营_14人进阶规则.md` v1.1
**Source of truth (domain):** `.worktrees/phase-one-feishu/docs/superpowers/specs/2026-04-10-scoring-v2-core-domain-design.md`
**Source of truth (platform capability):** `docs/feishu-mcp-v1.1-blueprint.md`

---

## 1. Executive summary

This document enumerates the Feishu interactive card surface that sub-project 2 must deliver on top of sub-project 1's v2 scoring domain. It is **research only**: it catalogs every card the rules and the v2 domain require, presents 4 meaningfully different protocol design options (minimum → max), maps each card button to the sub-project 1 tables it writes, and surfaces the decision-forcing open questions that must be answered before a design can be chosen.

**This document is NOT:**
- A final card JSON schema.
- A chosen architecture.
- An implementation plan.

**This document enables:**
- A user-facing brainstorming session that converges on: (a) one protocol design option, (b) answers to all blocking open questions, (c) a set of accepted constraints that the later writing-plans step consumes.

**Key tension the brainstorm must resolve:** sub-project 1 has already committed to `v2_scoring_item_events` (the event-stream truth source) and `card_interactions` (card audit log) — see spec §2.2.3 and §2.2.4. Sub-project 2 cannot redesign those tables, only decide the card protocol that writes into them. The surface is therefore well-bounded; most options differ on (a) how card state is tracked, (b) how card updates are done, (c) how admin/operator queues are rendered.

---

## 2. Card inventory

Below is the full catalog derived from rules v1.1 §3 and v2 spec §3, §5. Every card is traceable to a scoring item, a lifecycle command, or an external-data reflow. Cards are NOT invented — each entry maps to an explicit rule or spec requirement.

Legend:
- **Audience:** `group` (broadcast to class chat), `student` (DM to a specific learner), `operator` (DM to operator/trainer), `group@user` (group chat @-mentioning a learner)
- **Scope key:** `bitable:app` is NOT needed by any card here; cards use `im:message:send_as_bot` + `card.action.trigger`
- **Writes to:** tables in sub-project 1 v2 schema

### 2.1 Command-triggered cards (teacher/operator sends `/command`)

| # | Card name | Trigger | Data payload | Buttons / inputs | Callback handler writes | Audience |
|---|---|---|---|---|---|---|
| 1 | **Period Open Card** (开期确认卡) | `/开期 <n>` (spec §3.5) | `periodId`, `number`, `startedAt`, `isIceBreaker`, bound window code | none (status card) | — | `group` |
| 2 | **Window Open Card** (开窗确认卡) | `/开窗 <code>` (spec §3.5) | `windowId`, `code`, bound period IDs | none | — | `group` |
| 3 | **Quiz Card** (课后测验卡 / K1+K2) | `/测验 <questionSetCode>` (spec §5.1) | `questionSetId`, N questions with `options_json`, deadline | per-question option buttons, `提交` button | `card_interactions`, then `scoring_item_events` K1(submit=3) and K2(scoreDelta=round(rate*10)) | `group@all-students` or per-student DM |
| 4 | **Homework Submit Card** (作业提交卡 / H1+H3) | `/作业 <sessionTitle>` | `sessionId`, deadline, current ranking of submitters | `📎 提交作业` (file upload), rolling submitter list | `card_interactions`, `scoring_item_events` H1(=5), H3(=2 for first) | `group` |
| 5 | **Video Checkin Card** (视频打卡卡 / G1) | `/视频 <videoSetTitle>` | video list, deadline | `✅ 全部看完` + screenshot upload | `card_interactions`, `scoring_item_events` G1(=5) | `group` |
| 6 | **Peer Review Card** (互评投票卡 / S1+S2) | `/互评` (spec §5.3) | `sessionId`, list of 13 eligible classmates (excluding self) | multi-select up to 2 classmates | `peer_review_votes`, on `/互评结算` S1(=3)+S2(=2) via `EventIngestor` | `student` DM (one per learner) |
| 7 | **Peer Review Settle Card** (互评结算卡) | `/互评结算 <sessionId>` | vote counts per classmate | none | triggers Ingestor S1/S2 events | `group` |
| 8 | **Daily Checkin Card** (日常打卡卡 / K3+K4+H2+C1+C3+G2) | `/打卡` OR auto-scheduled daily (rules §3 checkin section) | today's already-checked-in list | 6 category buttons: `🧠 知识总结`, `🔍 AI纠错`, `🔧 实操分享`, `💡 创意用法`, `📐 提示词模板`, `🌱 课外好资源` — each opens an input form | `card_interactions`, then `scoring_item_events` for K3/K4/H2/C1/C3/G2 (all LLM-gated except H2 is LLM, all needsLlm=true per spec §3.2) | `group` |
| 9 | **Leaderboard Card** (排行榜卡 / `/排行`) | `/排行` or auto after window settle (rules §3 卡片汇总) | top N by cumulative AQ, grouped by current `member_level.current_level`, five-dim radar summary | optional `查看全部` / `切换维度` buttons | read-only; reads `member_dimension_scores`, `window_snapshots`, `member_levels` | `group` |
| 10 | **Level Announcement Card** (段位评定卡 / `/段位`) | After `WindowSettler` finishes (spec §3.6 notifyMembersWindowSettled) | `windowId`, per-member `from_level → to_level`, `pathTaken`, growth_bonus | none (celebration card) | read-only | `group` (may @-mention promoted learners) |
| 11 | **Graduation Final Card** (结业段位卡 / `/结业`) | `/结业` (spec §3.5 closeFinal) | FINAL window results, bonus breakdown, cash prize indication (rules §8) | none | read-only | `group` |

### 2.2 System-triggered / async-result cards

| # | Card name | Trigger | Data payload | Buttons / inputs | Callback handler writes | Audience |
|---|---|---|---|---|---|---|
| 12 | **LLM Review Pending Card** (LLM 审核中提示卡) | Immediately after Ingestor inserts a `scoring_item_events.status='pending'` row with `llm_task_id` non-null (spec §3.3 step 8) | `eventId`, `itemCode`, excerpt of submission | none (informational) or `撤回` button | on cancel: update scoring_item_events to rejected | `student` DM OR in-place edit of the original daily-checkin submission echo |
| 13 | **LLM Decision Card** (LLM 判定结果卡) | `LlmScoringWorker.handleSuccess` (spec §4.3) → `notifyMemberScoringDecision` | `eventId`, `pass`, `score`, `reason` (from LLM JSON), dimension, running total for period | none OR `申诉` button (routes to operator review queue) | on appeal: updates event status to `review_required` | `student` DM (or in-place card edit) |
| 14 | **C1 Group Echo Card** (创意回显卡 / C2 reaction seed) | `ScoringAggregator.applyDecision` pass-through for C1 (spec §5.2) | student's creative-usage text | no buttons — used to collect emoji reactions for C2 scoring | emoji reaction → `reaction_tracked_messages` → C2 events | `group` |
| 15 | **Admin Review Queue Card** (运营复核队列卡) | Auto when a `scoring_item_events.status='review_required'` row appears OR `/复核队列` | list of pending events (paginated), each with: member name, itemCode, text excerpt, LLM reason, `score_delta` | per-item `✅ 批准` / `❌ 拒绝` / `✏️ 调整分数` + text note | `scoring_item_events.status` ← approved/rejected via `ScoringAggregator.applyDecision`, `reviewed_by_op_id`, `review_note` | `operator` DM (or operator group DM) |
| 16 | **Admin Member Management Card** (成员管理卡) | `/成员管理` | list of members with `role_type`, `is_participant`, `hidden_from_board` | per-member buttons `提为运营`, `隐藏上榜`, `改别名` | `members.role_type`, `members.hidden_from_board`, `members.display_name_override` via `/api/v2/admin/members` PATCH | `operator` DM |
| 17 | **Admin Manual Adjust Card** (手动调分卡) | `/调分 <memberId> <itemCode> <delta>` OR button on admin view | `memberId`, `itemCode`, proposed delta, reason | `确认` / `取消` | `scoring_item_events` (sourceType='operator_manual', sourceRef auto-generated uuid per spec §2.2.4) | `operator` DM |

**Card count: 17.** The bottom of the target range (8-15). We land slightly above because sub-project 1 already commits us to 6 LLM-gated scoring items and a separate admin review queue path, which splits what could have been a single "submit card" into submit + pending + decision + review.

**Audit trail:** Every button click produces a `card_interactions` row first (spec §2.2.3 `card_type ∈ {daily_checkin, quiz, homework, video, peer_review, command}`), then the Ingestor reads that row to emit a `scoring_item_events` row. The two-step write gives us post-hoc forensics if a card ever misfires.

---

## 3. Protocol design options

Each option below is a self-contained approach to (a) card schema format, (b) how card state is kept, (c) how updates are applied, and (d) how the operator flow feels. I do not recommend one — the user picks after brainstorming.

### Option A — Static JSON templates + new-card-per-interaction

- **Summary:** Ship 17 hand-authored Feishu card v2 JSON templates as `.json` files in `src/services/feishu/cards/templates/`. Every button click triggers a new card to be sent (no in-place edits). All card state lives in `card_interactions` + downstream `scoring_item_events`.
- **Card schema:** 17 JSON files with `{{handlebars}}` placeholders. A tiny renderer fills placeholders from a typed `CardContext` object.
- **State:** Fully stateless card surface. Any "state" (submitter list, vote tally) is re-read from DB on each render.
- **Update semantics:** Button click → Fastify handler → Ingestor writes row → handler sends a **new** card (e.g., "已提交" follow-up). The original card in chat is left as-is (no patch API used).
- **Operator flow:** Operator clicks `✅ 批准` in the review queue card → handler → new "已批准" confirmation card replaces the queue card via a follow-up send. Queue is re-paginated and re-posted.
- **Pros:**
  1. Simplest possible implementation. Each template is ~50-150 lines of JSON. No state machine.
  2. Deterministic: card output depends only on DB state at render time.
  3. Easy to unit-test: `renderCard(templateName, context) → JSON` is pure.
- **Cons:**
  1. Chat becomes noisy — every click generates a new message. 14 learners × 6 checkin categories × 6 periods = ~500 visible cards per period.
  2. No live "submitted list" rolling in-place — each submit posts a new card, losing the "抢先提交 H3" visual.
  3. Hand-written JSON templates drift easily; schema versioning via `feishu_card_version` helps but the JSON is still 17 files to maintain.
- **Alignment with sub-project 1:** Clean. Reads `card_interactions`, writes via `EventIngestor`. No new tables. `feishu_card_version` column is trivially `template-a-1`.

### Option B — In-place card update via `im.v1.message.patch` + card state cache

- **Summary:** Same 17 JSON templates, but every button click **patches the existing card** using Feishu's `PATCH /open-apis/im/v1/messages/{message_id}` with updated card JSON. A small `feishu_live_cards` table tracks which `message_id` corresponds to which logical card instance + current state.
- **Card schema:** Same JSON templates as Option A, but each card has a `state` JSON blob that the patch renderer merges.
- **State:** New table `feishu_live_cards` (card_instance_id PK, feishu_message_id, card_type, current_state_json, last_patched_at). Lives in sub-project 2's own schema addendum; does NOT modify any sub-project 1 table.
- **Update semantics:** Button click → Fastify handler → write `card_interactions` + v2 event row → compute new state → PATCH the existing message. Original card mutates in chat.
- **Operator flow:** Review queue card is patched in place: operator approves one → that row in the queue is visually ticked off → card patched → no new message posted. Much cleaner chat history.
- **Pros:**
  1. Chat noise drops dramatically. Learners see one "今日打卡" card that accumulates icons as classmates submit.
  2. Rolling leaderboards and rolling submitter lists work naturally (H3 "first submitter" is visible).
  3. Better UX for admin review queue — zero-scroll flow.
- **Cons:**
  1. Requires a new table `feishu_live_cards` that sub-project 2 owns. Adds schema complexity.
  2. Feishu patch API has rate limits and payload size limits — need to research whether patching 17 cards every few seconds breaks anything (see §6).
  3. Concurrency: two button clicks on the same card before patch completes → lost update unless we serialize per-card_instance.
- **Alignment with sub-project 1:** Cards **reference** sub-project 1 tables read-only for state rendering, but the live card table is orthogonal. Ingestor contract is unchanged.

### Option C — Card DSL + programmatic renderer (component model)

- **Summary:** Instead of JSON templates, define a typed component model in TS: `const quizCard: CardComponent<QuizContext> = Card({ header: ..., elements: [QuestionBlock(q1), SubmitButton(...)] })`. A renderer produces the Feishu card v2 JSON. Ships 17 components in `src/services/feishu/cards/components/`. State handling is like Option A (new card per interaction).
- **Card schema:** TypeScript component functions, not JSON files. Type system enforces that every context field is typed.
- **State:** Stateless, like Option A.
- **Update semantics:** New card per interaction, like Option A.
- **Operator flow:** Same as Option A.
- **Pros:**
  1. Type safety across the entire card surface. Refactoring a context field is caught at compile time.
  2. Reuse: a `MemberBadge(member)` block can render inside leaderboard, level-announcement, and admin member-management cards.
  3. Easier to unit-test specific sub-components (RadarChart(dims), LevelPill(level)).
- **Cons:**
  1. Card v2 JSON has specific syntax for layouts (columns, collapsible panels, form groups). Re-implementing that as a TS DSL is non-trivial — might take longer than writing JSON templates by hand.
  2. Feishu card editor (飞书卡片搭建工具) exports JSON, not TS. Designers can't hand us mockups directly.
  3. Still needs the "new card per click" chat noise tradeoff of Option A.
- **Alignment with sub-project 1:** Same as Option A. Clean.

### Option D — Hybrid: JSON templates + selective in-place patches only for high-frequency cards

- **Summary:** Use JSON templates (Option A) for the 13 "one-shot" cards (Period Open, Window Open, Quiz, Peer Review, Level Announcement, Graduation, LLM Review Pending, LLM Decision, C1 Group Echo, Admin Member Management, Admin Manual Adjust, Peer Review Settle Card, Period Open Card). Use in-place patch (Option B) for the 4 high-frequency cards where rolling state matters: Homework Submit Card (H1+H3 rolling list), Daily Checkin Card (today's list), Leaderboard Card (live AQ), Admin Review Queue Card (tick-off flow).
- **Card schema:** 17 JSON templates. The 4 patched cards have a `state` blob.
- **State:** Minimal `feishu_live_cards` table, but only for 4 card types. Reduces rows significantly.
- **Update semantics:** Mixed. Handler checks `card_type` to decide "patch or reply".
- **Operator flow:** Admin review queue = patched (same good UX as Option B). Most other operator interactions = new card (same simple impl as Option A).
- **Pros:**
  1. Pragmatic middle ground. Matches UX concern to the cards where it matters.
  2. `feishu_live_cards` only tracks 4 card types → fewer rows, simpler lifecycle.
  3. Lets the team defer the patch-API integration work if needed (ship Option A first, upgrade patched cards later with minimal refactor).
- **Cons:**
  1. Two code paths (stateless vs stateful) to maintain and test.
  2. Decision about "which 4 cards patch" is subjective and might shift during implementation.
  3. Developers have to remember which mode each card uses — mental overhead.
- **Alignment with sub-project 1:** Same as Option B but with less table usage.

### Option comparison matrix

| Criterion | Option A (static+new) | Option B (full patch) | Option C (DSL+new) | Option D (hybrid) |
|---|---|---|---|---|
| Implementation cost | Lowest | Highest (patch API work) | High (DSL design) | Medium |
| Chat noise | Highest | Lowest | Highest | Medium |
| Type safety | Low (JSON) | Low (JSON) | High (TS) | Low (JSON) |
| Sub-project 1 schema touched | None | None (new table in sub2 scope) | None | None (new table in sub2 scope) |
| Operator UX (review queue) | Poor (new cards per action) | Great (in-place tick-off) | Poor | Great |
| Rolling list UX (H3, daily checkin) | Poor | Great | Poor | Great |
| Test surface complexity | Low | Medium | Low | Medium |
| Risk of Feishu rate limits | Low | Medium (PATCH limits unknown) | Low | Low-Medium |

---

## 4. Interop with sub-project 1

This section maps card buttons directly to sub-project 1 tables/functions. Sub-project 2 cannot redesign any of this — only decide how cards enter the contract.

### 4.1 Write path: button click → tables

```
card button click
      │
      ▼
POST /api/v2/feishu/card-action-trigger (new route owned by sub-project 2)
      │
      ▼
insert card_interactions                        (spec §2.2.3)
      │   member_id, period_id, card_type, action_name, action_payload,
      │   feishu_message_id, feishu_card_version, received_at
      ▼
EventIngestor.ingest(memberId, itemCode, scoreDelta, sourceRef, payload)
      │   (spec §3.3)
      ▼
insert scoring_item_events                      (spec §2.2.4)
      │   status='pending' or 'approved' depending on needsLlm
      ▼
if needsLlm: insert llm_scoring_tasks           (spec §2.2.9)
      │
      ▼
ScoringAggregator writes member_dimension_scores (spec §3.4)
```

### 4.2 `source_ref` value source (resolves the question in the task)

Per spec §2.2.4, `source_ref` is NOT NULL and is used for `UNIQUE(member_id, period_id, item_code, source_ref)` dedup. For each card source type:

| Card | `source_type` | `source_ref` value | Why it's unique |
|---|---|---|---|
| Daily Checkin (K3, K4, H2, C1, C3, G2) | `card_interaction` | `card_interactions.id` (the uuid of the interaction row) | Each button click gets its own uuid |
| Quiz submission (K1, K2) | `card_interaction` (K1) or `quiz_result` (K2) | For K1: `card_interactions.id`. For K2: `quiz_submission_id` (new table if needed, or `{card_interactions.id}:k2`) | Each quiz card is answered at most once per student per question_set |
| Homework Submit (H1) | `card_interaction` | `card_interactions.id` | Multiple submissions allowed within cap; each gets own row |
| Homework Bonus (H3) | `card_interaction` | `'h3-first-' + periodId` | Only first submitter, which Ingestor's cap logic prevents from firing twice |
| Video Checkin (G1) | `card_interaction` | `'g1-' + periodId + ':' + memberId` | Exactly one G1 per member per period |
| Peer Review (S1, S2) | `card_interaction` | For S1: `'s1-' + peer_review_session_id + ':' + voted_member_id`. For S2: `'s2-' + peer_review_session_id + ':' + voter_member_id` | Per spec §5.3 |
| C2 reactions | `emoji_reaction` | `message_id + ':' + reactionBatchIndex` | Per spec §5.2 |
| Operator manual | `operator_manual` | auto-generated uuid by Ingestor | Per spec §2.2.4 explicit rule |
| LLM retry / re-decision | N/A — same event, Ingestor doesn't re-ingest | — | `ScoringAggregator.applyDecision` updates existing row |

**Decision point for brainstorm:** does sub-project 2 need to know about `source_ref` construction, or does the card-action handler just pass a stable key (e.g., `card_interactions.id`) and let the Ingestor figure it out? Both are valid; the second keeps sub-project 2 ignorant of dedup semantics.

### 4.3 Admin review card → `review_required`

When a `scoring_item_events` row has `status='review_required'` (either because LLM said pass=false and we chose `review_required` path per spec §4.3, OR because LLM retries exhausted per spec §4.3 handleFailure), the Admin Review Queue Card (Card #15) queries:

```
SELECT e.*, m.name, LLMR.reason
FROM scoring_item_events e
JOIN members m ON m.id = e.member_id
LEFT JOIN llm_scoring_tasks LLMR ON LLMR.id = e.llm_task_id
WHERE e.status='review_required'
ORDER BY e.created_at ASC
LIMIT 10 OFFSET ?
```

Operator button click → handler → `ScoringAggregator.applyDecision(eventId, 'approved'|'rejected', note)` (spec §3.4). This is already defined in sub-project 1; sub-project 2 just calls it.

### 4.4 LLM async result → back to a card

Three ways the LLM result can reach a student (brainstorm must pick):

| Method | How it works | Pros | Cons |
|---|---|---|---|
| **New card** (notify-only) | `notifyMemberScoringDecision` sends a fresh "LLM Decision Card" (#13) via DM or group @ | Simple. No card-ID tracking. | Chat noise. Student has to scroll back to find original submission. |
| **In-place edit** | Store `feishu_message_id` when the original daily-checkin echo is sent, then PATCH it with a decision block | Cleanest UX. Student sees the result next to their submission. | Requires `feishu_live_cards` table. Only possible in Option B or D. |
| **Notification thread** | Reply to the original message in a thread (if Feishu supports thread replies to interactive cards — needs verification) | Threaded context. | Feishu thread semantics for interactive messages is unclear; may not be supported. `[unknown: need to verify]` |

### 4.5 `card.action.trigger` callback payload contract (unknown — must verify)

The Feishu `@larksuiteoapi/node-sdk` v1.42.0 (already a dependency) provides a typed handler `P2CardActionTrigger`. Based on the MCP blueprint §6 open question #3, the exact payload shape is **unverified** but expected to contain at minimum:

```
{
  operator: { open_id, union_id, tenant_key },
  token: <callback token, used to respond with updated card JSON>,
  trigger_id: <unique click id>,
  action: { tag, value, name, form_value?, option? },
  host: <im_message | im_chat>,
  context: {
    open_message_id,
    open_chat_id,
    url
  }
}
```

**Decision point for sub-project 2:** Claude the implementer must spike this with a minimal card before committing to handler signatures. See Recommended Next Step §7, step 1.

Two things to verify specifically:
1. Does `operator.open_id` populate reliably when the button is clicked in a **group chat** (vs only in DMs)? Constraint C11 depends on this for admin card security.
2. Does the `token` response model let us return an **updated card JSON** synchronously (a "toast" or "patch in response"), or do we need a separate `message/patch` call afterwards? If sync patching is allowed, Options B and D become much easier to implement.

### 4.6 Sub-project 2's schema addendum (only if Option B or D chosen)

```sql
-- Sub-project 2 owns this table. Sub-project 1 never reads it.
CREATE TABLE feishu_live_cards (
  id TEXT PRIMARY KEY,
  card_type TEXT NOT NULL,
  feishu_message_id TEXT NOT NULL UNIQUE,
  feishu_chat_id TEXT NOT NULL,
  card_version TEXT NOT NULL,
  current_state_json TEXT NOT NULL,
  linked_member_id TEXT NULL,
  linked_window_id TEXT NULL,
  created_at TEXT NOT NULL,
  last_patched_at TEXT NULL
);
CREATE INDEX idx_feishu_live_cards_by_chat_type ON feishu_live_cards (feishu_chat_id, card_type);
```

For Option A and C, no new tables are needed — sub-project 1's `card_interactions` is sufficient.

---

## 5. Open questions (for brainstorming)

Each question below is **decision-forcing**. The user must pick one of the candidates — "think about it later" is not an option because later stages (writing-plans, implementation) will hit the same question and should not re-open it.

### Q1. Should LLM async results be delivered by new card, in-place patch, or thread reply?

- **Why it matters:** Sub-project 1 already calls `notifyMemberScoringDecision(eventId, decision)` as a stub (spec §4.3). Sub-project 2 must implement this callback. The choice constrains Option A/C (no patch → must be new card or thread) vs Option B/D (can patch).
- **Candidate A — New card DM to student:** Simple. Works for every protocol option. But chat noise high, and group echo for C1 makes "my own decision" harder to find.
- **Candidate B — In-place patch of original echo:** Cleanest UX. Forces Option B or D. Requires `feishu_live_cards` table.
- **Candidate C — Thread reply:** Cleanest in theory. Unknown if Feishu supports thread reply to interactive cards — needs a one-day spike. `[unknown: verify against Feishu API docs before relying on it]`

### Q2. Does the daily checkin card show a rolling "今日已打卡" list, or a static card?

- **Why it matters:** Rules §3 (日常打卡卡片 ASCII mockup) shows "今日已打卡：张三🧠 李四💡🔧 王五🌱" as part of the card. If rolling, we must patch (Option B or D). If static, the list lags up to 24 hours and the card under-serves the rule.
- **Candidate A — Rolling patch:** Matches the mockup. Requires patch path. Rebuilds state from `card_interactions` WHERE `period_id=today`.
- **Candidate B — Static "last posted" card, daily re-post:** Every midnight, post a fresh daily checkin card. List is 24h lagged but not live. Option A-compatible.
- **Candidate C — No list at all:** Drop the "已打卡" block. Simpler but less gamification. Rules explicitly show it, so this is a regression.

### Q3. Admin review queue: one paginated card, or one card per pending event?

- **Why it matters:** Directly drives Card #15's interaction model. Affects operator cognitive load when there are 10+ pending events.
- **Candidate A — One paginated card (10 per page):** Operator sees one card with 10 review items. Buttons per row: ✅/❌/✏️. Pagination buttons at bottom. Requires list rendering in card v2 format.
- **Candidate B — One card per pending event:** Each pending event fires a DM to operator with a single compact card. Operator's DM becomes the queue. No pagination code needed.
- **Candidate C — Single status card + external H5 page:** The card only shows a count ("你有 7 条待复核") + `打开复核台` button that opens sub-project 3's H5 page. Pushes the heavy UI to sub-project 3.

### Q4. Should each scoring card show the AQ five-dimension radar, or just the dimension being scored?

- **Why it matters:** Determines card size and render complexity. Radar charts in Feishu cards require image generation (no native radar component). Affects latency budget.
- **Candidate A — Always show five-dim radar:** Consistent visual language. But requires server-side image generation for every card. Latency risk.
- **Candidate B — Show only the dimension being scored (K/H/C/S/G):** Lightweight. A small progress bar "K: 15/20 this period". No image.
- **Candidate C — Radar only on leaderboard and level-announcement cards, bar charts elsewhere:** Mixed. Keeps latency budget for one-shot cards; invests in visual polish for ceremony cards.

### Q5. Can students self-nominate for the 6 LLM-gated items (K3/K4/H2/C1/C3/G2), or must submissions pass a soft validation before LLM ingest?

- **Why it matters:** Abuse vector. Any student can click "提交" and enqueue an LLM task. Attackers could spam the LLM queue with garbage to (a) drain LLM budget (sub-project 4 concern), (b) flood the admin review queue, (c) pad their card_interactions rows for no scoring purpose.
- **Candidate A — Fully open (current spec behavior):** Click → Ingestor → LLM → decision. Relies on `per_period_cap` from spec §3.2 to bound abuse: K3=3, K4=4, H2=3, C1=8, C3=5, G2=6 per student per period. Max LLM calls per student per period = 29. 14 students × 29 = 406 LLM calls per period (upper bound).
- **Candidate B — Rate limit per student per card (in-memory or new table):** E.g., max 20 button clicks per hour per student across all cards. Needs a rate-limit counter. Not in spec; sub-project 2 would own the table.
- **Candidate C — Soft validation on submission length:** Reject client-side and card-side before LLM ingest if `payload_text.length < 20` or if the text is pure whitespace/emoji. Reduces garbage but doesn't stop determined attackers. Add to Ingestor as pre-flight check OR keep in card-handler layer. Changing Ingestor may bleed into sub-project 1's scope — keep it in the card layer.
- **Candidate D — No self-nomination; operator nominates:** Student submits → goes into a "nominated" pending state → operator ticks it before LLM fires. Defeats the "autonomous scoring" principle of rules §3. Not recommended.

### Q6. Homework Submit card H1: file upload inline, or `@学员 请在此消息下回复文件`?

- **Why it matters:** Feishu interactive cards v2 supports file upload as a card input component, but the attachment handling pipeline is different from regular message attachments. Different download scope may apply.
- **Candidate A — Inline card upload:** Student clicks `📎 提交作业` → native file picker → file attached to card → handler extracts. Best UX.
- **Candidate B — "Reply to this message with your file":** Card shows instructions; student replies in chat with the file; the `im.message.receive_v1` handler correlates by reply-to-message-id. Works with current `im:message` scope (spec §5.3, v2 spec §6.2 keeps `normalize-message.ts`).
- **Candidate C — No file upload, just a link:** Students upload to Feishu Drive separately, paste URL into a text input. Simpler but worse UX.

### Q7. Card button callback: synchronous (fast handler, <200ms) or async (handler returns immediately, work queued)?

- **Why it matters:** Feishu `card.action.trigger` has a response timeout. If we block on LLM submit, we'll hit it. Ingestor is synchronous but LLM task enqueue is fast. Still, every click hitting a Fastify route with DB writes → risk if DB is slow.
- **Candidate A — Sync with optimistic response:** Handler writes to `card_interactions` and `scoring_item_events` synchronously, returns success. LLM task queued as a side-effect.
- **Candidate B — Ack first, then process:** Handler returns 200 immediately, pushes a job to an in-process queue. Worker processes.
- **Candidate C — Two-phase card reply:** Card responds immediately with "处理中" toast (Feishu supports `toast` in callback response), then a follow-up send or patch delivers the real result.

### Q8. Should Peer Review cards be DM'd to each student or posted in group with @-mentions?

- **Why it matters:** Privacy + anti-gaming. If posted in group, students can see who classmates are voting for → social pressure. If DM, votes are private.
- **Candidate A — Private DM to each of 14 students:** Privacy preserved. 14 card sends per `/互评`. Rate limit low (14 << 100/min).
- **Candidate B — Group card with private multi-select (Feishu native form controls):** Single card in group, each student's selection only visible to them. `[unknown: verify that Feishu card v2 form_value is per-user private]`
- **Candidate C — Group card with public votes:** Votes public. Simpler impl but social pressure bias.

### Q9. Card internationalization: Chinese only, or Chinese + English?

- **Why it matters:** Pfizer HBU learners are in China; trainers may include non-Chinese operators. Rules are Chinese-only. Cards are Chinese-only in all mockups.
- **Candidate A — Chinese only (spec default):** Matches rules exactly. Simplest. No i18n scaffolding.
- **Candidate B — Chinese + English, operator-facing cards only:** Cards 15/16/17 (admin) get EN copy. Student cards stay Chinese.
- **Candidate C — Full bilingual with per-user locale:** Overkill for 14-person camp. Defer to sub-project 3.

### Q10. Should the system support card version migration (`feishu_card_version` bump)?

- **Why it matters:** Spec §2.2.3 already has `feishu_card_version` column. This is free — but we should decide if we maintain old versions when we patch a card mid-camp, or force-upgrade.
- **Candidate A — Force-upgrade on deploy:** Every deploy increments the version. Old in-chat cards are orphaned (buttons may 404 or return "过期"). Server rejects callbacks with mismatched versions.
- **Candidate B — Versioned handlers:** Ship multiple handlers for v1/v2/v3 so old cards still work. Complexity grows over time.
- **Candidate C — Bounded window (e.g., 7-day grace):** Handlers support last 2 versions. Older versions return "请刷新". Pragmatic middle.

---

## 6. Constraints and risks

| # | Item | Severity | Notes / source |
|---|---|---|---|
| C1 | `card.action.trigger` is NOT in "event config" tab — it's in "callback config" tab | blocker | MCP blueprint §4.3. Easy to miss. Deploy checklist must verify it. |
| C2 | Subscription must be long-connection (not HTTPS callback) | high | MCP blueprint §4.4 confirms this was verified 2026-04-09 on `cli_a95a5b91b8b85cce`. SWAS/Cloudflare Tunnel NOT needed for cards. |
| C3 | `im:message:send_as_bot` is the ONLY scope needed to send interactive cards (`msg_type=interactive`) | medium | MCP blueprint §4.1 #2. Contrary to earlier assumptions about `im:message.interactive` scope which **does not exist**. |
| C4 | Feishu card v2 payload size limit | high | `[unknown: need to verify]` — need to look up the actual byte limit for a single card. Leaderboard/daily-checkin cards with 14 learners may approach limits. |
| C5 | Feishu card API rate limits per tenant | high | `[unknown: need to verify]` — specifically for `im.v1.message.create` (send) and `im.v1.message.patch` (update if using Option B/D). Estimate: ~100/min is typical but must confirm. |
| C6 | `im.v1.message.patch` exists and is usable for card updates | blocker for B/D | `[unknown: need to verify endpoint exists + the interactive card can be patched this way]`. If it does NOT exist, Options B and D are dead. |
| C7 | Card element count / nested structure depth limits | medium | `[unknown: need to verify]`. Impacts admin review queue card (may not fit 10 rows in one card) and daily-checkin list. |
| C8 | Scoring event volume estimate | low | Rules + spec §2.4 estimate ~2000 card_interactions and ~1500 scoring events total across 12 periods × 14 learners. That's ~10/day average. Not a rate concern. |
| C9 | Privacy: cards broadcast to group vs DM to student | medium | Cards #1-#5, #7-#11, #14 broadcast. #6, #12, #13 ideally DM. Admin cards DM to operator. Brainstorm Q8 must confirm peer review card visibility. |
| C10 | Anti-troll: students can self-nominate (submit K3/K4/C1/C3/G2) | medium | Already capped at `per_period_cap`. No current rate limit. Q5 covers this. |
| C11 | Operator identity: `X-Feishu-Open-Id` header for admin cards | medium | Spec §5.11. Cards must pass operator open_id to admin handlers. `card.action.trigger` payload includes `operator.open_id` per Feishu docs. Need verification that this field is populated on button clicks from group chats (not just DMs). `[unknown: verify]` |
| C12 | Echo of C1 creative usage to group (#14 card) must NOT include rejected entries | high | Spec §5.2 explicit rule: "C1 被 LLM 判不通过时不转发到群". Handler must gate on decision before posting the echo. |
| C13 | LLM Review Pending Card (#12) may flood group if LLM queue backs up | medium | If LLM workers are slow and 14 learners all submit C1 at once, that's 14 pending cards within a minute. Consider batching or DM instead of group broadcast. |
| C14 | Concurrent button clicks on same card | medium | Options B/D need per-card_instance serialization to avoid lost updates. SQLite row-level `BEGIN IMMEDIATE` transactions suffice. |
| C15 | Broken/expired cards after version bump (Q10) | low | Mitigated by Q10 choice. |
| C16 | File upload (Q6, Card #4 H1) requires `im:message` scope (covered) + file download handler | medium | MCP blueprint §4.1 #1 confirms `im:message` covers file download. Volume: 14 learners × 11 scoring periods × 1 homework = 154 files total. Trivial. |
| C17 | Reaction tracking for C2 requires `im:message.reactions:read` + event subscription | low | Already in sub-project 1 spec §5.2. Sub-project 2 implements the subscriber handler. |
| C18 | `card_interactions` table has `feishu_message_id` nullable (spec §2.2.3) but we rely on it for Option B/D | medium | Sub-project 2 should never accept a button callback without a `feishu_message_id`. Add app-level non-null check. |

**Severity key:** `blocker` = cannot ship without resolving; `high` = significant work if wrong; `medium` = handleable; `low` = noted.

---

## 7. Recommended next step

The user should brainstorm all 10 open questions, but **Q1, Q2, Q3, and Q6** gate the choice of protocol design option (they determine whether in-place patch is required). Specifically:

1. **First resolve Q1 + Q2 + Q3 together** — they all depend on whether the Feishu `im.v1.message.patch` endpoint exists and is usable for interactive cards (constraint C6 must be verified in parallel). If patch is NOT available, Options B and D collapse into Option A, and Q1/Q2/Q3 answers are forced to "new card" variants.
2. **Then resolve Q6** — file upload mechanism affects the Homework Submit Card implementation independently of the patch question.
3. **Then resolve Q4, Q5, Q7** — these are UX and abuse-handling questions that are independent of the protocol choice.
4. **Q8, Q9, Q10** can be decided last — policy rather than architecture.

**Verification task before brainstorming:** spend 30 minutes confirming constraints C4, C5, C6, C7, C11 against the Feishu `@larksuiteoapi/node-sdk` v1.42.0 docs and the public Feishu card v2 reference. Several design choices will evaporate if C6 (patch endpoint) is not usable.

Once these questions are answered, sub-project 2 can proceed to a design spec (not covered here) that maps each of the 17 cards to (a) JSON template path, (b) callback handler name, (c) `source_ref` construction rule, (d) audience, (e) state persistence choice. That design spec is the direct input to `superpowers:writing-plans`.
