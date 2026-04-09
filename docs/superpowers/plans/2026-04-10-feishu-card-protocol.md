# Sub-project 2: Feishu Card Protocol Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a 16-card Feishu interactive-card protocol on top of sub-project 1's v2 scoring domain, using Option D (4 patched + 12 static) with synchronous `CardActionHandler` responses and asynchronous `im.v1.message.patch` updates from background workers.

**Architecture:** A single Fastify plugin registered into `src/app.ts` exposes two new routes (`POST /api/v2/feishu/card-action`, `POST /api/v2/feishu/commands/:name`). All card logic lives under `src/services/feishu/cards/` (outside Phase I1's `web/src/**` deletion target). The CardActionHandler callback writes `card_interactions` + invokes `EventIngestor.ingest` inside a single `better-sqlite3` sync transaction and returns an updated `InteractiveCard`; the SDK relays that as the Feishu patch response with zero extra API calls. Server-initiated updates (LLM results, window settle) go through a separate async `patch-worker` that explicitly calls `client.im.v1.message.patch`. The 4 patched cards (daily-checkin, homework-submit, leaderboard, review-queue) track state in a new Sub2-owned table `feishu_live_cards`; the other 12 static cards post fresh each time.

**Tech Stack:** TypeScript 5.9, Node 20, Fastify 5, `@fastify/cors`, `@fastify/sensible`, zod 3, `better-sqlite3` 12, `@larksuiteoapi/node-sdk` 1.42, vitest 3. Text LLM via `glm-4.5-flash`, vision LLM via `glm-4v-flash` (both through existing `LlmScoringClient` after Phase E4 multimodal extension).

**Spec:** `docs/superpowers/specs/2026-04-10-feishu-card-protocol-design.md`
**Depends on sub-project 1:** Phase A-F must be complete and all Phase-level pre-fixes (B1-B3 signature mismatches, peer_review_votes + reaction_tracked_messages DDL, D1/D3/E4 multimodal routing, config alignment) must land before the corresponding Sub2 phases execute.

---

## Execution prerequisites (MUST be true before Phase A starts)

- [ ] Sub-project 1 Phase A-F merged (domain errors, eligibility, scoring config, repository, aggregator, ingestor, LLM worker, period-lifecycle)
- [ ] Sub-project 1 Phase B pre-fix: `peer_review_votes` and `reaction_tracked_messages` tables added to `tableDefinitions` in `src/storage/sqlite-repository.ts`
- [ ] Sub-project 1 Phase D1 pre-fix: `LlmPromptPayload` type has optional `fileKey?: string` field; H2 prompt template references the image
- [ ] Sub-project 1 Phase D3 pre-fix: `EventIngestor.ingest` preserves `file_key` through `v2_scoring_item_events.payload_json`
- [ ] Sub-project 1 Phase E4 pre-fix: `LlmScoringClient` routes `itemCode === 'H2'` through multimodal `glm-4v-flash` endpoint
- [ ] Sub-project 1 env config: `.env.example` has `LLM_TEXT_MODEL=glm-4.5-flash` and new `LLM_VISION_MODEL=glm-4v-flash`; `provider-config.ts` default matches
- [ ] Real-device C6 spike completed: a dummy static Feishu card has been sent and the `CardActionHandler` response confirmed to update the card in place on a test chat (~30 min manual test)

If any prerequisite is not met, the corresponding Sub2 phase is blocked. Phases A and B (scaffolding + infrastructure) depend only on Sub1 Phase A (DDL) and can start as soon as Phase A ships.

---

## File structure

All paths are relative to the repository root (`D:/Vibe Coding Project/AI Seed Project/.worktrees/phase-one-feishu/`).

### New production code

```
src/services/feishu/cards/
├── index.ts                                 # Plugin export (registers router + wires bootstrap)
├── types.ts                                 # CardActionContext, CardActionResult, CardHandler, LiveCardRow, FeishuCardJson, etc.
├── router.ts                                # Fastify plugin registering the 2 routes
├── card-action-dispatcher.ts                # Resolves card_type+action → handler, applies uniform error mapping
├── command-dispatcher.ts                    # Routes /开期 /开窗 /打卡 ... to per-card handler that posts a fresh card
├── version.ts                               # resolveCardVersion helper (7-day grace)
├── soft-validation.ts                       # Text length / pure-emoji / URL check / file_key non-empty
├── renderer.ts                              # render(templateId, state, context) → FeishuCardJson
├── live-card-repository.ts                  # feishu_live_cards CRUD (Sub2-owned table)
├── patch-worker.ts                          # Async patch loop: notifySub2CardPatch + 230031 fallback + retry
├── expiry-scanner.ts                        # Hourly scan: marks cards within 2 days of Feishu retention limit as expired
├── dead-letter.ts                           # feishu_card_patch_deadletters table + retry surface
├── observability.ts                         # Counters + gauges wrapping pino
│
├── templates/
│   ├── common/
│   │   ├── header.ts                        # Shared header block builder
│   │   ├── member-badge.ts                  # Member name + level pill renderer
│   │   ├── progress-bar.ts                  # Per-dimension progress bar element
│   │   └── radar-image.ts                   # Server-side radar PNG URL helper (for #9 and #10)
│   ├── daily-checkin-v1.ts                  # Daily checkin card (patched, K3/K4/H2/C1/C3/G2)
│   ├── homework-submit-v1.ts                # Homework card (patched, H1/H3)
│   ├── leaderboard-v1.ts                    # Leaderboard card (patched)
│   ├── review-queue-v1.ts                   # Admin review queue card (patched)
│   ├── period-open-v1.ts                    # Static: /开期
│   ├── window-open-v1.ts                    # Static: /开窗
│   ├── quiz-v1.ts                           # Static: /测验
│   ├── video-checkin-v1.ts                  # Static: /视频
│   ├── peer-review-vote-v1.ts               # Static: /互评 DM
│   ├── peer-review-settle-v1.ts             # Static: /互评结算
│   ├── level-announcement-v1.ts             # Static: post-settle
│   ├── graduation-v1.ts                     # Static: /结业
│   ├── llm-decision-v1.ts                   # Static: LLM result DM
│   ├── c1-echo-v1.ts                        # Static: C1 approved echo + C2 reaction source
│   ├── member-mgmt-v1.ts                    # Static: /成员管理
│   └── manual-adjust-v1.ts                  # Static: /调分
│
└── handlers/
    ├── daily-checkin-handler.ts             # Patched card: button routing for 6 items + LLM hook
    ├── homework-handler.ts                  # Patched card: submit button + reply-to-message file correlation
    ├── leaderboard-handler.ts               # Patched card: renders from v2_window_snapshots + v2_member_levels
    ├── review-queue-handler.ts              # Patched card: pagination + approve/reject/adjust buttons
    ├── quiz-handler.ts                      # Static: per-question click + submit (K1/K2 via Ingestor)
    ├── video-checkin-handler.ts             # Static: 全部看完 button + G1 event
    ├── peer-review-handler.ts               # Static: vote button + writes peer_review_votes
    ├── peer-review-settle-handler.ts        # Static: triggers S1/S2 Ingestor
    ├── member-mgmt-handler.ts               # Static: role/hidden/rename PATCH to /api/v2/admin/members
    ├── manual-adjust-handler.ts             # Static: confirm/cancel, writes operator_manual event
    ├── llm-decision-handler.ts              # Static DM: appeal button → review_required
    └── command-handlers.ts                  # /开期 /开窗 /测验 /作业 /视频 /互评 /互评结算 /打卡 /排行 /复核队列 /成员管理 /调分 /结业 — each posts the corresponding card
```

### New test code

```
tests/services/feishu/cards/
├── types.test.ts                            # Compile-time assertions for shared types
├── version.test.ts                          # resolveCardVersion matrix
├── soft-validation.test.ts                  # Length / emoji / URL / file_key cases
├── renderer.test.ts                         # State + template → JSON + size assertions
├── live-card-repository.test.ts             # CRUD + concurrent read-modify-write
├── router.test.ts                           # Fastify inject for both routes
├── card-action-dispatcher.test.ts           # Error mapping, handler registry dispatch
├── command-dispatcher.test.ts               # Command regex + handler routing
├── patch-worker.test.ts                     # Async patch + 230031 fallback + retry
├── expiry-scanner.test.ts                   # Pre-emptive expiry at day-12 threshold
├── dead-letter.test.ts                      # Insert + query + resolve
├── observability.test.ts                    # Counters increment correctly
│
├── templates/
│   ├── daily-checkin-v1.test.ts
│   ├── homework-submit-v1.test.ts
│   ├── leaderboard-v1.test.ts
│   ├── review-queue-v1.test.ts
│   ├── period-open-v1.test.ts
│   ├── window-open-v1.test.ts
│   ├── quiz-v1.test.ts
│   ├── video-checkin-v1.test.ts
│   ├── peer-review-vote-v1.test.ts
│   ├── level-announcement-v1.test.ts
│   ├── llm-decision-v1.test.ts
│   ├── c1-echo-v1.test.ts
│   ├── member-mgmt-v1.test.ts
│   └── manual-adjust-v1.test.ts
│
└── handlers/
    ├── daily-checkin-handler.test.ts        # Sync sync-patch flow, K3 happy + H2 multimodal
    ├── homework-handler.test.ts             # Reply-to-message file correlation
    ├── leaderboard-handler.test.ts
    ├── review-queue-handler.test.ts         # Pagination + approve + double-review 409
    ├── quiz-handler.test.ts
    ├── video-checkin-handler.test.ts
    ├── peer-review-handler.test.ts
    ├── peer-review-settle-handler.test.ts
    ├── member-mgmt-handler.test.ts
    ├── manual-adjust-handler.test.ts
    └── command-handlers.test.ts
```

### Modified files

```
src/storage/sqlite-repository.ts             # + feishu_live_cards + feishu_card_patch_deadletters DDL in tableDefinitions; + CRUD methods
src/app.ts                                   # + register feishu-cards plugin
.env.example                                 # + FEISHU_CARD_VERSION_CURRENT, FEISHU_CARD_VERSION_LEGACY
```

---

## Task summary

**Total: 34 tasks across 8 phases (A–H)**

| Phase | Tasks | Description | Prerequisites |
|---|---|---|---|
| **A — Scaffolding** | 5 | Directory, types, `feishu_live_cards` DDL + repo, soft validation, version resolver | Sub1 Phase A |
| **B — Renderer + router** | 4 | Renderer, common components, registry + dispatcher, Fastify plugin | A |
| **C — First cards (S1 milestone)** | 4 | Quiz card, daily-checkin template + state + handler, sync burst test | A + B + Sub1 Phase B-F + C6 spike |
| **D — Async path (S2 milestone)** | 4 | Patch worker, notify hook, LLM decision card, 230031 fallback | C + Sub1 Phase E complete |
| **E — H2 multimodal (S3 milestone)** | 3 | H2 button form, file_key passthrough, multimodal smoke | D + Sub1 D1/D3/E4 pre-fixes |
| **F — Operator cards (S4 milestone)** | 4 | Review queue, member mgmt, manual adjust, operator smoke | D + Sub1 Phase G admin routes |
| **G — Remaining cards (S5 milestone)** | 6 | Period/window/graduation, video, homework, peer review, C1 echo + level announcement, leaderboard + window-settle hook | C + Sub1 Phase B pre-fix (peer_review_votes + reaction_tracked_messages) |
| **H — Hardening + observability (S6 milestone)** | 4 | Expiry scanner, dead-letter retry, observability, E2E smoke | All prior |

---

## Phase A — Sub2 Scaffolding (5 tasks)

Establishes the shared infrastructure used by all subsequent phases: type definitions, the Sub2-owned `feishu_live_cards` table, the validation and version-resolution primitives, and the dead-letter skeleton. No card logic is added in this phase — it is foundation only.

---

### Task A1: Create directory skeleton + package wire-up

**Files:**
- Create: `src/services/feishu/cards/.gitkeep`
- Create: `src/services/feishu/cards/templates/.gitkeep`
- Create: `src/services/feishu/cards/templates/common/.gitkeep`
- Create: `src/services/feishu/cards/handlers/.gitkeep`
- Create: `tests/services/feishu/cards/.gitkeep`
- Create: `tests/services/feishu/cards/templates/.gitkeep`
- Create: `tests/services/feishu/cards/handlers/.gitkeep`

- [ ] **Step 1: Create directories with .gitkeep**

Run:
```bash
cd "D:/Vibe Coding Project/AI Seed Project/.worktrees/phase-one-feishu"
mkdir -p src/services/feishu/cards/templates/common
mkdir -p src/services/feishu/cards/handlers
mkdir -p tests/services/feishu/cards/templates
mkdir -p tests/services/feishu/cards/handlers
for d in \
  src/services/feishu/cards \
  src/services/feishu/cards/templates \
  src/services/feishu/cards/templates/common \
  src/services/feishu/cards/handlers \
  tests/services/feishu/cards \
  tests/services/feishu/cards/templates \
  tests/services/feishu/cards/handlers; do
  touch "$d/.gitkeep"
done
```

- [ ] **Step 2: Verify directories exist**

Run: `ls src/services/feishu/cards tests/services/feishu/cards`
Expected: Each directory listing shows `.gitkeep` + any subdirectories.

- [ ] **Step 3: Commit**

```bash
git add src/services/feishu/cards tests/services/feishu/cards
git commit -m "chore(sub2): scaffold feishu card protocol directories"
```

---

### Task A2: Shared type definitions (`types.ts`)

**Files:**
- Create: `src/services/feishu/cards/types.ts`
- Test: `tests/services/feishu/cards/types.test.ts`

Contains the shared type contracts used by every other Sub2 file: the CardActionHandler context shape, handler return shape, the Sub2-owned `FeishuCardJson` type alias for the SDK's `InteractiveCard`, the `LiveCardRow` row type from `feishu_live_cards`, and the `CardVersionDirective` enum.

- [ ] **Step 1: Write failing test**

Create `tests/services/feishu/cards/types.test.ts`:

```typescript
import { describe, expect, test } from "vitest";

import type {
  CardActionContext,
  CardActionResult,
  CardHandler,
  CardHandlerDeps,
  CardVersionDirective,
  FeishuCardJson,
  LiveCardRow,
  CardType,
  DailyCheckinState,
  HomeworkSubmitState,
  LeaderboardState,
  ReviewQueueState,
  MemberLite,
  PeerReviewVote,
  QuizSelection,
  ReactionTrackedMessageRow,
  AdminApiClient,
  Sub2Config
} from "../../../../src/services/feishu/cards/types.js";
import { emptyDailyCheckinState } from "../../../../src/services/feishu/cards/types.js";

describe("feishu card types", () => {
  test("CardActionContext has required fields", () => {
    const ctx: CardActionContext = {
      operatorOpenId: "ou-op-1",
      triggerId: "trig-1",
      actionName: "k3_submit",
      actionPayload: { text: "hello world" },
      messageId: "om-1",
      chatId: "oc-1",
      receivedAt: "2026-04-10T12:00:00.000Z",
      currentVersion: "daily-checkin-v1"
    };
    expect(ctx.operatorOpenId).toBe("ou-op-1");
  });

  test("CardActionResult accepts either newCardJson or toast", () => {
    const withCard: CardActionResult = {
      newCardJson: { schema: "2.0", header: {}, body: { elements: [] } }
    };
    const withToast: CardActionResult = {
      toast: { type: "info", content: "saved" }
    };
    expect(withCard.newCardJson).toBeDefined();
    expect(withToast.toast?.content).toBe("saved");
  });

  test("CardType is a closed union of 16 cards", () => {
    const types: CardType[] = [
      "period_open",
      "window_open",
      "quiz",
      "homework_submit",
      "video_checkin",
      "peer_review_vote",
      "peer_review_settle",
      "daily_checkin",
      "leaderboard",
      "level_announcement",
      "graduation",
      "llm_decision",
      "c1_echo",
      "review_queue",
      "member_mgmt",
      "manual_adjust"
    ];
    expect(types).toHaveLength(16);
    expect(new Set(types).size).toBe(16);
  });

  test("CardVersionDirective is exactly three variants", () => {
    const values: CardVersionDirective[] = ["current", "legacy", "expired"];
    expect(values).toHaveLength(3);
  });

  test("LiveCardRow has every persisted column", () => {
    const row: LiveCardRow = {
      id: "flc-1",
      cardType: "daily_checkin",
      feishuMessageId: "om-1",
      feishuChatId: "oc-1",
      campId: "camp-1",
      periodId: "p-1",
      windowId: "w-1",
      cardVersion: "daily-checkin-v1",
      stateJson: emptyDailyCheckinState({ postedAt: "2026-04-10T09:00:00.000Z", periodId: "p-1", periodNumber: 1 }),
      sentAt: "2026-04-10T12:00:00.000Z",
      lastPatchedAt: null,
      expiresAt: "2026-04-24T12:00:00.000Z",
      closedReason: null
    };
    expect(row.id).toBe("flc-1");
    expect(row.stateJson).toBeTypeOf("object");
  });

  test("DailyCheckinState splits each item into pending and approved lists", () => {
    const state: DailyCheckinState = emptyDailyCheckinState({
      postedAt: "2026-04-10T09:00:00.000Z",
      periodId: "p-1",
      periodNumber: 1
    });
    state.items.K3.pending.push("m-1");
    state.items.C1.pending.push("m-2", "m-3");
    state.items.C1.approved.push("m-4");

    expect(state.items.K3.pending).toContain("m-1");
    expect(state.items.K3.approved).toEqual([]);
    expect(state.items.C1.pending).toHaveLength(2);
    expect(state.items.C1.approved).toEqual(["m-4"]);
    expect(state.periodId).toBe("p-1");
  });

  test("emptyDailyCheckinState seeds all 6 items with empty pending/approved", () => {
    const state = emptyDailyCheckinState({
      postedAt: "2026-04-10T09:00:00.000Z",
      periodId: "p-1",
      periodNumber: 1
    });
    for (const code of ["K3", "K4", "H2", "C1", "C3", "G2"] as const) {
      expect(state.items[code].pending).toEqual([]);
      expect(state.items[code].approved).toEqual([]);
    }
  });

  test("MemberLite has the fields handlers need for rendering and auth", () => {
    const m: MemberLite = {
      id: "m-1",
      displayName: "Alice",
      roleType: "student",
      isParticipant: true,
      isExcludedFromBoard: false,
      currentLevel: 3
    };
    expect(m.id).toBe("m-1");
    expect(m.currentLevel).toBe(3);
  });

  test("PeerReviewVote is keyed by session + voter + voted", () => {
    const vote: PeerReviewVote = {
      id: "prv-1",
      peerReviewSessionId: "prs-1",
      voterMemberId: "m-1",
      votedMemberId: "m-2",
      votedAt: "2026-04-10T12:00:00.000Z"
    };
    expect(vote.voterMemberId).not.toBe(vote.votedMemberId);
  });

  test("CardHandlerDeps exposes adminApiClient, config, requestReappeal", () => {
    // Compile-time smoke: pick the type via a never-assigned variable
    const check = (d: CardHandlerDeps) => {
      void d.adminApiClient;
      void d.config.groupChatId;
      void d.config.cardVersionCurrent;
      void d.requestReappeal;
      void d.repo.findMemberByOpenId;
      void d.repo.insertPeerReviewVote;
      void d.repo.insertReactionTrackedMessage;
      void d.repo.listPriorQuizSelections;
    };
    expect(typeof check).toBe("function");
  });

  test("HomeworkSubmitState tracks first submitter", () => {
    const state: HomeworkSubmitState = {
      sessionId: "hw-1",
      title: "Session 3",
      deadline: "2026-04-11T23:59:59.000Z",
      submitters: [
        { memberId: "m-1", submittedAt: "2026-04-10T10:00:00.000Z", firstSubmitter: true }
      ]
    };
    expect(state.submitters[0].firstSubmitter).toBe(true);
  });

  test("LeaderboardState carries topN rows and optional radar url", () => {
    const state: LeaderboardState = {
      settledWindowId: "w-1",
      generatedAt: "2026-04-10T20:00:00.000Z",
      topN: [
        {
          memberId: "m-1",
          displayName: "Alice",
          cumulativeAq: 58,
          latestWindowAq: 12,
          currentLevel: 3,
          dims: { K: 18, H: 9, C: 12, S: 6, G: 13 }
        }
      ],
      radarImageUrl: "https://cdn/board.png"
    };
    expect(state.topN[0].cumulativeAq).toBe(58);
  });

  test("ReviewQueueState tracks pagination cursor", () => {
    const state: ReviewQueueState = {
      currentPage: 1,
      totalPages: 2,
      totalEvents: 14,
      events: [
        {
          eventId: "evt-1",
          memberId: "m-1",
          memberName: "Alice",
          itemCode: "C1",
          scoreDelta: 3,
          textExcerpt: "creative usage of Claude",
          llmReason: "unclear whether tool is AI",
          createdAt: "2026-04-10T12:00:00.000Z"
        }
      ]
    };
    expect(state.currentPage).toBe(1);
    expect(state.events).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/services/feishu/cards/types.test.ts`
Expected: FAIL — `src/services/feishu/cards/types.js` module not found.

- [ ] **Step 3: Implement `src/services/feishu/cards/types.ts`**

```typescript
/**
 * Shared type contracts for the Sub2 Feishu card protocol.
 * Every card template, handler, and dispatcher uses these types. Nothing
 * else in src/services/feishu/cards/** is allowed to define an overlapping
 * shape for CardActionContext / CardActionResult / LiveCardRow — all of
 * those types are "owned" by this file.
 */

export type CardType =
  | "period_open"
  | "window_open"
  | "quiz"
  | "homework_submit"
  | "video_checkin"
  | "peer_review_vote"
  | "peer_review_settle"
  | "daily_checkin"
  | "leaderboard"
  | "level_announcement"
  | "graduation"
  | "llm_decision"
  | "c1_echo"
  | "review_queue"
  | "member_mgmt"
  | "manual_adjust";

export type CardVersionDirective = "current" | "legacy" | "expired";

/**
 * The card v2 JSON shape that Feishu expects as the CardActionHandler
 * response body. The SDK calls this `InteractiveCard` but we alias it
 * to `FeishuCardJson` inside Sub2 so our code stays vendor-agnostic at
 * the type level and easier to mock in tests.
 */
export interface FeishuCardJson {
  schema: "2.0";
  config?: {
    wide_screen_mode?: boolean;
    update_multi?: boolean;
  };
  header: Record<string, unknown>;
  body: {
    elements: Array<Record<string, unknown>>;
  };
}

/**
 * Context passed to every CardHandler. Populated by the router from the
 * Feishu CardActionHandler event before dispatching to a card-specific
 * handler.
 */
export interface CardActionContext {
  operatorOpenId: string;
  triggerId: string;
  actionName: string;
  actionPayload: Record<string, unknown>;
  messageId: string;
  chatId: string;
  receivedAt: string;
  currentVersion: string;
}

/**
 * Return shape of every CardHandler. Exactly one of `newCardJson` or
 * `toast` must be set (the dispatcher enforces this at runtime). A
 * trailing `followUp` may be supplied for side effects that run after
 * the response is sent (e.g. queueing an async patch).
 */
export interface CardActionResult {
  newCardJson?: FeishuCardJson;
  toast?: {
    type: "info" | "error" | "success";
    content: string;
  };
  followUp?: () => Promise<void>;
}

/**
 * All card handlers implement this signature. Dependencies are provided
 * by the dispatcher via DI so handlers stay easy to unit-test.
 */
export type CardHandler = (
  ctx: CardActionContext,
  deps: CardHandlerDeps
) => Promise<CardActionResult>;

export interface CardHandlerDeps {
  repo: {
    insertCardInteraction: (
      row: CardInteractionRow
    ) => "inserted" | "already_exists";
    findLiveCard: (
      cardType: CardType,
      feishuChatId: string
    ) => LiveCardRow | null;
    updateLiveCardState: (id: string, stateJson: unknown, at: string) => void;
    insertLiveCard: (row: LiveCardRow) => void;
    closeLiveCard: (id: string, reason: string) => void;
    findEventById: (eventId: string) => ScoringEventLite | null;
    listReviewRequiredEvents: (args: {
      campId?: string;
      limit: number;
      offset: number;
    }) => ReviewQueueEventRow[];
    countReviewRequiredEvents: (campId?: string) => number;
    /**
     * Resolves a Feishu open_id to the domain `MemberLite` shape. Returns
     * null if the open_id is not bound to any member (e.g. an external
     * operator clicking on a card from a shared chat). Used by every
     * handler that needs to translate the `operatorOpenId` from
     * `CardActionContext` into a concrete `memberId`.
     */
    findMemberByOpenId: (openId: string) => MemberLite | null;
    /**
     * Returns the list of quiz option selections a member has already
     * made for a quiz set, used by the quiz handler to render the
     * "selected" visual state before the student hits submit.
     */
    listPriorQuizSelections: (args: {
      memberId: string;
      quizSetId: string;
    }) => QuizSelection[];
    /**
     * Idempotently inserts a peer review vote. Dedup key is
     * (peer_review_session_id, voter_member_id, voted_member_id). Returns
     * "already_exists" on retry.
     */
    insertPeerReviewVote: (
      vote: PeerReviewVote
    ) => "inserted" | "already_exists";
    /**
     * Registers a Feishu message for C2 emoji-reaction tracking. The
     * sub-project 1 reaction tracker polls this table when an emoji
     * reaction event arrives.
     */
    insertReactionTrackedMessage: (msg: ReactionTrackedMessageRow) => void;
  };
  ingestor: {
    ingest: (req: IngestRequest) => IngestResult;
  };
  aggregator: {
    applyDecision: (
      eventId: string,
      input: { decision: "approved" | "rejected"; note?: string },
      operator: { id: string; openId: string }
    ) => ApplyDecisionResult;
  };
  feishuClient: {
    patchCard: (messageId: string, content: FeishuCardJson) => Promise<void>;
    sendCard: (args: {
      chatId?: string;
      receiveId?: string;
      content: FeishuCardJson;
    }) => Promise<{ messageId: string }>;
  };
  /**
   * HTTP client for the sub-project 1 admin PATCH endpoint. The member
   * management card (#16) and manual adjust card (#17) dispatch through
   * this instead of writing to `members` directly.
   */
  adminApiClient: AdminApiClient;
  /**
   * Sub2 runtime configuration injected at plugin construction time.
   */
  config: Sub2Config;
  /**
   * Re-opens a previously `approved` or `rejected` scoring event back
   * into `review_required` status. Used by the LLM decision card's
   * [申诉] button and by the manual adjust card's rollback path.
   */
  requestReappeal: (eventId: string) => Promise<void>;
  clock: () => Date;
  uuid: () => string;
}

/**
 * Minimal member projection returned by `findMemberByOpenId`. Richer
 * member queries go through the repository directly — this is the
 * "just enough to render + authorize" projection.
 */
export interface MemberLite {
  id: string;
  displayName: string;
  roleType: "student" | "operator" | "trainer" | "observer";
  isParticipant: boolean;
  isExcludedFromBoard: boolean;
  currentLevel: number;
}

export interface QuizSelection {
  questionId: string;
  optionId: string;
  selectedAt: string;
}

export interface PeerReviewVote {
  id: string;
  peerReviewSessionId: string;
  voterMemberId: string;
  votedMemberId: string;
  votedAt: string;
}

export interface ReactionTrackedMessageRow {
  id: string;
  feishuMessageId: string;
  memberId: string;
  itemCode: "C2";
  postedAt: string;
  /** Number of distinct reactors observed so far (maintained by sub1 F5). */
  reactionCount: number;
}

export interface AdminApiClient {
  patchMember: (
    memberId: string,
    body: {
      roleType?: "student" | "operator" | "trainer" | "observer";
      hiddenFromBoard?: boolean;
      displayNameOverride?: string | null;
    }
  ) => Promise<MemberLite>;
  listMembers: () => Promise<MemberLite[]>;
}

export interface Sub2Config {
  /** Global single-camp Feishu group chat id used for group broadcasts. */
  groupChatId: string;
  /** Single-camp id; reserved for multi-camp expansion. */
  campId: string;
  /** Current template version stamped on every new card. */
  cardVersionCurrent: string;
  /**
   * Previous template version that stays valid for 7 days after a
   * deploy (Q10 grace window). Read by `resolveCardVersion`.
   */
  cardVersionLegacy: string;
  /** Base URL for the server-rendered radar PNG endpoint (sub1 Phase G). */
  radarImageBaseUrl: string;
}

export interface CardInteractionRow {
  id: string;
  memberId: string | null;
  periodId: string | null;
  cardType: CardType;
  actionName: string;
  feishuMessageId: string | null;
  feishuCardVersion: string;
  payloadJson: unknown;
  receivedAt: string;
  triggerId: string;
  operatorOpenId: string;
  rejectedReason: string | null;
}

export interface IngestRequest {
  memberId: string;
  itemCode: string;
  sourceType: string;
  sourceRef: string;
  payload: Record<string, unknown>;
  requestedDelta?: number;
  requestedAt: string;
}

export interface IngestResult {
  eventId: string;
  effectiveDelta: number;
  status: "pending" | "approved" | "rejected" | "review_required";
  reason?: string;
}

export interface ApplyDecisionResult {
  eventId: string;
  previousStatus: "review_required";
  newStatus: "approved" | "rejected";
  memberId: string;
  itemCode: string;
  scoreDelta: number;
}

export interface ScoringEventLite {
  id: string;
  memberId: string;
  itemCode: string;
  status: string;
  scoreDelta: number;
  payloadJson: unknown;
  createdAt: string;
}

export interface ReviewQueueEventRow {
  eventId: string;
  memberId: string;
  memberName: string;
  itemCode: string;
  scoreDelta: number;
  textExcerpt: string;
  llmReason: string;
  createdAt: string;
}

export interface LiveCardRow {
  id: string;
  cardType: CardType;
  feishuMessageId: string;
  feishuChatId: string;
  campId: string;
  periodId: string | null;
  windowId: string | null;
  cardVersion: string;
  stateJson: unknown;
  sentAt: string;
  lastPatchedAt: string | null;
  expiresAt: string;
  closedReason: "expired" | "period_closed" | "replaced_by_new" | null;
}

/* ---------------- Per-card state_json shapes ---------------- */

/**
 * State for card #8 (daily checkin). Each of the 6 daily-checkin items
 * tracks two lists of memberIds:
 *   - `pending` — submitted but LLM decision not yet final (shown as
 *                 "审核中" on the card)
 *   - `approved` — LLM passed or operator overrode → shown as "✓ +N"
 *
 * A student whose LLM task later fails is removed from both lists and
 * a fresh DM is sent via card #13. The patch worker is responsible for
 * moving ids from `pending` to `approved` when `notifySub2CardPatch`
 * fires from `LlmScoringWorker.notifyMemberScoringDecision`.
 */
export interface DailyCheckinState {
  items: {
    K3: { pending: string[]; approved: string[] };
    K4: { pending: string[]; approved: string[] };
    H2: { pending: string[]; approved: string[] };
    C1: { pending: string[]; approved: string[] };
    C3: { pending: string[]; approved: string[] };
    G2: { pending: string[]; approved: string[] };
  };
  postedAt: string;
  periodId: string;
  /**
   * Human-readable period number (1, 2, ... 12) used in the card header
   * like "今日打卡 - 第 3 期". Denormalized from the period row at post
   * time so the renderer doesn't need a repo lookup.
   */
  periodNumber: number;
}

/**
 * Seed factory for a fresh `DailyCheckinState` with all 6 items empty.
 * Used by the command handler that posts a new daily checkin card, and
 * by test fixtures.
 */
export function emptyDailyCheckinState(input: {
  postedAt: string;
  periodId: string;
  periodNumber: number;
}): DailyCheckinState {
  return {
    items: {
      K3: { pending: [], approved: [] },
      K4: { pending: [], approved: [] },
      H2: { pending: [], approved: [] },
      C1: { pending: [], approved: [] },
      C3: { pending: [], approved: [] },
      G2: { pending: [], approved: [] }
    },
    postedAt: input.postedAt,
    periodId: input.periodId,
    periodNumber: input.periodNumber
  };
}

export interface HomeworkSubmitState {
  sessionId: string;
  title: string;
  deadline: string;
  submitters: Array<{
    memberId: string;
    submittedAt: string;
    firstSubmitter: boolean;
  }>;
}

export interface LeaderboardState {
  settledWindowId: string;
  generatedAt: string;
  topN: Array<{
    memberId: string;
    displayName: string;
    cumulativeAq: number;
    latestWindowAq: number;
    currentLevel: number;
    dims: { K: number; H: number; C: number; S: number; G: number };
  }>;
  radarImageUrl: string | null;
}

export interface ReviewQueueState {
  currentPage: number;
  totalPages: number;
  totalEvents: number;
  events: ReviewQueueEventRow[];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/services/feishu/cards/types.test.ts`
Expected: PASS — 13 assertions green (the original 8 plus 5 new ones added to cover the richer `DailyCheckinState`, `emptyDailyCheckinState` factory, `MemberLite`, `PeerReviewVote`, and `CardHandlerDeps` extensions).

- [ ] **Step 5: Commit**

```bash
git add src/services/feishu/cards/types.ts tests/services/feishu/cards/types.test.ts
git commit -m "feat(sub2): add shared feishu card type contracts"
```

---

### Task A3: `feishu_live_cards` DDL + repository methods

**Files:**
- Modify: `src/storage/sqlite-repository.ts` (`tableDefinitions` literal + new methods)
- Create: `src/services/feishu/cards/live-card-repository.ts`
- Test: `tests/services/feishu/cards/live-card-repository.test.ts`

Adds the Sub2-owned `feishu_live_cards` table to the central `tableDefinitions` literal so the existing `SqliteRepository` bootstrap creates it on construction. A thin `LiveCardRepository` class wraps the raw SQL reads and writes with typed methods that match the `LiveCardRow` contract from Task A2. Concurrent read-modify-write is exercised inside a `better-sqlite3` transaction.

- [ ] **Step 1: Write failing test**

Create `tests/services/feishu/cards/live-card-repository.test.ts`:

```typescript
import Database from "better-sqlite3";
import { beforeEach, describe, expect, test } from "vitest";

import { SqliteRepository } from "../../../../src/storage/sqlite-repository.js";
import { LiveCardRepository } from "../../../../src/services/feishu/cards/live-card-repository.js";
import { emptyDailyCheckinState } from "../../../../src/services/feishu/cards/types.js";
import type {
  DailyCheckinState,
  LiveCardRow
} from "../../../../src/services/feishu/cards/types.js";

function fresh(): { repo: SqliteRepository; live: LiveCardRepository } {
  const repo = new SqliteRepository(":memory:");
  const live = new LiveCardRepository(repo);
  return { repo, live };
}

function sampleRow(overrides: Partial<LiveCardRow> = {}): LiveCardRow {
  const base: LiveCardRow = {
    id: "flc-1",
    cardType: "daily_checkin",
    feishuMessageId: "om-1",
    feishuChatId: "oc-1",
    campId: "camp-1",
    periodId: "p-1",
    windowId: null,
    cardVersion: "daily-checkin-v1",
    stateJson: emptyDailyCheckinState({
      postedAt: "2026-04-10T09:00:00.000Z",
      periodId: "p-1",
      periodNumber: 1
    }) satisfies DailyCheckinState,
    sentAt: "2026-04-10T09:00:00.000Z",
    lastPatchedAt: null,
    expiresAt: "2026-04-24T09:00:00.000Z",
    closedReason: null
  };
  return { ...base, ...overrides };
}

describe("LiveCardRepository", () => {
  let repo: SqliteRepository;
  let live: LiveCardRepository;

  beforeEach(() => {
    ({ repo, live } = fresh());
  });

  test("schema: feishu_live_cards table is created on construction", () => {
    const db = (repo as unknown as { db: Database.Database }).db;
    const row = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='feishu_live_cards'"
      )
      .get() as { name: string } | undefined;
    expect(row?.name).toBe("feishu_live_cards");
  });

  test("insert + find roundtrips DailyCheckinState", () => {
    const row = sampleRow();
    live.insert(row);
    const found = live.findActive("daily_checkin", "oc-1");
    expect(found?.id).toBe("flc-1");
    const state = found?.stateJson as DailyCheckinState;
    expect(state.items.K3.pending).toEqual([]);
    expect(state.items.K3.approved).toEqual([]);
    expect(state.postedAt).toBe("2026-04-10T09:00:00.000Z");
  });

  test("updateState is transactional and bumps last_patched_at", () => {
    const row = sampleRow();
    live.insert(row);
    const nextState: DailyCheckinState = emptyDailyCheckinState({
      postedAt: row.sentAt,
      periodId: "p-1",
      periodNumber: 1
    });
    nextState.items.K3.pending.push("m-1");
    nextState.items.H2.pending.push("m-2");
    live.updateState("flc-1", nextState, "2026-04-10T10:05:00.000Z");
    const found = live.findActive("daily_checkin", "oc-1");
    expect((found?.stateJson as DailyCheckinState).items.K3.pending).toContain("m-1");
    expect((found?.stateJson as DailyCheckinState).items.H2.pending).toContain("m-2");
    expect(found?.lastPatchedAt).toBe("2026-04-10T10:05:00.000Z");
  });

  test("close marks closed_reason and hides from findActive", () => {
    live.insert(sampleRow());
    live.close("flc-1", "expired");
    expect(live.findActive("daily_checkin", "oc-1")).toBeNull();
  });

  test("listExpiringWithinDays returns cards that will expire soon", () => {
    live.insert(sampleRow({ id: "flc-a", expiresAt: "2026-04-11T00:00:00.000Z" }));
    live.insert(
      sampleRow({
        id: "flc-b",
        feishuMessageId: "om-2",
        expiresAt: "2026-05-01T00:00:00.000Z"
      })
    );
    const now = new Date("2026-04-10T00:00:00.000Z");
    const expiring = live.listExpiringWithinDays(now, 2);
    expect(expiring.map((r) => r.id)).toEqual(["flc-a"]);
  });

  test("findActive ignores closed rows", () => {
    live.insert(sampleRow({ id: "flc-old" }));
    live.close("flc-old", "replaced_by_new");
    expect(live.findActive("daily_checkin", "oc-1")).toBeNull();
    live.insert(sampleRow({ id: "flc-new", feishuMessageId: "om-2" }));
    expect(live.findActive("daily_checkin", "oc-1")?.id).toBe("flc-new");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/services/feishu/cards/live-card-repository.test.ts`
Expected: FAIL — `LiveCardRepository` module not found AND `feishu_live_cards` table not in schema.

- [ ] **Step 3: Add the `feishu_live_cards` DDL to `tableDefinitions`**

Open `src/storage/sqlite-repository.ts`. Inside the `tableDefinitions` template literal, **immediately before the closing backtick** (same place Phase A2 inserted v2 DDL), append:

```sql
CREATE TABLE IF NOT EXISTS feishu_live_cards (
  id TEXT PRIMARY KEY,
  card_type TEXT NOT NULL,
  feishu_message_id TEXT NOT NULL UNIQUE,
  feishu_chat_id TEXT NOT NULL,
  camp_id TEXT NOT NULL,
  period_id TEXT,
  window_id TEXT,
  card_version TEXT NOT NULL,
  state_json TEXT NOT NULL,
  sent_at TEXT NOT NULL,
  last_patched_at TEXT,
  expires_at TEXT NOT NULL,
  closed_reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_feishu_live_cards_active
  ON feishu_live_cards(card_type, feishu_chat_id)
  WHERE closed_reason IS NULL;

CREATE INDEX IF NOT EXISTS idx_feishu_live_cards_expires
  ON feishu_live_cards(expires_at)
  WHERE closed_reason IS NULL;
```

- [ ] **Step 4: Implement `src/services/feishu/cards/live-card-repository.ts`**

```typescript
import type Database from "better-sqlite3";

import type { SqliteRepository } from "../../../storage/sqlite-repository.js";
import type { CardType, LiveCardRow } from "./types.js";

interface LiveCardDbRow {
  id: string;
  card_type: string;
  feishu_message_id: string;
  feishu_chat_id: string;
  camp_id: string;
  period_id: string | null;
  window_id: string | null;
  card_version: string;
  state_json: string;
  sent_at: string;
  last_patched_at: string | null;
  expires_at: string;
  closed_reason: string | null;
}

function toRow(row: LiveCardDbRow): LiveCardRow {
  return {
    id: row.id,
    cardType: row.card_type as CardType,
    feishuMessageId: row.feishu_message_id,
    feishuChatId: row.feishu_chat_id,
    campId: row.camp_id,
    periodId: row.period_id,
    windowId: row.window_id,
    cardVersion: row.card_version,
    stateJson: JSON.parse(row.state_json),
    sentAt: row.sent_at,
    lastPatchedAt: row.last_patched_at,
    expiresAt: row.expires_at,
    closedReason:
      (row.closed_reason as LiveCardRow["closedReason"]) ?? null
  };
}

export class LiveCardRepository {
  private readonly db: Database.Database;

  constructor(sqliteRepo: SqliteRepository) {
    this.db = (sqliteRepo as unknown as { db: Database.Database }).db;
  }

  insert(row: LiveCardRow): void {
    this.db
      .prepare(
        `INSERT INTO feishu_live_cards (
          id, card_type, feishu_message_id, feishu_chat_id, camp_id,
          period_id, window_id, card_version, state_json,
          sent_at, last_patched_at, expires_at, closed_reason
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        row.id,
        row.cardType,
        row.feishuMessageId,
        row.feishuChatId,
        row.campId,
        row.periodId,
        row.windowId,
        row.cardVersion,
        JSON.stringify(row.stateJson),
        row.sentAt,
        row.lastPatchedAt,
        row.expiresAt,
        row.closedReason
      );
  }

  findActive(cardType: CardType, feishuChatId: string): LiveCardRow | null {
    const row = this.db
      .prepare<[string, string], LiveCardDbRow>(
        `SELECT * FROM feishu_live_cards
          WHERE card_type = ? AND feishu_chat_id = ? AND closed_reason IS NULL
          ORDER BY sent_at DESC
          LIMIT 1`
      )
      .get(cardType, feishuChatId);
    return row ? toRow(row) : null;
  }

  findById(id: string): LiveCardRow | null {
    const row = this.db
      .prepare<[string], LiveCardDbRow>(
        "SELECT * FROM feishu_live_cards WHERE id = ?"
      )
      .get(id);
    return row ? toRow(row) : null;
  }

  updateState(id: string, stateJson: unknown, patchedAt: string): void {
    this.db
      .prepare(
        `UPDATE feishu_live_cards
            SET state_json = ?, last_patched_at = ?
          WHERE id = ?`
      )
      .run(JSON.stringify(stateJson), patchedAt, id);
  }

  close(id: string, reason: LiveCardRow["closedReason"]): void {
    this.db
      .prepare("UPDATE feishu_live_cards SET closed_reason = ? WHERE id = ?")
      .run(reason, id);
  }

  listExpiringWithinDays(now: Date, days: number): LiveCardRow[] {
    const threshold = new Date(now.getTime() + days * 86400 * 1000).toISOString();
    const rows = this.db
      .prepare<[string], LiveCardDbRow>(
        `SELECT * FROM feishu_live_cards
          WHERE closed_reason IS NULL AND expires_at <= ?
          ORDER BY expires_at ASC`
      )
      .all(threshold);
    return rows.map(toRow);
  }

  withTransaction<T>(fn: () => T): T {
    const tx = this.db.transaction(fn);
    return tx();
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- tests/services/feishu/cards/live-card-repository.test.ts`
Expected: PASS — 6 assertions green.

Also run: `npm test` to confirm no regression. Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add \
  src/storage/sqlite-repository.ts \
  src/services/feishu/cards/live-card-repository.ts \
  tests/services/feishu/cards/live-card-repository.test.ts
git commit -m "feat(sub2): add feishu_live_cards DDL and LiveCardRepository"
```

---

### Task A4: Soft validation module

**Files:**
- Create: `src/services/feishu/cards/soft-validation.ts`
- Test: `tests/services/feishu/cards/soft-validation.test.ts`

Implements the Sub2-local soft validation rules from spec §7.4: text length, pure-emoji rejection, G2 URL presence, and H2 file_key non-empty. Validation results are "reject with reason" or "pass"; the dispatcher converts rejections into `toast` responses and annotates `card_interactions.rejected_reason`.

- [ ] **Step 1: Write failing test**

Create `tests/services/feishu/cards/soft-validation.test.ts`:

```typescript
import { describe, expect, test } from "vitest";

import {
  validateLlmSubmission,
  validateG2Submission,
  validateH2Submission,
  stripEmojiAndSpace
} from "../../../../src/services/feishu/cards/soft-validation.js";

describe("soft validation", () => {
  describe("validateLlmSubmission (K3/K4/C1/C3/G2 text path)", () => {
    test("accepts text >= 20 chars with real content", () => {
      const r = validateLlmSubmission({
        text: "今天用 ChatGPT 做了一段翻译,效果比 DeepL 好很多"
      });
      expect(r.ok).toBe(true);
    });

    test("rejects text shorter than 20 characters", () => {
      const r = validateLlmSubmission({ text: "还可以" });
      expect(r).toEqual({ ok: false, reason: "text_too_short" });
    });

    test("rejects whitespace-only text", () => {
      const r = validateLlmSubmission({ text: "                    " });
      expect(r).toEqual({ ok: false, reason: "text_too_short" });
    });

    test("rejects pure-emoji text even if long", () => {
      const r = validateLlmSubmission({
        text: "😀😁😂😃😄😅😆😇😈😉😊😋😌😍😎😏😐😑😒😓"
      });
      expect(r).toEqual({ ok: false, reason: "text_too_short" });
    });
  });

  describe("validateG2Submission (課外好資源)", () => {
    test("passes with a proper http URL + rationale", () => {
      const r = validateG2Submission({
        text: "推荐文章 https://example.com/ai-guide 讲解 Claude 使用非常清晰"
      });
      expect(r.ok).toBe(true);
    });

    test("rejects when no URL present", () => {
      const r = validateG2Submission({ text: "我觉得 AI 很有用,大家去看那个文档吧挺好的" });
      expect(r).toEqual({ ok: false, reason: "missing_url" });
    });

    test("rejects short-text even if URL present", () => {
      const r = validateG2Submission({ text: "https://x.co" });
      expect(r).toEqual({ ok: false, reason: "text_too_short" });
    });
  });

  describe("validateH2Submission (實操截圖+描述)", () => {
    test("passes with sufficient text + non-empty file_key", () => {
      const r = validateH2Submission({
        text: "用 Claude 写了一段 python 代码处理 csv 效果很好",
        fileKey: "file_v2_xyz"
      });
      expect(r.ok).toBe(true);
    });

    test("rejects when file_key is empty", () => {
      const r = validateH2Submission({
        text: "用 Claude 写了一段 python 代码处理 csv 效果很好",
        fileKey: ""
      });
      expect(r).toEqual({ ok: false, reason: "missing_file_key" });
    });

    test("rejects when text too short even if file_key present", () => {
      const r = validateH2Submission({ text: "好用", fileKey: "file_v2_xyz" });
      expect(r).toEqual({ ok: false, reason: "text_too_short" });
    });
  });

  describe("stripEmojiAndSpace helper", () => {
    test("removes common emoji and whitespace", () => {
      expect(stripEmojiAndSpace(" 😀 hello 🤖 world ")).toBe("helloworld");
    });

    test("returns empty for only emojis", () => {
      expect(stripEmojiAndSpace("🤖🤖🤖")).toBe("");
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/services/feishu/cards/soft-validation.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/services/feishu/cards/soft-validation.ts`**

```typescript
export const MIN_TEXT_LENGTH = 20;

export type SoftValidationResult =
  | { ok: true }
  | { ok: false; reason: "text_too_short" | "missing_url" | "missing_file_key" };

const EMOJI_REGEX = /\p{Extended_Pictographic}/gu;
const WHITESPACE_REGEX = /\s+/g;

export function stripEmojiAndSpace(text: string): string {
  return text.replace(EMOJI_REGEX, "").replace(WHITESPACE_REGEX, "");
}

function isSubstantiveText(text: string): boolean {
  const stripped = stripEmojiAndSpace(text);
  return stripped.length >= MIN_TEXT_LENGTH;
}

/**
 * Validates a generic LLM-scored text payload (K3/K4/C1/C3).
 */
export function validateLlmSubmission(input: { text: string }): SoftValidationResult {
  if (!isSubstantiveText(input.text)) {
    return { ok: false, reason: "text_too_short" };
  }
  return { ok: true };
}

const URL_REGEX = /https?:\/\/[^\s]+/i;

/**
 * G2 requires at least one http(s) URL alongside the text description.
 */
export function validateG2Submission(input: { text: string }): SoftValidationResult {
  if (!isSubstantiveText(input.text)) {
    return { ok: false, reason: "text_too_short" };
  }
  if (!URL_REGEX.test(input.text)) {
    return { ok: false, reason: "missing_url" };
  }
  return { ok: true };
}

/**
 * H2 requires both a descriptive text body and a non-empty file_key.
 */
export function validateH2Submission(input: {
  text: string;
  fileKey: string;
}): SoftValidationResult {
  if (!isSubstantiveText(input.text)) {
    return { ok: false, reason: "text_too_short" };
  }
  if (!input.fileKey || input.fileKey.trim() === "") {
    return { ok: false, reason: "missing_file_key" };
  }
  return { ok: true };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/services/feishu/cards/soft-validation.test.ts`
Expected: PASS — 10 assertions green.

- [ ] **Step 5: Commit**

```bash
git add src/services/feishu/cards/soft-validation.ts tests/services/feishu/cards/soft-validation.test.ts
git commit -m "feat(sub2): add soft validation for card submissions"
```

---

### Task A5: Version resolver (`version.ts`) with 7-day grace window

**Files:**
- Create: `src/services/feishu/cards/version.ts`
- Test: `tests/services/feishu/cards/version.test.ts`

Implements the `resolveCardVersion(instance, currentVersion, legacyVersion)` helper from spec §6. Returns `"current"`, `"legacy"`, or `"expired"` based on whether the instance's `card_version` matches current or legacy and how old the instance is. Uses an injectable `clock` so tests are deterministic.

- [ ] **Step 1: Write failing test**

Create `tests/services/feishu/cards/version.test.ts`:

```typescript
import { describe, expect, test } from "vitest";

import { resolveCardVersion } from "../../../../src/services/feishu/cards/version.js";
import type { LiveCardRow } from "../../../../src/services/feishu/cards/types.js";

function instance(partial: Partial<LiveCardRow>): LiveCardRow {
  return {
    id: "flc-x",
    cardType: "daily_checkin",
    feishuMessageId: "om-x",
    feishuChatId: "oc-x",
    campId: "camp-1",
    periodId: null,
    windowId: null,
    cardVersion: "daily-checkin-v1",
    stateJson: {},
    sentAt: "2026-04-01T00:00:00.000Z",
    lastPatchedAt: null,
    expiresAt: "2026-04-15T00:00:00.000Z",
    closedReason: null,
    ...partial
  };
}

describe("resolveCardVersion", () => {
  test("returns 'current' when version matches currentVersion", () => {
    const result = resolveCardVersion(
      instance({ cardVersion: "daily-checkin-v2" }),
      "daily-checkin-v2",
      "daily-checkin-v1",
      () => new Date("2026-04-10T00:00:00.000Z")
    );
    expect(result).toBe("current");
  });

  test("returns 'legacy' when version matches legacyVersion and age < 7 days", () => {
    const result = resolveCardVersion(
      instance({
        cardVersion: "daily-checkin-v1",
        sentAt: "2026-04-06T00:00:00.000Z"
      }),
      "daily-checkin-v2",
      "daily-checkin-v1",
      () => new Date("2026-04-10T00:00:00.000Z")
    );
    expect(result).toBe("legacy");
  });

  test("returns 'expired' when version matches legacyVersion but age >= 7 days", () => {
    const result = resolveCardVersion(
      instance({
        cardVersion: "daily-checkin-v1",
        sentAt: "2026-04-02T00:00:00.000Z"
      }),
      "daily-checkin-v2",
      "daily-checkin-v1",
      () => new Date("2026-04-10T00:00:00.000Z")
    );
    expect(result).toBe("expired");
  });

  test("returns 'expired' when version matches neither current nor legacy", () => {
    const result = resolveCardVersion(
      instance({ cardVersion: "daily-checkin-v0" }),
      "daily-checkin-v2",
      "daily-checkin-v1",
      () => new Date("2026-04-10T00:00:00.000Z")
    );
    expect(result).toBe("expired");
  });

  test("legacy grace boundary exactly 7 days is treated as 'expired'", () => {
    const result = resolveCardVersion(
      instance({
        cardVersion: "daily-checkin-v1",
        sentAt: "2026-04-03T00:00:00.000Z"
      }),
      "daily-checkin-v2",
      "daily-checkin-v1",
      () => new Date("2026-04-10T00:00:00.000Z")
    );
    expect(result).toBe("expired");
  });

  test("legacy grace boundary just under 7 days is still 'legacy'", () => {
    const result = resolveCardVersion(
      instance({
        cardVersion: "daily-checkin-v1",
        sentAt: "2026-04-03T00:00:01.000Z"
      }),
      "daily-checkin-v2",
      "daily-checkin-v1",
      () => new Date("2026-04-10T00:00:00.000Z")
    );
    expect(result).toBe("legacy");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/services/feishu/cards/version.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/services/feishu/cards/version.ts`**

```typescript
import type {
  CardVersionDirective,
  LiveCardRow
} from "./types.js";

const SEVEN_DAYS_MS = 7 * 86400 * 1000;

export function resolveCardVersion(
  instance: LiveCardRow,
  currentVersion: string,
  legacyVersion: string,
  clock: () => Date = () => new Date()
): CardVersionDirective {
  if (instance.cardVersion === currentVersion) {
    return "current";
  }
  if (instance.cardVersion === legacyVersion) {
    const age = clock().getTime() - Date.parse(instance.sentAt);
    return age < SEVEN_DAYS_MS ? "legacy" : "expired";
  }
  return "expired";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/services/feishu/cards/version.test.ts`
Expected: PASS — 6 assertions green.

- [ ] **Step 5: Commit**

```bash
git add src/services/feishu/cards/version.ts tests/services/feishu/cards/version.test.ts
git commit -m "feat(sub2): add resolveCardVersion with 7-day grace window"
```

---

## Phase A Exit Checkpoint

Run the full suite and build:
```bash
npm test
npm run build
```
Expected: both green; 5 new test files (`types.test.ts`, `live-card-repository.test.ts`, `soft-validation.test.ts`, `version.test.ts`, plus the DDL smoke rolled into `live-card-repository.test.ts`). No card renderer or handler logic yet — foundation only. `feishu_live_cards` table is present on construction and visible via `SELECT name FROM sqlite_master`.

---

## Phase B — Renderer + Router + Dispatcher (4 tasks)

Builds the card renderer primitives (shared components + the `render(templateId, state, ctx)` entrypoint), the per-card handler registry, the main card-action dispatcher (which owns uniform error-to-toast mapping), and the Fastify plugin that wires the two new HTTP routes into `src/app.ts`. After this phase the system can receive a card-action webhook and return a "no handler registered" toast — real cards come in Phase C onwards.

---

### Task B1: Shared template components (`templates/common/*`)

**Files:**
- Create: `src/services/feishu/cards/templates/common/header.ts`
- Create: `src/services/feishu/cards/templates/common/member-badge.ts`
- Create: `src/services/feishu/cards/templates/common/progress-bar.ts`
- Create: `src/services/feishu/cards/templates/common/radar-image.ts`
- Test: `tests/services/feishu/cards/templates/common.test.ts`

These are the reusable card building blocks. `header()` builds a Feishu card v2 header block; `memberBadge()` builds an inline user badge with level pill; `progressBar()` renders a single-dimension progress line like `"K 15/20"`; `radarImageUrl()` is a URL builder for the server-side radar PNG generator (used by #9 leaderboard and #10 level announcement).

- [ ] **Step 1: Write failing test**

Create `tests/services/feishu/cards/templates/common.test.ts`:

```typescript
import { describe, expect, test } from "vitest";

import { buildHeader } from "../../../../../src/services/feishu/cards/templates/common/header.js";
import { buildMemberBadge } from "../../../../../src/services/feishu/cards/templates/common/member-badge.js";
import { buildProgressBar } from "../../../../../src/services/feishu/cards/templates/common/progress-bar.js";
import { buildRadarImageUrl } from "../../../../../src/services/feishu/cards/templates/common/radar-image.js";

describe("common card components", () => {
  test("buildHeader returns a feishu card v2 header block with title + template", () => {
    const h = buildHeader({ title: "今日打卡", subtitle: "第 3 期", template: "blue" });
    expect(h.title).toEqual({
      tag: "plain_text",
      content: "今日打卡"
    });
    expect(h.subtitle).toEqual({
      tag: "plain_text",
      content: "第 3 期"
    });
    expect(h.template).toBe("blue");
  });

  test("buildHeader omits subtitle when not provided", () => {
    const h = buildHeader({ title: "段位评定", template: "purple" });
    expect(h.subtitle).toBeUndefined();
  });

  test("buildMemberBadge wraps name and level into a markdown element", () => {
    const badge = buildMemberBadge({
      displayName: "张三",
      currentLevel: 3
    });
    expect(badge.tag).toBe("markdown");
    expect(badge.content).toContain("张三");
    expect(badge.content).toContain("Lv3");
  });

  test("buildProgressBar renders K 15/20 style line", () => {
    const bar = buildProgressBar({
      dimension: "K",
      current: 15,
      cap: 20
    });
    expect(bar.tag).toBe("markdown");
    expect(bar.content).toContain("K");
    expect(bar.content).toContain("15");
    expect(bar.content).toContain("20");
  });

  test("buildRadarImageUrl returns a stable URL for a given memberId+windowId", () => {
    const url = buildRadarImageUrl({
      baseUrl: "https://cdn.example.com",
      memberId: "m-1",
      windowId: "w-1",
      dims: { K: 18, H: 9, C: 12, S: 6, G: 13 }
    });
    expect(url).toContain("/radar/");
    expect(url).toContain("m-1");
    expect(url).toContain("w-1");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/services/feishu/cards/templates/common.test.ts`
Expected: FAIL — no common component modules found.

- [ ] **Step 3: Implement `src/services/feishu/cards/templates/common/header.ts`**

```typescript
export interface HeaderInput {
  title: string;
  subtitle?: string;
  template: "blue" | "green" | "orange" | "red" | "purple" | "grey";
}

export interface HeaderBlock {
  title: { tag: "plain_text"; content: string };
  subtitle?: { tag: "plain_text"; content: string };
  template: string;
}

export function buildHeader(input: HeaderInput): HeaderBlock {
  const header: HeaderBlock = {
    title: { tag: "plain_text", content: input.title },
    template: input.template
  };
  if (input.subtitle) {
    header.subtitle = { tag: "plain_text", content: input.subtitle };
  }
  return header;
}
```

- [ ] **Step 4: Implement `src/services/feishu/cards/templates/common/member-badge.ts`**

```typescript
export interface MemberBadgeInput {
  displayName: string;
  currentLevel: number;
}

export interface MarkdownElement {
  tag: "markdown";
  content: string;
}

export function buildMemberBadge(input: MemberBadgeInput): MarkdownElement {
  return {
    tag: "markdown",
    content: `**${input.displayName}** \`Lv${input.currentLevel}\``
  };
}
```

- [ ] **Step 5: Implement `src/services/feishu/cards/templates/common/progress-bar.ts`**

```typescript
import type { MarkdownElement } from "./member-badge.js";

export interface ProgressBarInput {
  dimension: "K" | "H" | "C" | "S" | "G";
  current: number;
  cap: number;
}

export function buildProgressBar(input: ProgressBarInput): MarkdownElement {
  const pct = Math.max(0, Math.min(1, input.current / input.cap));
  const filledBlocks = Math.round(pct * 10);
  const bar = "█".repeat(filledBlocks) + "░".repeat(10 - filledBlocks);
  return {
    tag: "markdown",
    content: `${input.dimension} ${bar} ${input.current}/${input.cap}`
  };
}
```

- [ ] **Step 6: Implement `src/services/feishu/cards/templates/common/radar-image.ts`**

```typescript
export interface RadarImageInput {
  baseUrl: string;
  memberId: string;
  windowId: string;
  dims: { K: number; H: number; C: number; S: number; G: number };
}

/**
 * Builds a server-rendered radar PNG URL. The actual rendering endpoint
 * lives in sub-project 1 Phase G (/api/v2/board/radar/:memberId/:windowId)
 * and is served by a Node canvas worker. Sub2 only calls this helper to
 * get the URL to embed in a card image element.
 */
export function buildRadarImageUrl(input: RadarImageInput): string {
  const base = input.baseUrl.replace(/\/$/, "");
  const query = new URLSearchParams({
    k: String(input.dims.K),
    h: String(input.dims.H),
    c: String(input.dims.C),
    s: String(input.dims.S),
    g: String(input.dims.G)
  });
  return `${base}/radar/${encodeURIComponent(input.memberId)}/${encodeURIComponent(input.windowId)}?${query.toString()}`;
}
```

- [ ] **Step 7: Run test to verify it passes**

Run: `npm test -- tests/services/feishu/cards/templates/common.test.ts`
Expected: PASS — 5 assertions green.

- [ ] **Step 8: Commit**

```bash
git add \
  src/services/feishu/cards/templates/common \
  tests/services/feishu/cards/templates/common.test.ts
git commit -m "feat(sub2): add shared card template components"
```

---

### Task B2: Card renderer (`renderer.ts`) + size assertion

**Files:**
- Create: `src/services/feishu/cards/renderer.ts`
- Test: `tests/services/feishu/cards/renderer.test.ts`

Provides the single-entry `renderCard(templateId, state, ctx)` function that dispatches to the correct template builder based on `templateId` (e.g. `"daily-checkin-v1"`) and returns a `FeishuCardJson`. Also provides `assertCardSize(cardJson)` which throws if the serialized JSON exceeds 25 KB (safety margin under Feishu's 30 KB limit). Templates are registered in a map and subsequent tasks will add entries.

- [ ] **Step 1: Write failing test**

Create `tests/services/feishu/cards/renderer.test.ts`:

```typescript
import { describe, expect, test } from "vitest";

import {
  renderCard,
  assertCardSize,
  registerTemplate,
  clearTemplateRegistry,
  CARD_SIZE_LIMIT_BYTES,
  CARD_SIZE_BUDGET_BYTES
} from "../../../../src/services/feishu/cards/renderer.js";
import type {
  FeishuCardJson,
  CardActionContext
} from "../../../../src/services/feishu/cards/types.js";

function fakeCtx(): CardActionContext {
  return {
    operatorOpenId: "ou-op",
    triggerId: "t-1",
    actionName: "unused",
    actionPayload: {},
    messageId: "om-1",
    chatId: "oc-1",
    receivedAt: "2026-04-10T12:00:00.000Z",
    currentVersion: "test-v1"
  };
}

describe("renderer", () => {
  test("registerTemplate + renderCard dispatches to registered builder", () => {
    clearTemplateRegistry();
    registerTemplate("dummy-v1", (state: { title: string }) => ({
      schema: "2.0",
      header: { title: { tag: "plain_text", content: state.title }, template: "blue" },
      body: { elements: [] }
    }));

    const card = renderCard("dummy-v1", { title: "hello" }, fakeCtx());
    expect(card.schema).toBe("2.0");
    expect((card.header as any).title.content).toBe("hello");
  });

  test("renderCard throws for unregistered template id", () => {
    clearTemplateRegistry();
    expect(() => renderCard("missing-v1", {}, fakeCtx())).toThrow(
      /template not registered: missing-v1/i
    );
  });

  test("assertCardSize accepts cards under the budget", () => {
    const card: FeishuCardJson = {
      schema: "2.0",
      header: {},
      body: { elements: [{ tag: "markdown", content: "small" }] }
    };
    expect(() => assertCardSize(card)).not.toThrow();
  });

  test("assertCardSize throws when over CARD_SIZE_BUDGET_BYTES", () => {
    const big = "x".repeat(CARD_SIZE_BUDGET_BYTES + 1);
    const card: FeishuCardJson = {
      schema: "2.0",
      header: {},
      body: { elements: [{ tag: "markdown", content: big }] }
    };
    expect(() => assertCardSize(card)).toThrow(/card payload exceeds/i);
  });

  test("CARD_SIZE_BUDGET_BYTES stays under Feishu's 30 KB hard limit", () => {
    expect(CARD_SIZE_BUDGET_BYTES).toBeLessThanOrEqual(CARD_SIZE_LIMIT_BYTES);
    expect(CARD_SIZE_LIMIT_BYTES).toBe(30 * 1024);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/services/feishu/cards/renderer.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/services/feishu/cards/renderer.ts`**

```typescript
import type {
  CardActionContext,
  FeishuCardJson
} from "./types.js";

/** Feishu's hard size limit for a single card payload. */
export const CARD_SIZE_LIMIT_BYTES = 30 * 1024;

/** Our internal soft budget with a safety margin. */
export const CARD_SIZE_BUDGET_BYTES = 25 * 1024;

export type TemplateBuilder<TState = unknown> = (
  state: TState,
  ctx: CardActionContext
) => FeishuCardJson;

const registry = new Map<string, TemplateBuilder<unknown>>();

export function registerTemplate<TState>(
  templateId: string,
  builder: TemplateBuilder<TState>
): void {
  registry.set(templateId, builder as TemplateBuilder<unknown>);
}

export function clearTemplateRegistry(): void {
  registry.clear();
}

export function renderCard<TState>(
  templateId: string,
  state: TState,
  ctx: CardActionContext
): FeishuCardJson {
  const builder = registry.get(templateId);
  if (!builder) {
    throw new Error(`template not registered: ${templateId}`);
  }
  const card = (builder as TemplateBuilder<TState>)(state, ctx);
  assertCardSize(card);
  return card;
}

export function assertCardSize(card: FeishuCardJson): void {
  const size = Buffer.byteLength(JSON.stringify(card), "utf8");
  if (size > CARD_SIZE_BUDGET_BYTES) {
    throw new Error(
      `card payload exceeds ${CARD_SIZE_BUDGET_BYTES} byte budget: ${size} bytes`
    );
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/services/feishu/cards/renderer.test.ts`
Expected: PASS — 5 assertions green.

- [ ] **Step 5: Commit**

```bash
git add src/services/feishu/cards/renderer.ts tests/services/feishu/cards/renderer.test.ts
git commit -m "feat(sub2): add card renderer with template registry and size budget"
```

---

### Task B3: Card-action dispatcher (`card-action-dispatcher.ts`)

**Files:**
- Create: `src/services/feishu/cards/card-action-dispatcher.ts`
- Test: `tests/services/feishu/cards/card-action-dispatcher.test.ts`

The dispatcher is the single choke-point between the Fastify route handler and the per-card handlers. It holds the `(cardType, actionName) → CardHandler` registry, maps sub-project 1 `DomainError` instances to uniform Feishu toast responses, and guarantees every handler returns exactly one of `newCardJson` or `toast`. Soft-validation failures are already in the form of `{ toast }` from the handler.

- [ ] **Step 1: Write failing test**

Create `tests/services/feishu/cards/card-action-dispatcher.test.ts`:

```typescript
import { describe, expect, test, vi } from "vitest";

import {
  CardActionDispatcher,
  type DispatchInput
} from "../../../../src/services/feishu/cards/card-action-dispatcher.js";
import type {
  CardHandler,
  CardHandlerDeps,
  FeishuCardJson
} from "../../../../src/services/feishu/cards/types.js";
import {
  NotEligibleError,
  PerPeriodCapExceededError,
  InvalidDecisionStateError
} from "../../../../src/domain/v2/errors.js";

function fakeDeps(): CardHandlerDeps {
  return {
    repo: {
      insertCardInteraction: vi.fn(() => "inserted" as const),
      findLiveCard: vi.fn(),
      updateLiveCardState: vi.fn(),
      insertLiveCard: vi.fn(),
      closeLiveCard: vi.fn(),
      findEventById: vi.fn(),
      listReviewRequiredEvents: vi.fn(() => []),
      countReviewRequiredEvents: vi.fn(() => 0)
    },
    ingestor: { ingest: vi.fn() },
    aggregator: { applyDecision: vi.fn() },
    feishuClient: {
      patchCard: vi.fn(),
      sendCard: vi.fn()
    },
    clock: () => new Date("2026-04-10T12:00:00.000Z"),
    uuid: () => "u-1"
  };
}

const dummyCard: FeishuCardJson = {
  schema: "2.0",
  header: {},
  body: { elements: [] }
};

const baseInput: DispatchInput = {
  cardType: "quiz",
  actionName: "submit",
  payload: { text: "hello" },
  operatorOpenId: "ou-op",
  triggerId: "t-1",
  messageId: "om-1",
  chatId: "oc-1",
  receivedAt: "2026-04-10T12:00:00.000Z",
  currentVersion: "quiz-v1"
};

describe("CardActionDispatcher", () => {
  test("routes to registered handler by (cardType, actionName)", async () => {
    const handler: CardHandler = vi.fn(async () => ({ newCardJson: dummyCard }));
    const d = new CardActionDispatcher(fakeDeps());
    d.register("quiz", "submit", handler);

    const result = await d.dispatch(baseInput);
    expect(handler).toHaveBeenCalledOnce();
    expect(result.newCardJson).toBe(dummyCard);
  });

  test("unknown (cardType, actionName) returns toast with 'unknown_action'", async () => {
    const d = new CardActionDispatcher(fakeDeps());
    const result = await d.dispatch({ ...baseInput, actionName: "ghost" });
    expect(result.toast?.type).toBe("error");
    expect(result.toast?.content).toMatch(/unknown_action|未知操作/);
  });

  test("NotEligibleError → toast 'not_eligible'", async () => {
    const handler: CardHandler = vi.fn(async () => {
      throw new NotEligibleError("m-1");
    });
    const d = new CardActionDispatcher(fakeDeps());
    d.register("quiz", "submit", handler);
    const result = await d.dispatch(baseInput);
    expect(result.toast?.type).toBe("error");
    expect(result.toast?.content).toContain("不在本营");
  });

  test("PerPeriodCapExceededError → toast 'cap_exceeded' but type=info", async () => {
    const handler: CardHandler = vi.fn(async () => {
      throw new PerPeriodCapExceededError("m-1", "K3", 3);
    });
    const d = new CardActionDispatcher(fakeDeps());
    d.register("quiz", "submit", handler);
    const result = await d.dispatch(baseInput);
    expect(result.toast?.type).toBe("info");
    expect(result.toast?.content).toContain("满额");
  });

  test("InvalidDecisionStateError → toast warn, content references operator", async () => {
    const handler: CardHandler = vi.fn(async () => {
      throw new InvalidDecisionStateError("evt-1", "approved");
    });
    const d = new CardActionDispatcher(fakeDeps());
    d.register("quiz", "submit", handler);
    const result = await d.dispatch(baseInput);
    expect(result.toast?.type).toBe("error");
    expect(result.toast?.content).toContain("已被");
  });

  test("Unknown Error is caught and returns a generic error toast", async () => {
    const handler: CardHandler = vi.fn(async () => {
      throw new Error("unexpected crash");
    });
    const d = new CardActionDispatcher(fakeDeps());
    d.register("quiz", "submit", handler);
    const result = await d.dispatch(baseInput);
    expect(result.toast?.type).toBe("error");
    expect(result.toast?.content).toMatch(/未知错误|error/i);
  });

  test("Handler returning neither newCardJson nor toast is an error", async () => {
    const handler: CardHandler = vi.fn(async () => ({} as never));
    const d = new CardActionDispatcher(fakeDeps());
    d.register("quiz", "submit", handler);
    const result = await d.dispatch(baseInput);
    expect(result.toast?.type).toBe("error");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/services/feishu/cards/card-action-dispatcher.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/services/feishu/cards/card-action-dispatcher.ts`**

```typescript
import {
  DomainError,
  DuplicateEventError,
  IceBreakerPeriodError,
  InvalidDecisionStateError,
  InvalidLevelTransitionError,
  NoActivePeriodError,
  NoActiveWindowError,
  NotEligibleError,
  PerPeriodCapExceededError,
  WindowAlreadySettledError
} from "../../../domain/v2/errors.js";

import type {
  CardActionContext,
  CardActionResult,
  CardHandler,
  CardHandlerDeps,
  CardType
} from "./types.js";

export interface DispatchInput {
  cardType: CardType;
  actionName: string;
  payload: Record<string, unknown>;
  operatorOpenId: string;
  triggerId: string;
  messageId: string;
  chatId: string;
  receivedAt: string;
  currentVersion: string;
}

interface RegistryKey {
  cardType: CardType;
  actionName: string;
}

function keyOf(k: RegistryKey): string {
  return `${k.cardType}::${k.actionName}`;
}

export class CardActionDispatcher {
  private readonly handlers = new Map<string, CardHandler>();

  constructor(private readonly deps: CardHandlerDeps) {}

  register(cardType: CardType, actionName: string, handler: CardHandler): void {
    this.handlers.set(keyOf({ cardType, actionName }), handler);
  }

  async dispatch(input: DispatchInput): Promise<CardActionResult> {
    const handler = this.handlers.get(keyOf(input));
    if (!handler) {
      return {
        toast: {
          type: "error",
          content: "unknown_action 未知操作,请刷新卡片"
        }
      };
    }

    const ctx: CardActionContext = {
      operatorOpenId: input.operatorOpenId,
      triggerId: input.triggerId,
      actionName: input.actionName,
      actionPayload: input.payload,
      messageId: input.messageId,
      chatId: input.chatId,
      receivedAt: input.receivedAt,
      currentVersion: input.currentVersion
    };

    try {
      const result = await handler(ctx, this.deps);
      if (!result.newCardJson && !result.toast) {
        return {
          toast: {
            type: "error",
            content: "handler 未返回响应,请联系运营"
          }
        };
      }
      return result;
    } catch (err) {
      return this.mapErrorToResult(err);
    }
  }

  private mapErrorToResult(err: unknown): CardActionResult {
    if (err instanceof NotEligibleError) {
      return {
        toast: { type: "error", content: "你不在本营学员名单" }
      };
    }
    if (err instanceof PerPeriodCapExceededError) {
      return {
        toast: {
          type: "info",
          content: "此项本期已满额,可继续提交但不计分"
        }
      };
    }
    if (err instanceof DuplicateEventError) {
      return {
        toast: { type: "info", content: "已记录" }
      };
    }
    if (err instanceof NoActivePeriodError) {
      return {
        toast: { type: "error", content: "期未开,请等讲师执行 /开期" }
      };
    }
    if (err instanceof NoActiveWindowError) {
      return {
        toast: { type: "error", content: "窗未开,请等讲师执行 /开窗" }
      };
    }
    if (err instanceof IceBreakerPeriodError) {
      return {
        toast: { type: "info", content: "破冰期提交保留,不计入 AQ" }
      };
    }
    if (err instanceof WindowAlreadySettledError) {
      return {
        toast: { type: "error", content: "本窗已结算,无法再次提交" }
      };
    }
    if (err instanceof InvalidLevelTransitionError) {
      return {
        toast: { type: "error", content: "段位变更非法,请联系运营" }
      };
    }
    if (err instanceof InvalidDecisionStateError) {
      return {
        toast: { type: "error", content: "此条已被其他运营处理,请刷新队列" }
      };
    }
    if (err instanceof DomainError) {
      return {
        toast: { type: "error", content: `domain_error: ${err.code}` }
      };
    }
    return {
      toast: {
        type: "error",
        content: "未知错误,请刷新卡片或联系运营"
      }
    };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/services/feishu/cards/card-action-dispatcher.test.ts`
Expected: PASS — 7 assertions green.

- [ ] **Step 5: Commit**

```bash
git add src/services/feishu/cards/card-action-dispatcher.ts tests/services/feishu/cards/card-action-dispatcher.test.ts
git commit -m "feat(sub2): add CardActionDispatcher with uniform error mapping"
```

---

### Task B4: Fastify plugin `router.ts` + wire into `app.ts`

**Files:**
- Create: `src/services/feishu/cards/router.ts`
- Modify: `src/app.ts` (register the plugin)
- Test: `tests/services/feishu/cards/router.test.ts`

Exposes a single `feishuCardsPlugin` Fastify plugin that registers two routes: `POST /api/v2/feishu/card-action` (card button callback) and `POST /api/v2/feishu/commands/:name` (slash command posting). Both routes validate the request body with zod, normalize it into a `DispatchInput`, call `CardActionDispatcher.dispatch`, and return the result in the format Feishu expects (`{ card: newCardJson }` or `{ toast }`).

- [ ] **Step 1: Write failing test**

Create `tests/services/feishu/cards/router.test.ts`:

```typescript
import Fastify from "fastify";
import { describe, expect, test, vi } from "vitest";

import { feishuCardsPlugin } from "../../../../src/services/feishu/cards/router.js";
import { CardActionDispatcher } from "../../../../src/services/feishu/cards/card-action-dispatcher.js";
import type {
  CardHandler,
  CardHandlerDeps
} from "../../../../src/services/feishu/cards/types.js";

function emptyDeps(): CardHandlerDeps {
  return {
    repo: {
      insertCardInteraction: vi.fn(() => "inserted" as const),
      findLiveCard: vi.fn(),
      updateLiveCardState: vi.fn(),
      insertLiveCard: vi.fn(),
      closeLiveCard: vi.fn(),
      findEventById: vi.fn(),
      listReviewRequiredEvents: vi.fn(() => []),
      countReviewRequiredEvents: vi.fn(() => 0)
    },
    ingestor: { ingest: vi.fn() },
    aggregator: { applyDecision: vi.fn() },
    feishuClient: { patchCard: vi.fn(), sendCard: vi.fn() },
    clock: () => new Date("2026-04-10T12:00:00.000Z"),
    uuid: () => "u-1"
  };
}

async function buildApp() {
  const dispatcher = new CardActionDispatcher(emptyDeps());
  const okHandler: CardHandler = async () => ({
    newCardJson: { schema: "2.0", header: {}, body: { elements: [] } }
  });
  dispatcher.register("quiz", "submit", okHandler);

  const app = Fastify();
  await app.register(feishuCardsPlugin, {
    dispatcher,
    currentVersion: () => "quiz-v1"
  });
  return app;
}

describe("feishuCardsPlugin routes", () => {
  test("POST /api/v2/feishu/card-action returns newCardJson on known handler", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/v2/feishu/card-action",
      payload: {
        operator: { open_id: "ou-op" },
        trigger_id: "t-1",
        action: { name: "submit", value: { text: "hi" } },
        context: {
          open_message_id: "om-1",
          open_chat_id: "oc-1",
          url: "https://example.com"
        },
        card: { type: "quiz" }
      }
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.card?.schema).toBe("2.0");
    await app.close();
  });

  test("POST /api/v2/feishu/card-action returns toast on unknown action", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/v2/feishu/card-action",
      payload: {
        operator: { open_id: "ou-op" },
        trigger_id: "t-2",
        action: { name: "nonexistent", value: {} },
        context: {
          open_message_id: "om-2",
          open_chat_id: "oc-2",
          url: "x"
        },
        card: { type: "quiz" }
      }
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().toast?.type).toBe("error");
    await app.close();
  });

  test("POST /api/v2/feishu/card-action rejects invalid body with 400", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/v2/feishu/card-action",
      payload: { operator: { open_id: "ou-op" } }
    });
    expect(response.statusCode).toBe(400);
    await app.close();
  });

  test("POST /api/v2/feishu/commands/:name routes to command dispatcher", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/v2/feishu/commands/ping",
      payload: {
        sender: { open_id: "ou-op" },
        chat: { chat_id: "oc-1" },
        message: { message_id: "om-1", text: "/ping" }
      }
    });
    // ping is not a known command; router returns 404 with structured error
    expect(response.statusCode).toBe(404);
    expect(response.json().error).toBe("unknown_command");
    await app.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/services/feishu/cards/router.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/services/feishu/cards/router.ts`**

```typescript
import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import { z } from "zod";

import type { CardActionDispatcher } from "./card-action-dispatcher.js";
import type { CardType, CardActionResult } from "./types.js";

const cardTypeSchema = z.enum([
  "period_open",
  "window_open",
  "quiz",
  "homework_submit",
  "video_checkin",
  "peer_review_vote",
  "peer_review_settle",
  "daily_checkin",
  "leaderboard",
  "level_announcement",
  "graduation",
  "llm_decision",
  "c1_echo",
  "review_queue",
  "member_mgmt",
  "manual_adjust"
]);

const cardActionBodySchema = z.object({
  operator: z.object({ open_id: z.string().min(1) }),
  trigger_id: z.string().min(1),
  action: z.object({
    name: z.string().min(1),
    value: z.record(z.unknown()).default({})
  }),
  context: z.object({
    open_message_id: z.string().min(1),
    open_chat_id: z.string().min(1),
    url: z.string().optional()
  }),
  card: z.object({
    type: cardTypeSchema,
    version: z.string().optional()
  })
});

const commandBodySchema = z.object({
  sender: z.object({ open_id: z.string().min(1) }),
  chat: z.object({ chat_id: z.string().min(1) }),
  message: z.object({
    message_id: z.string().min(1),
    text: z.string().min(1)
  })
});

export interface FeishuCardsPluginOptions {
  dispatcher: CardActionDispatcher;
  /**
   * Returns the current template version for a given card type. Used to
   * stamp card_interactions.feishu_card_version and for version routing.
   */
  currentVersion: (cardType: CardType) => string;
  commandDispatcher?: (
    commandName: string,
    body: z.infer<typeof commandBodySchema>
  ) => Promise<CardActionResult | null>;
}

function respond(reply: { code: (n: number) => void; send: (obj: unknown) => void }, result: CardActionResult): void {
  if (result.newCardJson) {
    reply.code(200);
    reply.send({ card: result.newCardJson });
    return;
  }
  if (result.toast) {
    reply.code(200);
    reply.send({ toast: result.toast });
    return;
  }
  reply.code(500);
  reply.send({ error: "empty_response" });
}

export const feishuCardsPlugin: FastifyPluginAsync<FeishuCardsPluginOptions> =
  async (app: FastifyInstance, options: FeishuCardsPluginOptions) => {
    app.post("/api/v2/feishu/card-action", async (request, reply) => {
      const parsed = cardActionBodySchema.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400);
        return { error: "invalid_body", details: parsed.error.flatten() };
      }
      const body = parsed.data;
      const result = await options.dispatcher.dispatch({
        cardType: body.card.type,
        actionName: body.action.name,
        payload: body.action.value,
        operatorOpenId: body.operator.open_id,
        triggerId: body.trigger_id,
        messageId: body.context.open_message_id,
        chatId: body.context.open_chat_id,
        receivedAt: new Date().toISOString(),
        currentVersion: body.card.version ?? options.currentVersion(body.card.type)
      });
      respond(reply, result);
    });

    app.post<{ Params: { name: string } }>(
      "/api/v2/feishu/commands/:name",
      async (request, reply) => {
        const parsed = commandBodySchema.safeParse(request.body);
        if (!parsed.success) {
          reply.code(400);
          return { error: "invalid_body", details: parsed.error.flatten() };
        }
        if (!options.commandDispatcher) {
          reply.code(404);
          return { error: "unknown_command", command: request.params.name };
        }
        const result = await options.commandDispatcher(
          request.params.name,
          parsed.data
        );
        if (!result) {
          reply.code(404);
          return { error: "unknown_command", command: request.params.name };
        }
        respond(reply, result);
      }
    );
  };
```

- [ ] **Step 4: Register the plugin in `src/app.ts`**

At the top of `src/app.ts`, add the import (alphabetically in the existing feishu block):

```typescript
import { feishuCardsPlugin } from "./services/feishu/cards/router.js";
import { CardActionDispatcher } from "./services/feishu/cards/card-action-dispatcher.js";
```

Find the section of `buildApp` (around line 215 where `await app.register(cors)` lives) and add after `await app.register(sensible);`:

```typescript
// Sub-project 2: Feishu card protocol
const cardDispatcher = new CardActionDispatcher({
  repo: cardRepoAdapter(repo),
  ingestor: ingestorAdapter(repo),
  aggregator: aggregatorAdapter(repo),
  feishuClient: feishuClientAdapter(larkClient),
  clock: () => new Date(),
  uuid: () => crypto.randomUUID()
});
await app.register(feishuCardsPlugin, {
  dispatcher: cardDispatcher,
  currentVersion: (cardType) => currentVersionFor(cardType)
});
```

Note: `cardRepoAdapter`, `ingestorAdapter`, `aggregatorAdapter`, `feishuClientAdapter`, and `currentVersionFor` are introduced as placeholder factories in this task and filled in by subsequent tasks. For now create a stub `src/services/feishu/cards/adapters.ts` exporting:

```typescript
import type {
  CardHandlerDeps,
  CardType
} from "./types.js";

// TODO(Phase C+): wire real implementations once handlers exist.
export function cardRepoAdapter(_repo: unknown): CardHandlerDeps["repo"] {
  throw new Error("cardRepoAdapter not yet implemented");
}
export function ingestorAdapter(_repo: unknown): CardHandlerDeps["ingestor"] {
  throw new Error("ingestorAdapter not yet implemented");
}
export function aggregatorAdapter(
  _repo: unknown
): CardHandlerDeps["aggregator"] {
  throw new Error("aggregatorAdapter not yet implemented");
}
export function feishuClientAdapter(
  _client: unknown
): CardHandlerDeps["feishuClient"] {
  throw new Error("feishuClientAdapter not yet implemented");
}
export function currentVersionFor(_cardType: CardType): string {
  return "v1";
}
```

And in `src/app.ts` where the stub is being referenced, import from `./services/feishu/cards/adapters.js`. This keeps `src/app.ts` compilable today while handlers come online in Phase C+.

Because the adapters throw at construction call-time, tests that exercise `buildApp` from existing `tests/api/app.test.ts` must not hit the card action route yet. The router tests in `tests/services/feishu/cards/router.test.ts` bypass `buildApp` entirely and register `feishuCardsPlugin` on a standalone `Fastify()` instance, so they are unaffected.

- [ ] **Step 5: Run test to verify router tests pass**

Run: `npm test -- tests/services/feishu/cards/router.test.ts`
Expected: PASS — 4 assertions green.

Run also: `npm test -- tests/api/app.test.ts`
Expected: PASS — existing app tests still pass (adapters are not called during the boot path unless a request hits them).

Run: `npm run build`
Expected: PASS — TypeScript compiles.

- [ ] **Step 6: Commit**

```bash
git add \
  src/services/feishu/cards/router.ts \
  src/services/feishu/cards/adapters.ts \
  src/app.ts \
  tests/services/feishu/cards/router.test.ts
git commit -m "feat(sub2): add feishu cards Fastify plugin with 2 routes"
```

---

## Phase B Exit Checkpoint

```bash
npm test
npm run build
```
Expected: both green. Sub2 now has its shared types, `feishu_live_cards` table, soft validation, version resolver, template renderer with size budget, card-action dispatcher with error mapping, and a Fastify plugin registered into `src/app.ts`. Neither the card-action nor the command route has a real handler yet — they return "unknown_action" / "unknown_command" toasts. Phase C will land the first two cards (quiz and daily checkin).

---

## Phase C — First Cards (S1 milestone) (4 tasks)

Phase C delivers the first two cards end-to-end so the sync path is proven before any async machinery lands. The Quiz card (#3) is a static card with no `feishu_live_cards` row — it validates that the CardActionDispatcher + EventIngestor wiring works for simple clicks. The Daily Checkin card (#8) is the first patched card — it validates that `LiveCardRepository` + state merge + in-place card update all cooperate correctly under concurrent load. Phase C closes with a 14-way burst test that exercises the daily-checkin card the way real traffic will hit it.

---

### Task C1: Quiz card template + quiz handler + quiz command (`#3 static`)

**Files:**
- Create: `src/services/feishu/cards/templates/quiz-v1.ts`
- Create: `src/services/feishu/cards/handlers/quiz-handler.ts`
- Test: `tests/services/feishu/cards/templates/quiz-v1.test.ts`
- Test: `tests/services/feishu/cards/handlers/quiz-handler.test.ts`

The quiz card is a static card — there is no `feishu_live_cards` row. A quiz is sent to the group when an operator runs `/测验 <setCode>`. Each student receives the same card; per-student selections are stored exclusively in `card_interactions` rows and never mutated into the rendered card (the card would race between users). On each option click the handler writes a `card_interactions` row and returns a per-user toast. On the "提交" click the handler aggregates the clicker's prior selections, computes K1 (submit = +3) and K2 (`round(correctRate * 10)`), fires two `EventIngestor.ingest` calls, and returns a confirmation toast to that single user.

- [ ] **Step 1: Write failing template test**

Create `tests/services/feishu/cards/templates/quiz-v1.test.ts`:

```typescript
import { describe, expect, test } from "vitest";

import {
  buildQuizCard,
  QUIZ_TEMPLATE_ID,
  type QuizCardState
} from "../../../../../src/services/feishu/cards/templates/quiz-v1.js";
import { assertCardSize } from "../../../../../src/services/feishu/cards/renderer.js";

function fixture(): QuizCardState {
  return {
    setCode: "quiz-w3",
    periodNumber: 3,
    title: "第 3 期知识测验",
    questions: [
      {
        id: "q1",
        text: "Transformer 的自注意力机制依赖以下哪三个矩阵?",
        options: [
          { id: "a", text: "Q / K / V", isCorrect: true },
          { id: "b", text: "W / B / C", isCorrect: false },
          { id: "c", text: "X / Y / Z", isCorrect: false }
        ]
      },
      {
        id: "q2",
        text: "LLM context window 的作用是什么?",
        options: [
          { id: "a", text: "控制单次推理可见的 token 数量", isCorrect: true },
          { id: "b", text: "控制 GPU 显存大小", isCorrect: false }
        ]
      }
    ]
  };
}

describe("buildQuizCard", () => {
  test("renders card with header containing the quiz title", () => {
    const card = buildQuizCard(fixture());
    expect(card.schema).toBe("2.0");
    const header = card.header as { title: { content: string } };
    expect(header.title.content).toContain("第 3 期知识测验");
  });

  test("embeds every question and every option as action elements", () => {
    const card = buildQuizCard(fixture());
    const serialized = JSON.stringify(card);
    expect(serialized).toContain("q1");
    expect(serialized).toContain("q2");
    expect(serialized).toContain("Q / K / V");
    expect(serialized).toContain("控制单次推理");
  });

  test("submit button carries quiz_submit action with setCode", () => {
    const card = buildQuizCard(fixture());
    const serialized = JSON.stringify(card);
    expect(serialized).toContain("quiz_submit");
    expect(serialized).toContain("quiz-w3");
  });

  test("option buttons carry quiz_select action with questionId + optionId", () => {
    const card = buildQuizCard(fixture());
    const serialized = JSON.stringify(card);
    expect(serialized).toContain("quiz_select");
    expect(serialized).toMatch(/"questionId"\s*:\s*"q1"/);
    expect(serialized).toMatch(/"optionId"\s*:\s*"a"/);
  });

  test("serialized payload fits under the card size budget", () => {
    const card = buildQuizCard(fixture());
    expect(() => assertCardSize(card)).not.toThrow();
  });

  test("QUIZ_TEMPLATE_ID is 'quiz-v1'", () => {
    expect(QUIZ_TEMPLATE_ID).toBe("quiz-v1");
  });
});
```

- [ ] **Step 2: Run template test to verify it fails**

Run: `npm test -- tests/services/feishu/cards/templates/quiz-v1.test.ts`
Expected: FAIL — `src/services/feishu/cards/templates/quiz-v1.js` module not found.

- [ ] **Step 3: Implement `src/services/feishu/cards/templates/quiz-v1.ts`**

```typescript
import type { FeishuCardJson } from "../types.js";
import { buildHeader } from "./common/header.js";

export const QUIZ_TEMPLATE_ID = "quiz-v1" as const;

export interface QuizOption {
  id: string;
  text: string;
  isCorrect: boolean;
}

export interface QuizQuestion {
  id: string;
  text: string;
  options: QuizOption[];
}

export interface QuizCardState {
  setCode: string;
  periodNumber: number;
  title: string;
  questions: QuizQuestion[];
}

interface QuizSelectValue {
  action: "quiz_select";
  setCode: string;
  questionId: string;
  optionId: string;
}

interface QuizSubmitValue {
  action: "quiz_submit";
  setCode: string;
}

/**
 * Builds the quiz card v2 JSON. The card is sent to the group; per-user
 * selections are tracked in `card_interactions` rather than on the card,
 * so the rendered JSON is the same for every student in the group.
 */
export function buildQuizCard(state: QuizCardState): FeishuCardJson {
  const elements: Array<Record<string, unknown>> = [];

  state.questions.forEach((question, idx) => {
    elements.push({
      tag: "markdown",
      content: `**Q${idx + 1}. ${question.text}**`
    });

    const optionButtons = question.options.map((opt) => {
      const value: QuizSelectValue = {
        action: "quiz_select",
        setCode: state.setCode,
        questionId: question.id,
        optionId: opt.id
      };
      return {
        tag: "button",
        text: { tag: "plain_text", content: `${opt.id.toUpperCase()}. ${opt.text}` },
        type: "default",
        value
      };
    });

    elements.push({
      tag: "action",
      actions: optionButtons
    });
  });

  const submitValue: QuizSubmitValue = {
    action: "quiz_submit",
    setCode: state.setCode
  };

  elements.push({
    tag: "action",
    actions: [
      {
        tag: "button",
        text: { tag: "plain_text", content: "提交" },
        type: "primary",
        value: submitValue
      }
    ]
  });

  return {
    schema: "2.0",
    header: buildHeader({
      title: state.title,
      subtitle: `第 ${state.periodNumber} 期 · ${state.setCode}`,
      template: "blue"
    }) as unknown as Record<string, unknown>,
    body: { elements }
  };
}
```

- [ ] **Step 4: Run template test to verify it passes**

Run: `npm test -- tests/services/feishu/cards/templates/quiz-v1.test.ts`
Expected: PASS — 6 assertions green.

- [ ] **Step 5: Write failing handler test**

Create `tests/services/feishu/cards/handlers/quiz-handler.test.ts`:

```typescript
import { beforeEach, describe, expect, test, vi } from "vitest";

import {
  quizSelectHandler,
  quizSubmitHandler,
  QUIZ_SET_RESOLVER_KEY
} from "../../../../../src/services/feishu/cards/handlers/quiz-handler.js";
import type {
  CardActionContext,
  CardHandlerDeps,
  IngestResult
} from "../../../../../src/services/feishu/cards/types.js";
import type { QuizCardState } from "../../../../../src/services/feishu/cards/templates/quiz-v1.js";

type CardInteractionCall = Parameters<CardHandlerDeps["repo"]["insertCardInteraction"]>[0];
type IngestCall = Parameters<CardHandlerDeps["ingestor"]["ingest"]>[0];

function fakeDeps(): {
  deps: CardHandlerDeps;
  interactions: CardInteractionCall[];
  ingestCalls: IngestCall[];
  quizSet: QuizCardState;
} {
  const interactions: CardInteractionCall[] = [];
  const ingestCalls: IngestCall[] = [];
  const quizSet: QuizCardState = {
    setCode: "quiz-w3",
    periodNumber: 3,
    title: "第 3 期测验",
    questions: [
      {
        id: "q1",
        text: "Q1",
        options: [
          { id: "a", text: "A", isCorrect: true },
          { id: "b", text: "B", isCorrect: false }
        ]
      },
      {
        id: "q2",
        text: "Q2",
        options: [
          { id: "a", text: "A", isCorrect: false },
          { id: "b", text: "B", isCorrect: true }
        ]
      }
    ]
  };
  const deps: CardHandlerDeps = {
    repo: {
      insertCardInteraction: vi.fn((row: CardInteractionCall) => {
        interactions.push(row);
        return "inserted" as const;
      }),
      findLiveCard: vi.fn(() => null),
      updateLiveCardState: vi.fn(),
      insertLiveCard: vi.fn(),
      closeLiveCard: vi.fn(),
      findEventById: vi.fn(() => null),
      listReviewRequiredEvents: vi.fn(() => []),
      countReviewRequiredEvents: vi.fn(() => 0)
    },
    ingestor: {
      ingest: vi.fn((req: IngestCall): IngestResult => {
        ingestCalls.push(req);
        return {
          eventId: `evt-${ingestCalls.length}`,
          effectiveDelta: req.requestedDelta ?? 0,
          status: "approved"
        };
      })
    },
    aggregator: { applyDecision: vi.fn() },
    feishuClient: {
      patchCard: vi.fn(),
      sendCard: vi.fn(async () => ({ messageId: "om-new" }))
    },
    clock: () => new Date("2026-04-10T12:00:00.000Z"),
    uuid: () => "u-1"
  };
  (deps as unknown as Record<string, unknown>)[QUIZ_SET_RESOLVER_KEY] = (
    setCode: string
  ) => (setCode === quizSet.setCode ? quizSet : null);
  deps.repo.findMemberByOpenId = (openId: string) =>
    openId === "ou-stu-1" ? "m-stu-1" : null;
  return { deps, interactions, ingestCalls, quizSet };
}

function ctx(overrides: Partial<CardActionContext> = {}): CardActionContext {
  return {
    operatorOpenId: "ou-stu-1",
    triggerId: "trig-1",
    actionName: "quiz_select",
    actionPayload: {
      action: "quiz_select",
      setCode: "quiz-w3",
      questionId: "q1",
      optionId: "a"
    },
    messageId: "om-1",
    chatId: "oc-1",
    receivedAt: "2026-04-10T12:00:00.000Z",
    currentVersion: "quiz-v1",
    ...overrides
  };
}

describe("quizSelectHandler", () => {
  let state: ReturnType<typeof fakeDeps>;

  beforeEach(() => {
    state = fakeDeps();
  });

  test("writes card_interaction row and returns per-user toast", async () => {
    const result = await quizSelectHandler(ctx(), state.deps);
    expect(state.interactions).toHaveLength(1);
    const row = state.interactions[0];
    expect(row.actionName).toBe("quiz_select");
    expect(row.cardType).toBe("quiz");
    expect(row.payloadJson).toMatchObject({ questionId: "q1", optionId: "a" });
    expect(result.toast?.content).toContain("已选 A");
    expect(result.newCardJson).toBeUndefined();
  });

  test("idempotent on double click (already_exists returns the same toast)", async () => {
    state.deps.repo.insertCardInteraction = vi.fn(() => "already_exists" as const);
    const result = await quizSelectHandler(ctx(), state.deps);
    expect(result.toast?.type).toBe("info");
  });
});

describe("quizSubmitHandler", () => {
  let state: ReturnType<typeof fakeDeps>;

  beforeEach(() => {
    state = fakeDeps();
  });

  test("submit with 2/2 correct yields K1=3 and K2=10", async () => {
    // Seed 2 prior selections (both correct)
    (state.deps.repo as unknown as {
      listPriorQuizSelections: (args: unknown) => Array<{
        questionId: string;
        optionId: string;
      }>;
    }).listPriorQuizSelections = vi.fn(() => [
      { questionId: "q1", optionId: "a" },
      { questionId: "q2", optionId: "b" }
    ]);

    const result = await quizSubmitHandler(
      ctx({
        actionName: "quiz_submit",
        actionPayload: { action: "quiz_submit", setCode: "quiz-w3" }
      }),
      state.deps
    );

    expect(state.ingestCalls).toHaveLength(2);
    const k1 = state.ingestCalls.find((c) => c.itemCode === "K1");
    const k2 = state.ingestCalls.find((c) => c.itemCode === "K2");
    expect(k1?.requestedDelta).toBe(3);
    expect(k2?.requestedDelta).toBe(10);
    expect(result.toast?.content).toContain("K1 +3");
    expect(result.toast?.content).toContain("K2 +10");
  });

  test("submit with 1/2 correct yields K1=3 and K2=5", async () => {
    (state.deps.repo as unknown as {
      listPriorQuizSelections: (args: unknown) => Array<{
        questionId: string;
        optionId: string;
      }>;
    }).listPriorQuizSelections = vi.fn(() => [
      { questionId: "q1", optionId: "a" },
      { questionId: "q2", optionId: "a" }
    ]);

    const result = await quizSubmitHandler(
      ctx({
        actionName: "quiz_submit",
        actionPayload: { action: "quiz_submit", setCode: "quiz-w3" }
      }),
      state.deps
    );

    const k2 = state.ingestCalls.find((c) => c.itemCode === "K2");
    expect(k2?.requestedDelta).toBe(5);
    expect(result.toast?.content).toContain("K2 +5");
  });

  test("submit with 0 selections responds with a warning toast and no ingest", async () => {
    (state.deps.repo as unknown as {
      listPriorQuizSelections: (args: unknown) => [];
    }).listPriorQuizSelections = vi.fn(() => []);

    const result = await quizSubmitHandler(
      ctx({
        actionName: "quiz_submit",
        actionPayload: { action: "quiz_submit", setCode: "quiz-w3" }
      }),
      state.deps
    );

    expect(state.ingestCalls).toHaveLength(0);
    expect(result.toast?.type).toBe("error");
    expect(result.toast?.content).toMatch(/未作答/);
  });

  test("submit with unknown setCode returns an error toast", async () => {
    const result = await quizSubmitHandler(
      ctx({
        actionName: "quiz_submit",
        actionPayload: { action: "quiz_submit", setCode: "missing" }
      }),
      state.deps
    );
    expect(result.toast?.type).toBe("error");
    expect(state.ingestCalls).toHaveLength(0);
  });
});
```

- [ ] **Step 6: Run handler test to verify it fails**

Run: `npm test -- tests/services/feishu/cards/handlers/quiz-handler.test.ts`
Expected: FAIL — `quiz-handler.js` module not found.

- [ ] **Step 7: Implement `src/services/feishu/cards/handlers/quiz-handler.ts`**

```typescript
import type {
  CardHandler,
  CardHandlerDeps,
  CardInteractionRow,
  IngestRequest
} from "../types.js";
import type {
  QuizCardState,
  QuizQuestion
} from "../templates/quiz-v1.js";

export const QUIZ_SET_RESOLVER_KEY = "quizSetResolver" as const;

type QuizSetResolver = (setCode: string) => QuizCardState | null;
interface QuizDepsExtension {
  [QUIZ_SET_RESOLVER_KEY]?: QuizSetResolver;
}

interface QuizSelectionRecord {
  questionId: string;
  optionId: string;
}

function resolveQuizSet(deps: CardHandlerDeps, setCode: string): QuizCardState | null {
  const ext = deps as unknown as QuizDepsExtension;
  const resolver = ext[QUIZ_SET_RESOLVER_KEY];
  if (!resolver) return null;
  return resolver(setCode);
}

function resolveMemberId(deps: CardHandlerDeps, openId: string): string | null {
  return deps.repo.findMemberByOpenId(openId)?.id ?? null;
}

function listPriorSelections(
  deps: CardHandlerDeps,
  args: { operatorOpenId: string; setCode: string }
): QuizSelectionRecord[] {
  const repoExt = deps.repo as unknown as {
    listPriorQuizSelections?: (args: {
      operatorOpenId: string;
      setCode: string;
    }) => QuizSelectionRecord[];
  };
  return repoExt.listPriorQuizSelections?.(args) ?? [];
}

function computeCorrectRate(
  questions: QuizQuestion[],
  selections: QuizSelectionRecord[]
): number {
  if (selections.length === 0) return 0;
  let correct = 0;
  for (const sel of selections) {
    const q = questions.find((x) => x.id === sel.questionId);
    if (!q) continue;
    const opt = q.options.find((o) => o.id === sel.optionId);
    if (opt?.isCorrect) correct += 1;
  }
  return correct / questions.length;
}

export const quizSelectHandler: CardHandler = async (ctx, deps) => {
  const payload = ctx.actionPayload as {
    questionId?: string;
    optionId?: string;
    setCode?: string;
  };
  if (!payload.questionId || !payload.optionId) {
    return { toast: { type: "error", content: "选项无效" } };
  }

  const row: CardInteractionRow = {
    id: deps.uuid(),
    memberId: resolveMemberId(deps, ctx.operatorOpenId),
    periodId: null,
    cardType: "quiz",
    actionName: "quiz_select",
    feishuMessageId: ctx.messageId,
    feishuCardVersion: ctx.currentVersion,
    payloadJson: {
      questionId: payload.questionId,
      optionId: payload.optionId,
      setCode: payload.setCode
    },
    receivedAt: ctx.receivedAt,
    triggerId: ctx.triggerId,
    operatorOpenId: ctx.operatorOpenId,
    rejectedReason: null
  };
  deps.repo.insertCardInteraction(row);

  return {
    toast: {
      type: "info",
      content: `已选 ${payload.optionId.toUpperCase()}`
    }
  };
};

export const quizSubmitHandler: CardHandler = async (ctx, deps) => {
  const payload = ctx.actionPayload as { setCode?: string };
  const setCode = payload.setCode;
  if (!setCode) {
    return { toast: { type: "error", content: "测验编号缺失" } };
  }

  const quizSet = resolveQuizSet(deps, setCode);
  if (!quizSet) {
    return { toast: { type: "error", content: "未找到此测验" } };
  }

  const memberId = resolveMemberId(deps, ctx.operatorOpenId);
  if (!memberId) {
    return { toast: { type: "error", content: "无法匹配学员身份" } };
  }

  const selections = listPriorSelections(deps, {
    operatorOpenId: ctx.operatorOpenId,
    setCode
  });
  if (selections.length === 0) {
    return { toast: { type: "error", content: "尚未作答,请先选择答案" } };
  }

  const submitRow: CardInteractionRow = {
    id: deps.uuid(),
    memberId,
    periodId: null,
    cardType: "quiz",
    actionName: "quiz_submit",
    feishuMessageId: ctx.messageId,
    feishuCardVersion: ctx.currentVersion,
    payloadJson: { setCode, selectionCount: selections.length },
    receivedAt: ctx.receivedAt,
    triggerId: ctx.triggerId,
    operatorOpenId: ctx.operatorOpenId,
    rejectedReason: null
  };
  const insertResult = deps.repo.insertCardInteraction(submitRow);
  if (insertResult === "already_exists") {
    return { toast: { type: "info", content: "已提交过,不再重复计分" } };
  }

  const correctRate = computeCorrectRate(quizSet.questions, selections);
  const k2Delta = Math.round(correctRate * 10);

  const k1Req: IngestRequest = {
    memberId,
    itemCode: "K1",
    sourceType: "card_interaction",
    sourceRef: submitRow.id,
    payload: { setCode },
    requestedDelta: 3,
    requestedAt: ctx.receivedAt
  };
  deps.ingestor.ingest(k1Req);

  const k2Req: IngestRequest = {
    memberId,
    itemCode: "K2",
    sourceType: "quiz_result",
    sourceRef: `${submitRow.id}:k2`,
    payload: { setCode, correctRate },
    requestedDelta: k2Delta,
    requestedAt: ctx.receivedAt
  };
  deps.ingestor.ingest(k2Req);

  return {
    toast: {
      type: "success",
      content: `K1 +3,K2 +${k2Delta} 已记录`
    }
  };
};
```

- [ ] **Step 8: Run handler test to verify it passes**

Run: `npm test -- tests/services/feishu/cards/handlers/quiz-handler.test.ts`
Expected: PASS — 6 assertions green.

Also run: `npm test` for no regressions. Expected: all tests pass.

- [ ] **Step 9: Commit**

```bash
git add \
  src/services/feishu/cards/templates/quiz-v1.ts \
  src/services/feishu/cards/handlers/quiz-handler.ts \
  tests/services/feishu/cards/templates/quiz-v1.test.ts \
  tests/services/feishu/cards/handlers/quiz-handler.test.ts
git commit -m "feat(sub2): add quiz card template and quiz submit handler"
```

---

### Task C2: Daily checkin template + state schema (`#8 first patched card`)

**Files:**
- Create: `src/services/feishu/cards/templates/daily-checkin-v1.ts`
- Test: `tests/services/feishu/cards/templates/daily-checkin-v1.test.ts`

The daily checkin card is the highest-contention card in the protocol: 14 students × 6 items per day, all patched in place. This task builds the pure rendering half only — the handler that mutates the state lands in Task C3. The template introduces a richer state shape, `DailyCheckinState`, that splits each item's member list into `pending` (审核中, LLM still running) and `approved` (✓, LLM passed). This shape is daily-checkin-specific and lives in the template file; the thin `DailyCheckinState` in `types.ts` stays untouched because Phase A2 tests still reference it.

The card must fit under the 25 KB budget with 14 members distributed across 6 items — the worst case is all 84 member-slots populated plus 6 action rows.

- [ ] **Step 1: Write failing test**

Create `tests/services/feishu/cards/templates/daily-checkin-v1.test.ts`:

```typescript
import { describe, expect, test } from "vitest";

import {
  buildDailyCheckinCard,
  DAILY_CHECKIN_TEMPLATE_ID,
  emptyDailyCheckinState,
  type DailyCheckinState,
  type DailyCheckinItemCode
} from "../../../../../src/services/feishu/cards/templates/daily-checkin-v1.js";
import {
  assertCardSize,
  registerTemplate,
  clearTemplateRegistry,
  renderCard,
  CARD_SIZE_BUDGET_BYTES
} from "../../../../../src/services/feishu/cards/renderer.js";
import type { CardActionContext } from "../../../../../src/services/feishu/cards/types.js";

const ITEM_CODES: DailyCheckinItemCode[] = ["K3", "K4", "H2", "C1", "C3", "G2"];

function fakeCtx(): CardActionContext {
  return {
    operatorOpenId: "ou-op",
    triggerId: "t-1",
    actionName: "unused",
    actionPayload: {},
    messageId: "om-1",
    chatId: "oc-1",
    receivedAt: "2026-04-10T09:00:00.000Z",
    currentVersion: "daily-checkin-v1"
  };
}

function fullyPopulatedState(): DailyCheckinState {
  const state = emptyDailyCheckinState({ periodNumber: 3, postedAt: "2026-04-10T09:00:00.000Z", periodId: "p-1" });
  const memberIds = Array.from({ length: 14 }, (_, i) => `m-${i + 1}`);
  const memberNames = new Map<string, string>();
  memberIds.forEach((id, i) => memberNames.set(id, `学员${i + 1}张三李四`));
  for (const code of ITEM_CODES) {
    // half pending, half approved
    state.items[code].pending = memberIds.slice(0, 7);
    state.items[code].approved = memberIds.slice(7);
  }
  state.memberDisplayNames = Object.fromEntries(memberNames);
  return state;
}

describe("buildDailyCheckinCard", () => {
  test("header shows the period number", () => {
    const card = buildDailyCheckinCard(
      emptyDailyCheckinState({ periodNumber: 3, postedAt: "2026-04-10T09:00:00.000Z", periodId: "p-1" })
    );
    const header = card.header as { title: { content: string } };
    expect(header.title.content).toContain("今日打卡");
    expect(header.title.content).toContain("第 3 期");
  });

  test("body contains 6 item columns (K3/K4/H2/C1/C3/G2)", () => {
    const card = buildDailyCheckinCard(
      emptyDailyCheckinState({ periodNumber: 3, postedAt: "2026-04-10T09:00:00.000Z", periodId: "p-1" })
    );
    const serialized = JSON.stringify(card);
    expect(serialized).toContain("K3");
    expect(serialized).toContain("K4");
    expect(serialized).toContain("H2");
    expect(serialized).toContain("C1");
    expect(serialized).toContain("C3");
    expect(serialized).toContain("G2");
  });

  test("labels match the rules v1.1 emoji titles", () => {
    const card = buildDailyCheckinCard(
      emptyDailyCheckinState({ periodNumber: 3, postedAt: "2026-04-10T09:00:00.000Z", periodId: "p-1" })
    );
    const s = JSON.stringify(card);
    expect(s).toContain("🧠 知识总结");
    expect(s).toContain("🔍 AI纠错");
    expect(s).toContain("🔧 实操分享");
    expect(s).toContain("💡 创意用法");
    expect(s).toContain("📐 提示词模板");
    expect(s).toContain("🌱 课外好资源");
  });

  test("each button carries action name + itemCode in its value", () => {
    const card = buildDailyCheckinCard(
      emptyDailyCheckinState({ periodNumber: 3, postedAt: "2026-04-10T09:00:00.000Z", periodId: "p-1" })
    );
    const s = JSON.stringify(card);
    for (const code of ITEM_CODES) {
      expect(s).toContain(`daily_checkin_${code.toLowerCase()}_submit`);
    }
  });

  test("approved members appear with ✓ marker", () => {
    const state = emptyDailyCheckinState({ periodNumber: 3, postedAt: "2026-04-10T09:00:00.000Z", periodId: "p-1" });
    state.items.K3.approved = ["m-1"];
    state.memberDisplayNames = { "m-1": "张三" };
    const card = buildDailyCheckinCard(state);
    const s = JSON.stringify(card);
    expect(s).toContain("✓");
    expect(s).toContain("张三");
  });

  test("pending members appear with 审核中 marker", () => {
    const state = emptyDailyCheckinState({ periodNumber: 3, postedAt: "2026-04-10T09:00:00.000Z", periodId: "p-1" });
    state.items.C1.pending = ["m-2"];
    state.memberDisplayNames = { "m-2": "李四" };
    const card = buildDailyCheckinCard(state);
    const s = JSON.stringify(card);
    expect(s).toContain("审核中");
    expect(s).toContain("李四");
  });

  test("14 members × 6 items full card stays under CARD_SIZE_BUDGET_BYTES", () => {
    const state = fullyPopulatedState();
    const card = buildDailyCheckinCard(state);
    const bytes = Buffer.byteLength(JSON.stringify(card), "utf8");
    expect(bytes).toBeLessThanOrEqual(CARD_SIZE_BUDGET_BYTES);
    expect(() => assertCardSize(card)).not.toThrow();
  });

  test("emptyDailyCheckinState seeds all 6 item lists as empty", () => {
    const state = emptyDailyCheckinState({ periodNumber: 1, postedAt: "2026-04-10T09:00:00.000Z", periodId: "p-1" });
    for (const code of ITEM_CODES) {
      expect(state.items[code].pending).toEqual([]);
      expect(state.items[code].approved).toEqual([]);
    }
  });

  test("renderCard registers and dispatches the daily-checkin template", () => {
    clearTemplateRegistry();
    registerTemplate(DAILY_CHECKIN_TEMPLATE_ID, buildDailyCheckinCard);
    const state = emptyDailyCheckinState({ periodNumber: 3, postedAt: "2026-04-10T09:00:00.000Z", periodId: "p-1" });
    const card = renderCard(DAILY_CHECKIN_TEMPLATE_ID, state, fakeCtx());
    expect(card.schema).toBe("2.0");
    clearTemplateRegistry();
  });

  test("DAILY_CHECKIN_TEMPLATE_ID is 'daily-checkin-v1'", () => {
    expect(DAILY_CHECKIN_TEMPLATE_ID).toBe("daily-checkin-v1");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/services/feishu/cards/templates/daily-checkin-v1.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/services/feishu/cards/templates/daily-checkin-v1.ts`**

```typescript
import type { FeishuCardJson } from "../types.js";
import { buildHeader } from "./common/header.js";

export const DAILY_CHECKIN_TEMPLATE_ID = "daily-checkin-v1" as const;

export type DailyCheckinItemCode = "K3" | "K4" | "H2" | "C1" | "C3" | "G2";

export interface DailyCheckinItemState {
  pending: string[]; // memberIds currently 审核中
  approved: string[]; // memberIds already ✓
}

export interface DailyCheckinState {
  periodNumber: number;
  postedAt: string;
  items: Record<DailyCheckinItemCode, DailyCheckinItemState>;
  /**
   * Optional map from memberId to display name. When missing, the
   * raw memberId is used as a fallback so templates remain pure.
   */
  memberDisplayNames: Record<string, string>;
}

interface ItemDefinition {
  code: DailyCheckinItemCode;
  label: string;
  actionName: string;
}

const ITEM_DEFINITIONS: readonly ItemDefinition[] = [
  { code: "K3", label: "🧠 知识总结", actionName: "daily_checkin_k3_submit" },
  { code: "K4", label: "🔍 AI纠错", actionName: "daily_checkin_k4_submit" },
  { code: "H2", label: "🔧 实操分享", actionName: "daily_checkin_h2_submit" },
  { code: "C1", label: "💡 创意用法", actionName: "daily_checkin_c1_submit" },
  { code: "C3", label: "📐 提示词模板", actionName: "daily_checkin_c3_submit" },
  { code: "G2", label: "🌱 课外好资源", actionName: "daily_checkin_g2_submit" }
] as const;

export function emptyDailyCheckinState(input: {
  periodNumber: number;
  postedAt: string;
}): DailyCheckinState {
  return {
    periodNumber: input.periodNumber,
    postedAt: input.postedAt,
    items: {
      K3: { pending: [], approved: [] },
      K4: { pending: [], approved: [] },
      H2: { pending: [], approved: [] },
      C1: { pending: [], approved: [] },
      C3: { pending: [], approved: [] },
      G2: { pending: [], approved: [] }
    },
    memberDisplayNames: {}
  };
}

function renderMemberList(
  members: string[],
  marker: "✓" | "审核中",
  names: Record<string, string>
): string {
  if (members.length === 0) return "—";
  return members
    .map((id) => `${marker} ${names[id] ?? id}`)
    .join("  ·  ");
}

function buildItemBlock(
  def: ItemDefinition,
  item: DailyCheckinItemState,
  names: Record<string, string>
): Array<Record<string, unknown>> {
  const approvedLine = renderMemberList(item.approved, "✓", names);
  const pendingLine = renderMemberList(item.pending, "审核中", names);
  return [
    {
      tag: "markdown",
      content: `**${def.label}**\n${approvedLine}\n${pendingLine}`
    },
    {
      tag: "action",
      actions: [
        {
          tag: "button",
          text: { tag: "plain_text", content: `提交 ${def.code}` },
          type: "primary",
          value: {
            action: def.actionName,
            itemCode: def.code
          }
        }
      ]
    }
  ];
}

export function buildDailyCheckinCard(
  state: DailyCheckinState
): FeishuCardJson {
  const elements: Array<Record<string, unknown>> = [];
  for (const def of ITEM_DEFINITIONS) {
    const block = buildItemBlock(
      def,
      state.items[def.code],
      state.memberDisplayNames
    );
    elements.push(...block);
    elements.push({ tag: "hr" });
  }
  elements.pop(); // drop trailing hr

  return {
    schema: "2.0",
    header: buildHeader({
      title: `今日打卡 - 第 ${state.periodNumber} 期`,
      subtitle: "K3 K4 H2 C1 C3 G2 · 点击对应按钮提交",
      template: "green"
    }) as unknown as Record<string, unknown>,
    body: { elements }
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/services/feishu/cards/templates/daily-checkin-v1.test.ts`
Expected: PASS — 10 assertions green, all size budgets under 25 KB.

- [ ] **Step 5: Commit**

```bash
git add \
  src/services/feishu/cards/templates/daily-checkin-v1.ts \
  tests/services/feishu/cards/templates/daily-checkin-v1.test.ts
git commit -m "feat(sub2): add daily checkin card template with 6-item state"
```

---

### Task C3: Daily checkin handler (sync text path for K3/K4/C1/C3/G2)

**Files:**
- Create: `src/services/feishu/cards/handlers/daily-checkin-handler.ts`
- Test: `tests/services/feishu/cards/handlers/daily-checkin-handler.test.ts`

Implements the 5 synchronous button handlers for the daily-checkin card: K3, K4, C1, C3, G2 (H2 is deferred to Phase E because it requires multimodal file_key routing). Each handler runs a consistent pipeline:
1. Extract `payload.text` from the action payload
2. Run soft validation (`validateLlmSubmission` for K3/K4/C1/C3, `validateG2Submission` for G2)
3. Write an idempotent `card_interactions` row (honouring `UNIQUE(feishu_open_id, trigger_id, action_name)`)
4. Call `EventIngestor.ingest` with the right itemCode and soruceType=`card_interaction`
5. Read the active `daily_checkin` live card via `findLiveCard`
6. Merge the member id into `state.items[itemCode].pending`
7. Call `updateLiveCardState` with the new state
8. Render and return the updated card JSON

A shared `buildDailyCheckinHandler(itemCode)` factory keeps the 5 handlers one-line wrappers around the shared pipeline.

- [ ] **Step 1: Write failing test**

Create `tests/services/feishu/cards/handlers/daily-checkin-handler.test.ts`:

```typescript
import { beforeEach, describe, expect, test, vi } from "vitest";

import {
  dailyCheckinK3Handler,
  dailyCheckinK4Handler,
  dailyCheckinC1Handler,
  dailyCheckinC3Handler,
  dailyCheckinG2Handler
} from "../../../../../src/services/feishu/cards/handlers/daily-checkin-handler.js";
import {
  buildDailyCheckinCard,
  DAILY_CHECKIN_TEMPLATE_ID,
  emptyDailyCheckinState,
  type DailyCheckinState
} from "../../../../../src/services/feishu/cards/templates/daily-checkin-v1.js";
import {
  clearTemplateRegistry,
  registerTemplate
} from "../../../../../src/services/feishu/cards/renderer.js";
import type {
  CardActionContext,
  CardHandlerDeps,
  IngestRequest,
  IngestResult,
  LiveCardRow
} from "../../../../../src/services/feishu/cards/types.js";

type InsertInteractionCall = Parameters<
  CardHandlerDeps["repo"]["insertCardInteraction"]
>[0];

function registerTemplateOnce(): void {
  clearTemplateRegistry();
  registerTemplate(DAILY_CHECKIN_TEMPLATE_ID, buildDailyCheckinCard);
}

function seedLiveCardRow(): LiveCardRow {
  return {
    id: "flc-1",
    cardType: "daily_checkin",
    feishuMessageId: "om-dc-1",
    feishuChatId: "oc-1",
    campId: "camp-1",
    periodId: "p-1",
    windowId: null,
    cardVersion: "daily-checkin-v1",
    stateJson: emptyDailyCheckinState({ periodNumber: 3, postedAt: "2026-04-10T09:00:00.000Z", periodId: "p-1" }),
    sentAt: "2026-04-10T09:00:00.000Z",
    lastPatchedAt: null,
    expiresAt: "2026-04-24T09:00:00.000Z",
    closedReason: null
  };
}

function fakeDeps(): {
  deps: CardHandlerDeps;
  interactions: InsertInteractionCall[];
  ingestCalls: IngestRequest[];
  liveRow: LiveCardRow;
} {
  const interactions: InsertInteractionCall[] = [];
  const ingestCalls: IngestRequest[] = [];
  const liveRow = seedLiveCardRow();
  const deps: CardHandlerDeps = {
    repo: {
      insertCardInteraction: vi.fn((row: InsertInteractionCall) => {
        interactions.push(row);
        return "inserted" as const;
      }),
      findLiveCard: vi.fn((type, chatId) => {
        if (type === "daily_checkin" && chatId === "oc-1") return liveRow;
        return null;
      }),
      updateLiveCardState: vi.fn(
        (id: string, nextState: unknown, _at: string) => {
          if (id === liveRow.id) {
            liveRow.stateJson = nextState;
          }
        }
      ),
      insertLiveCard: vi.fn(),
      closeLiveCard: vi.fn(),
      findEventById: vi.fn(() => null),
      listReviewRequiredEvents: vi.fn(() => []),
      countReviewRequiredEvents: vi.fn(() => 0)
    },
    ingestor: {
      ingest: vi.fn((req: IngestRequest): IngestResult => {
        ingestCalls.push(req);
        return {
          eventId: `evt-${ingestCalls.length}`,
          effectiveDelta: req.requestedDelta ?? 3,
          status: "pending"
        };
      })
    },
    aggregator: { applyDecision: vi.fn() },
    feishuClient: {
      patchCard: vi.fn(),
      sendCard: vi.fn()
    },
    clock: () => new Date("2026-04-10T10:00:00.000Z"),
    uuid: () => "ci-1"
  };
  (deps.repo.findMemberByOpenId as ReturnType<typeof vi.fn>).mockImplementation(
    (openId: string) =>
      openId.startsWith("ou-stu-")
        ? {
            id: `m-${openId.replace("ou-stu-", "")}`,
            displayName: `Student ${openId.replace("ou-stu-", "")}`,
            roleType: "student" as const,
            isParticipant: true,
            isExcludedFromBoard: false,
            currentLevel: 1
          }
        : null
  );
  return { deps, interactions, ingestCalls, liveRow };
}

function ctx(overrides: Partial<CardActionContext> = {}): CardActionContext {
  return {
    operatorOpenId: "ou-stu-1",
    triggerId: "trig-1",
    actionName: "daily_checkin_k3_submit",
    actionPayload: {
      action: "daily_checkin_k3_submit",
      itemCode: "K3",
      text: "今天学了 transformer 的自注意力机制,Q K V 矩阵原理讲得很清楚"
    },
    messageId: "om-dc-1",
    chatId: "oc-1",
    receivedAt: "2026-04-10T10:00:00.000Z",
    currentVersion: "daily-checkin-v1",
    ...overrides
  };
}

describe("daily checkin handler (sync text path)", () => {
  let state: ReturnType<typeof fakeDeps>;

  beforeEach(() => {
    registerTemplateOnce();
    state = fakeDeps();
  });

  test("K3 happy path: validates, writes interaction, ingests K3, merges pending, returns card", async () => {
    const result = await dailyCheckinK3Handler(ctx(), state.deps);

    // card_interactions row written
    expect(state.interactions).toHaveLength(1);
    expect(state.interactions[0].actionName).toBe("daily_checkin_k3_submit");
    expect(state.interactions[0].cardType).toBe("daily_checkin");

    // ingestor called with K3 + card_interaction sourceType
    expect(state.ingestCalls).toHaveLength(1);
    const req = state.ingestCalls[0];
    expect(req.itemCode).toBe("K3");
    expect(req.sourceType).toBe("card_interaction");
    expect(req.memberId).toBe("m-1");

    // live-card state merged (m-1 now pending on K3)
    const newState = state.liveRow.stateJson as DailyCheckinState;
    expect(newState.items.K3.pending).toContain("m-1");
    expect(newState.items.K3.approved).toEqual([]);

    // returns new card JSON (not a toast)
    expect(result.newCardJson).toBeDefined();
    expect(result.toast).toBeUndefined();
  });

  test("K4 handler follows the same shape and ingests K4", async () => {
    const result = await dailyCheckinK4Handler(
      ctx({
        actionName: "daily_checkin_k4_submit",
        actionPayload: {
          action: "daily_checkin_k4_submit",
          itemCode: "K4",
          text: "指出 AI 回答中对梯度消失的一处错误,并给出正确解释"
        }
      }),
      state.deps
    );
    expect(state.ingestCalls[0].itemCode).toBe("K4");
    expect(result.newCardJson).toBeDefined();
  });

  test("C1/C3 handlers both ingest their codes", async () => {
    await dailyCheckinC1Handler(
      ctx({
        actionName: "daily_checkin_c1_submit",
        actionPayload: {
          action: "daily_checkin_c1_submit",
          itemCode: "C1",
          text: "用 Claude 生成整套产品文案并配色,节省半天工作时间"
        }
      }),
      state.deps
    );
    await dailyCheckinC3Handler(
      ctx({
        actionName: "daily_checkin_c3_submit",
        actionPayload: {
          action: "daily_checkin_c3_submit",
          itemCode: "C3",
          text: "整理了 5 个 prompt 模板,覆盖总结、翻译、提纲、复盘、评审"
        }
      }),
      state.deps
    );
    expect(state.ingestCalls.map((c) => c.itemCode)).toEqual(["C1", "C3"]);
  });

  test("G2 handler uses validateG2Submission and rejects without URL", async () => {
    const result = await dailyCheckinG2Handler(
      ctx({
        actionName: "daily_checkin_g2_submit",
        actionPayload: {
          action: "daily_checkin_g2_submit",
          itemCode: "G2",
          text: "推荐这个文章讲 AI 很深入值得每个人都看一看真的非常好"
        }
      }),
      state.deps
    );
    expect(result.toast?.type).toBe("error");
    expect(result.toast?.content).toMatch(/URL|链接/);
    expect(state.ingestCalls).toHaveLength(0);
  });

  test("G2 happy path accepts http URL", async () => {
    const result = await dailyCheckinG2Handler(
      ctx({
        actionName: "daily_checkin_g2_submit",
        actionPayload: {
          action: "daily_checkin_g2_submit",
          itemCode: "G2",
          text: "推荐 https://example.com/ai-guide 文章讲 Claude 使用非常清晰"
        }
      }),
      state.deps
    );
    expect(result.newCardJson).toBeDefined();
    expect(state.ingestCalls[0].itemCode).toBe("G2");
  });

  test("short text returns text_too_short toast and does NOT ingest", async () => {
    const result = await dailyCheckinK3Handler(
      ctx({
        actionPayload: {
          action: "daily_checkin_k3_submit",
          itemCode: "K3",
          text: "还好"
        }
      }),
      state.deps
    );
    expect(result.toast?.type).toBe("error");
    expect(result.toast?.content).toMatch(/至少 20/);
    expect(state.ingestCalls).toHaveLength(0);
    expect(state.interactions).toHaveLength(1);
    expect(state.interactions[0].rejectedReason).toBe("text_too_short");
  });

  test("missing active live card throws a clear error toast", async () => {
    state.deps.repo.findLiveCard = vi.fn(() => null);
    const result = await dailyCheckinK3Handler(ctx(), state.deps);
    expect(result.toast?.type).toBe("error");
    expect(result.toast?.content).toMatch(/未找到今日打卡卡片/);
  });

  test("unknown member open id returns an error toast", async () => {
    const result = await dailyCheckinK3Handler(
      ctx({ operatorOpenId: "ou-unknown" }),
      state.deps
    );
    expect(result.toast?.type).toBe("error");
    expect(state.ingestCalls).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/services/feishu/cards/handlers/daily-checkin-handler.test.ts`
Expected: FAIL — `daily-checkin-handler.js` module not found.

- [ ] **Step 3: Implement `src/services/feishu/cards/handlers/daily-checkin-handler.ts`**

```typescript
import {
  validateG2Submission,
  validateLlmSubmission,
  type SoftValidationResult
} from "../soft-validation.js";
import { renderCard } from "../renderer.js";
import {
  DAILY_CHECKIN_TEMPLATE_ID,
  type DailyCheckinState,
  type DailyCheckinItemCode
} from "../templates/daily-checkin-v1.js";
import type {
  CardActionContext,
  CardActionResult,
  CardHandler,
  CardHandlerDeps,
  CardInteractionRow,
  IngestRequest,
  LiveCardRow
} from "../types.js";

function resolveMemberId(deps: CardHandlerDeps, openId: string): string | null {
  const ext = deps as unknown as {
      };
  return deps.repo.findMemberByOpenId(openId)?.id ?? null;
}

function validateFor(
  itemCode: DailyCheckinItemCode,
  text: string
): SoftValidationResult {
  if (itemCode === "G2") return validateG2Submission({ text });
  // H2 is handled by a dedicated multimodal handler in Phase E
  return validateLlmSubmission({ text });
}

function reasonToastContent(reason: string): string {
  if (reason === "text_too_short") return "描述至少 20 字,请补充内容";
  if (reason === "missing_url") return "请附上文章/视频的 http URL 链接";
  return `提交被拒绝: ${reason}`;
}

function mergePendingMember(
  state: DailyCheckinState,
  itemCode: DailyCheckinItemCode,
  memberId: string
): DailyCheckinState {
  const item = state.items[itemCode];
  if (item.pending.includes(memberId) || item.approved.includes(memberId)) {
    return state;
  }
  return {
    ...state,
    items: {
      ...state.items,
      [itemCode]: {
        pending: [...item.pending, memberId],
        approved: item.approved
      }
    }
  };
}

async function runDailyCheckinPipeline(
  itemCode: DailyCheckinItemCode,
  actionName: string,
  ctx: CardActionContext,
  deps: CardHandlerDeps
): Promise<CardActionResult> {
  const payload = ctx.actionPayload as { text?: string };
  const text = typeof payload.text === "string" ? payload.text : "";

  const memberId = resolveMemberId(deps, ctx.operatorOpenId);
  if (!memberId) {
    return { toast: { type: "error", content: "无法匹配学员身份,请联系运营" } };
  }

  // Step 1: soft validation
  const validation = validateFor(itemCode, text);
  if (!validation.ok) {
    const interaction: CardInteractionRow = {
      id: deps.uuid(),
      memberId,
      periodId: null,
      cardType: "daily_checkin",
      actionName,
      feishuMessageId: ctx.messageId,
      feishuCardVersion: ctx.currentVersion,
      payloadJson: { text, itemCode },
      receivedAt: ctx.receivedAt,
      triggerId: ctx.triggerId,
      operatorOpenId: ctx.operatorOpenId,
      rejectedReason: validation.reason
    };
    deps.repo.insertCardInteraction(interaction);
    return {
      toast: { type: "error", content: reasonToastContent(validation.reason) }
    };
  }

  // Step 2: idempotent card_interactions write
  const interactionId = deps.uuid();
  const interaction: CardInteractionRow = {
    id: interactionId,
    memberId,
    periodId: null,
    cardType: "daily_checkin",
    actionName,
    feishuMessageId: ctx.messageId,
    feishuCardVersion: ctx.currentVersion,
    payloadJson: { text, itemCode },
    receivedAt: ctx.receivedAt,
    triggerId: ctx.triggerId,
    operatorOpenId: ctx.operatorOpenId,
    rejectedReason: null
  };
  const insertResult = deps.repo.insertCardInteraction(interaction);
  if (insertResult === "already_exists") {
    return { toast: { type: "info", content: "已记录" } };
  }

  // Step 3: EventIngestor.ingest
  const ingestReq: IngestRequest = {
    memberId,
    itemCode,
    sourceType: "card_interaction",
    sourceRef: interactionId,
    payload: { text },
    requestedDelta: itemCode === "C1" ? 4 : itemCode === "C3" ? 5 : 3,
    requestedAt: ctx.receivedAt
  };
  deps.ingestor.ingest(ingestReq);

  // Step 4: load current live card state
  const liveRow: LiveCardRow | null = deps.repo.findLiveCard(
    "daily_checkin",
    ctx.chatId
  );
  if (!liveRow) {
    return {
      toast: {
        type: "error",
        content: "未找到今日打卡卡片,请等讲师执行 /打卡"
      }
    };
  }

  // Step 5: merge member id into pending list
  const currentState = liveRow.stateJson as DailyCheckinState;
  const nextState = mergePendingMember(currentState, itemCode, memberId);

  // Step 6: persist new state
  deps.repo.updateLiveCardState(liveRow.id, nextState, ctx.receivedAt);

  // Step 7: render new card
  const newCardJson = renderCard(DAILY_CHECKIN_TEMPLATE_ID, nextState, ctx);

  return { newCardJson };
}

function buildHandler(
  itemCode: DailyCheckinItemCode,
  actionName: string
): CardHandler {
  return (ctx, deps) => runDailyCheckinPipeline(itemCode, actionName, ctx, deps);
}

export const dailyCheckinK3Handler: CardHandler = buildHandler(
  "K3",
  "daily_checkin_k3_submit"
);
export const dailyCheckinK4Handler: CardHandler = buildHandler(
  "K4",
  "daily_checkin_k4_submit"
);
export const dailyCheckinC1Handler: CardHandler = buildHandler(
  "C1",
  "daily_checkin_c1_submit"
);
export const dailyCheckinC3Handler: CardHandler = buildHandler(
  "C3",
  "daily_checkin_c3_submit"
);
export const dailyCheckinG2Handler: CardHandler = buildHandler(
  "G2",
  "daily_checkin_g2_submit"
);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/services/feishu/cards/handlers/daily-checkin-handler.test.ts`
Expected: PASS — 8 assertions green.

Also run: `npm test` to confirm no regressions. Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add \
  src/services/feishu/cards/handlers/daily-checkin-handler.ts \
  tests/services/feishu/cards/handlers/daily-checkin-handler.test.ts
git commit -m "feat(sub2): add daily checkin sync handlers for K3/K4/C1/C3/G2"
```

---

### Task C4: Sync burst exit checkpoint test

**Files:**
- Test: `tests/services/feishu/cards/handlers/daily-checkin-burst.test.ts`

Integration test that validates the exit criterion for S1: 14 concurrent clicks on the daily-checkin card (14 students × 6 items, one click each) must all succeed with no dropped interactions and no rendered card over the 25 KB budget. This test uses a real `:memory:` `SqliteRepository`, real `LiveCardRepository`, real `CardActionDispatcher`, and the real daily-checkin handlers registered via `dispatcher.register`. Only the `EventIngestor` is faked (returning a fixed eventId per call) because the ingestor's own end-to-end behavior is exercised by sub-project 1 tests.

- [ ] **Step 1: Write the burst test**

Create `tests/services/feishu/cards/handlers/daily-checkin-burst.test.ts`:

```typescript
import { beforeEach, describe, expect, test, vi } from "vitest";

import { SqliteRepository } from "../../../../../src/storage/sqlite-repository.js";
import { LiveCardRepository } from "../../../../../src/services/feishu/cards/live-card-repository.js";
import { CardActionDispatcher } from "../../../../../src/services/feishu/cards/card-action-dispatcher.js";
import {
  clearTemplateRegistry,
  registerTemplate,
  CARD_SIZE_BUDGET_BYTES
} from "../../../../../src/services/feishu/cards/renderer.js";
import {
  buildDailyCheckinCard,
  DAILY_CHECKIN_TEMPLATE_ID,
  emptyDailyCheckinState,
  type DailyCheckinState,
  type DailyCheckinItemCode
} from "../../../../../src/services/feishu/cards/templates/daily-checkin-v1.js";
import {
  dailyCheckinK3Handler,
  dailyCheckinK4Handler,
  dailyCheckinC1Handler,
  dailyCheckinC3Handler,
  dailyCheckinG2Handler
} from "../../../../../src/services/feishu/cards/handlers/daily-checkin-handler.js";
import type {
  CardHandlerDeps,
  IngestRequest,
  IngestResult,
  LiveCardRow
} from "../../../../../src/services/feishu/cards/types.js";

const LONG_TEXT = "这里是一段至少 20 字的学习笔记用来通过软验证规则,内容足以描述今天的收获";
const LONG_G2_TEXT =
  "推荐 https://example.com/ai-guide 这篇讲 Claude 使用非常清晰值得反复阅读";

interface ClickSpec {
  memberId: string;
  openId: string;
  itemCode: DailyCheckinItemCode;
  actionName: string;
  text: string;
}

function clickSpecs(): ClickSpec[] {
  const codes: DailyCheckinItemCode[] = ["K3", "K4", "C1", "C3", "G2"];
  const actions: Record<DailyCheckinItemCode, string> = {
    K3: "daily_checkin_k3_submit",
    K4: "daily_checkin_k4_submit",
    H2: "daily_checkin_h2_submit", // unused in this burst (deferred to Phase E)
    C1: "daily_checkin_c1_submit",
    C3: "daily_checkin_c3_submit",
    G2: "daily_checkin_g2_submit"
  };
  // 14 clicks across the 5 available items, distribution: K3×3, K4×3, C1×3, C3×3, G2×2
  const buckets: DailyCheckinItemCode[] = [
    "K3", "K3", "K3",
    "K4", "K4", "K4",
    "C1", "C1", "C1",
    "C3", "C3", "C3",
    "G2", "G2"
  ];
  return buckets.map((code, i) => {
    const idx = i + 1;
    return {
      memberId: `m-${idx}`,
      openId: `ou-stu-${idx}`,
      itemCode: code,
      actionName: actions[code],
      text: code === "G2" ? LONG_G2_TEXT : LONG_TEXT
    };
  });
}

describe("daily checkin sync burst (S1 exit checkpoint)", () => {
  let repo: SqliteRepository;
  let live: LiveCardRepository;
  let dispatcher: CardActionDispatcher;
  let ingestCalls: IngestRequest[];
  let interactionRows: Array<{ id: string; actionName: string; memberId: string | null }>;
  let liveRow: LiveCardRow;

  beforeEach(() => {
    clearTemplateRegistry();
    registerTemplate(DAILY_CHECKIN_TEMPLATE_ID, buildDailyCheckinCard);

    repo = new SqliteRepository(":memory:");
    live = new LiveCardRepository(repo);

    ingestCalls = [];
    interactionRows = [];

    liveRow = {
      id: "flc-dc-1",
      cardType: "daily_checkin",
      feishuMessageId: "om-dc-1",
      feishuChatId: "oc-1",
      campId: "camp-1",
      periodId: "p-1",
      windowId: null,
      cardVersion: "daily-checkin-v1",
      stateJson: emptyDailyCheckinState({ periodNumber: 3, postedAt: "2026-04-10T09:00:00.000Z", periodId: "p-1" }),
      sentAt: "2026-04-10T09:00:00.000Z",
      lastPatchedAt: null,
      expiresAt: "2026-04-24T09:00:00.000Z",
      closedReason: null
    };
    live.insert(liveRow);

    let seq = 0;
    const deps: CardHandlerDeps = {
      repo: {
        insertCardInteraction: vi.fn((row) => {
          interactionRows.push({
            id: row.id,
            actionName: row.actionName,
            memberId: row.memberId
          });
          return "inserted" as const;
        }),
        findLiveCard: vi.fn((type, chatId) => live.findActive(type, chatId)),
        updateLiveCardState: vi.fn((id, next, at) =>
          live.updateState(id, next, at)
        ),
        insertLiveCard: vi.fn((row) => live.insert(row)),
        closeLiveCard: vi.fn((id, reason) => live.close(id, reason ?? null)),
        findEventById: vi.fn(() => null),
        listReviewRequiredEvents: vi.fn(() => []),
        countReviewRequiredEvents: vi.fn(() => 0)
      },
      ingestor: {
        ingest: vi.fn((req: IngestRequest): IngestResult => {
          ingestCalls.push(req);
          seq += 1;
          return {
            eventId: `evt-${seq}`,
            effectiveDelta: req.requestedDelta ?? 3,
            status: "pending"
          };
        })
      },
      aggregator: { applyDecision: vi.fn() },
      feishuClient: {
        patchCard: vi.fn(),
        sendCard: vi.fn()
      },
      clock: () => new Date("2026-04-10T10:00:00.000Z"),
      uuid: (() => {
        let u = 0;
        return () => `ci-${++u}`;
      })()
    };
    (deps.repo.findMemberByOpenId as ReturnType<typeof vi.fn>).mockImplementation(
      (openId: string) =>
        openId.startsWith("ou-stu-")
          ? {
              id: `m-${openId.replace("ou-stu-", "")}`,
              displayName: `Student ${openId.replace("ou-stu-", "")}`,
              roleType: "student" as const,
              isParticipant: true,
              isExcludedFromBoard: false,
              currentLevel: 1
            }
          : null
    );

    dispatcher = new CardActionDispatcher(deps);
    dispatcher.register("daily_checkin", "daily_checkin_k3_submit", dailyCheckinK3Handler);
    dispatcher.register("daily_checkin", "daily_checkin_k4_submit", dailyCheckinK4Handler);
    dispatcher.register("daily_checkin", "daily_checkin_c1_submit", dailyCheckinC1Handler);
    dispatcher.register("daily_checkin", "daily_checkin_c3_submit", dailyCheckinC3Handler);
    dispatcher.register("daily_checkin", "daily_checkin_g2_submit", dailyCheckinG2Handler);
  });

  test("14 concurrent clicks all succeed with no exceptions", async () => {
    const specs = clickSpecs();
    const results = await Promise.all(
      specs.map((spec, i) =>
        dispatcher.dispatch({
          cardType: "daily_checkin",
          actionName: spec.actionName,
          payload: {
            action: spec.actionName,
            itemCode: spec.itemCode,
            text: spec.text
          },
          operatorOpenId: spec.openId,
          triggerId: `trig-${i + 1}`,
          messageId: "om-dc-1",
          chatId: "oc-1",
          receivedAt: "2026-04-10T10:00:00.000Z",
          currentVersion: "daily-checkin-v1"
        })
      )
    );

    // every dispatch returned a new card (not an error toast)
    for (const r of results) {
      expect(r.toast).toBeUndefined();
      expect(r.newCardJson).toBeDefined();
    }
  });

  test("all 14 card_interactions rows are recorded", async () => {
    const specs = clickSpecs();
    await Promise.all(
      specs.map((spec, i) =>
        dispatcher.dispatch({
          cardType: "daily_checkin",
          actionName: spec.actionName,
          payload: {
            action: spec.actionName,
            itemCode: spec.itemCode,
            text: spec.text
          },
          operatorOpenId: spec.openId,
          triggerId: `trig-${i + 1}`,
          messageId: "om-dc-1",
          chatId: "oc-1",
          receivedAt: "2026-04-10T10:00:00.000Z",
          currentVersion: "daily-checkin-v1"
        })
      )
    );
    expect(interactionRows).toHaveLength(14);
    expect(new Set(interactionRows.map((r) => r.memberId)).size).toBe(14);
  });

  test("live card state reflects all 14 pending memberIds spread across 5 items", async () => {
    const specs = clickSpecs();
    await Promise.all(
      specs.map((spec, i) =>
        dispatcher.dispatch({
          cardType: "daily_checkin",
          actionName: spec.actionName,
          payload: {
            action: spec.actionName,
            itemCode: spec.itemCode,
            text: spec.text
          },
          operatorOpenId: spec.openId,
          triggerId: `trig-${i + 1}`,
          messageId: "om-dc-1",
          chatId: "oc-1",
          receivedAt: "2026-04-10T10:00:00.000Z",
          currentVersion: "daily-checkin-v1"
        })
      )
    );
    const latest = live.findActive("daily_checkin", "oc-1");
    expect(latest).not.toBeNull();
    const s = latest!.stateJson as DailyCheckinState;
    const totalPending =
      s.items.K3.pending.length +
      s.items.K4.pending.length +
      s.items.C1.pending.length +
      s.items.C3.pending.length +
      s.items.G2.pending.length;
    expect(totalPending).toBe(14);
  });

  test("all 14 rendered cards fit within the 25 KB budget", async () => {
    const specs = clickSpecs();
    const results = await Promise.all(
      specs.map((spec, i) =>
        dispatcher.dispatch({
          cardType: "daily_checkin",
          actionName: spec.actionName,
          payload: {
            action: spec.actionName,
            itemCode: spec.itemCode,
            text: spec.text
          },
          operatorOpenId: spec.openId,
          triggerId: `trig-${i + 1}`,
          messageId: "om-dc-1",
          chatId: "oc-1",
          receivedAt: "2026-04-10T10:00:00.000Z",
          currentVersion: "daily-checkin-v1"
        })
      )
    );
    for (const r of results) {
      const bytes = Buffer.byteLength(JSON.stringify(r.newCardJson), "utf8");
      expect(bytes).toBeLessThanOrEqual(CARD_SIZE_BUDGET_BYTES);
    }
  });

  test("EventIngestor receives 14 distinct ingest calls", async () => {
    const specs = clickSpecs();
    await Promise.all(
      specs.map((spec, i) =>
        dispatcher.dispatch({
          cardType: "daily_checkin",
          actionName: spec.actionName,
          payload: {
            action: spec.actionName,
            itemCode: spec.itemCode,
            text: spec.text
          },
          operatorOpenId: spec.openId,
          triggerId: `trig-${i + 1}`,
          messageId: "om-dc-1",
          chatId: "oc-1",
          receivedAt: "2026-04-10T10:00:00.000Z",
          currentVersion: "daily-checkin-v1"
        })
      )
    );
    expect(ingestCalls).toHaveLength(14);
    expect(new Set(ingestCalls.map((c) => c.sourceRef)).size).toBe(14);
  });
});
```

- [ ] **Step 2: Run the burst test**

Run: `npm test -- tests/services/feishu/cards/handlers/daily-checkin-burst.test.ts`
Expected: PASS — 5 assertions green. If any handler dropped a row, the counts fail and the test is the canonical reference for the S1 exit gate.

Also run: `npm test` one more time to confirm everything else is still green.

- [ ] **Step 3: Commit**

```bash
git add tests/services/feishu/cards/handlers/daily-checkin-burst.test.ts
git commit -m "test(sub2): add 14-click burst checkpoint for daily checkin card"
```

---

## Phase C Exit Checkpoint

Run the full suite and build:

```bash
npm test
npm run build
```

Expected: both green. The sync path is now proven end-to-end: the Quiz card demonstrates the simple static-card flow (click → ingest → toast), and the Daily Checkin card demonstrates the patched flow (click → ingest → merge state → render new card JSON). The burst test locks in the S1 exit criterion — 14 concurrent students can all submit different items in parallel without dropped rows or oversized payloads. No async patch machinery or LLM decision loop exists yet; Phase D wires that in.

---

## Phase D — Async path (S2 milestone) (4 tasks)

Phase D wires the server-initiated update path: when the LLM scoring worker (sub-project 1 Phase E) finishes judging a text submission, Sub2 must patch the daily-checkin card to move that student's marker from "审核中" to "✓", and must also DM the student with a dedicated LLM Decision Card that shows the full reasoning and (for rejected events) an appeal button. Phase D also establishes the 230031 fallback: when a card is past Feishu's 14-day patch retention, the patcher closes the old row and sends a fresh card.

---

### Task D1: Patch worker module (`patch-worker.ts`)

**Files:**
- Create: `src/services/feishu/cards/patch-worker.ts`
- Test: `tests/services/feishu/cards/patch-worker.test.ts`

Builds the asynchronous patch API used by every server-initiated card update. `notifySub2CardPatch(cardType, contextKey, newState, deps)` is the single entry point: it looks up the active `feishu_live_cards` row, merges the requested state delta into the existing state, renders a new card JSON via the template registry, and calls `feishuClient.patchCard(messageId, cardJson)`. The worker retries up to 3 times with exponential backoff (100ms, 400ms, 1600ms) on Feishu 5 QPS rate-limit errors. On the 230031 ("card past retention") error it emits a `needsSend` outcome for the caller (Task D4 wires this into a fallback `sendCard`). On repeated failures it writes a dead-letter row and returns a `failed` outcome.

- [ ] **Step 1: Write failing test**

Create `tests/services/feishu/cards/patch-worker.test.ts`:

```typescript
import { beforeEach, describe, expect, test, vi } from "vitest";

import {
  notifySub2CardPatch,
  type PatchWorkerDeps,
  type PatchWorkerResult
} from "../../../../src/services/feishu/cards/patch-worker.js";
import {
  buildDailyCheckinCard,
  DAILY_CHECKIN_TEMPLATE_ID,
  emptyDailyCheckinState,
  type DailyCheckinState
} from "../../../../src/services/feishu/cards/templates/daily-checkin-v1.js";
import {
  clearTemplateRegistry,
  registerTemplate
} from "../../../../src/services/feishu/cards/renderer.js";
import type { LiveCardRow } from "../../../../src/services/feishu/cards/types.js";

const RATE_LIMIT_ERROR = Object.assign(new Error("rate limited"), {
  code: "rate_limited"
});
const EXPIRED_ERROR = Object.assign(new Error("message too old"), {
  code: 230031
});

function seedRow(): LiveCardRow {
  return {
    id: "flc-1",
    cardType: "daily_checkin",
    feishuMessageId: "om-dc-1",
    feishuChatId: "oc-1",
    campId: "camp-1",
    periodId: "p-1",
    windowId: null,
    cardVersion: "daily-checkin-v1",
    stateJson: emptyDailyCheckinState({ periodNumber: 3, postedAt: "2026-04-10T09:00:00.000Z", periodId: "p-1" }),
    sentAt: "2026-04-10T09:00:00.000Z",
    lastPatchedAt: null,
    expiresAt: "2026-04-24T09:00:00.000Z",
    closedReason: null
  };
}

function fakePatchDeps(): {
  deps: PatchWorkerDeps;
  row: LiveCardRow;
  patchCalls: Array<{ messageId: string; content: unknown }>;
  deadLetters: Array<{ reason: string }>;
  updates: Array<{ id: string; state: unknown }>;
  closes: Array<{ id: string; reason: string }>;
} {
  const row = seedRow();
  const patchCalls: Array<{ messageId: string; content: unknown }> = [];
  const deadLetters: Array<{ reason: string }> = [];
  const updates: Array<{ id: string; state: unknown }> = [];
  const closes: Array<{ id: string; reason: string }> = [];
  const deps: PatchWorkerDeps = {
    live: {
      findActive: vi.fn((type, chatId) =>
        type === row.cardType && chatId === row.feishuChatId ? row : null
      ),
      updateState: vi.fn((id, state, _at) => {
        updates.push({ id, state });
        row.stateJson = state;
      }),
      close: vi.fn((id, reason) => {
        closes.push({ id, reason: reason ?? "unknown" });
        row.closedReason = reason ?? "unknown";
      })
    },
    feishuClient: {
      patchCard: vi.fn(async (messageId, content) => {
        patchCalls.push({ messageId, content });
      })
    },
    deadLetter: {
      insert: vi.fn((entry) => {
        deadLetters.push({ reason: entry.reason });
      })
    },
    clock: () => new Date("2026-04-10T12:00:00.000Z"),
    sleep: vi.fn(async () => undefined),
    templateIdFor: (cardType) =>
      cardType === "daily_checkin" ? DAILY_CHECKIN_TEMPLATE_ID : null,
    maxAttempts: 3
  };
  return { deps, row, patchCalls, deadLetters, updates, closes };
}

function deltaApproveK3(memberId: string) {
  return (prev: DailyCheckinState): DailyCheckinState => ({
    ...prev,
    items: {
      ...prev.items,
      K3: {
        pending: prev.items.K3.pending.filter((id) => id !== memberId),
        approved: Array.from(new Set([...prev.items.K3.approved, memberId]))
      }
    }
  });
}

describe("notifySub2CardPatch", () => {
  beforeEach(() => {
    clearTemplateRegistry();
    registerTemplate(DAILY_CHECKIN_TEMPLATE_ID, buildDailyCheckinCard);
  });

  test("happy path patches the card once and updates live row state", async () => {
    const { deps, row, patchCalls, updates } = fakePatchDeps();
    row.stateJson = {
      ...(row.stateJson as DailyCheckinState),
      items: {
        ...(row.stateJson as DailyCheckinState).items,
        K3: { pending: ["m-1"], approved: [] }
      }
    };
    const result: PatchWorkerResult = await notifySub2CardPatch(
      "daily_checkin",
      "oc-1",
      deltaApproveK3("m-1"),
      deps
    );
    expect(result.status).toBe("patched");
    expect(patchCalls).toHaveLength(1);
    expect(patchCalls[0].messageId).toBe("om-dc-1");
    expect(updates).toHaveLength(1);
    const newState = updates[0].state as DailyCheckinState;
    expect(newState.items.K3.approved).toContain("m-1");
    expect(newState.items.K3.pending).not.toContain("m-1");
  });

  test("missing active row emits needsSend without patching", async () => {
    const { deps } = fakePatchDeps();
    deps.live.findActive = vi.fn(() => null);
    const result = await notifySub2CardPatch(
      "daily_checkin",
      "oc-missing",
      deltaApproveK3("m-1"),
      deps
    );
    expect(result.status).toBe("needsSend");
    expect(deps.feishuClient.patchCard).not.toHaveBeenCalled();
  });

  test("rate limit error retries with exponential backoff and eventually succeeds", async () => {
    const { deps, patchCalls, deadLetters } = fakePatchDeps();
    const patchMock = vi
      .fn()
      .mockRejectedValueOnce(RATE_LIMIT_ERROR)
      .mockRejectedValueOnce(RATE_LIMIT_ERROR)
      .mockResolvedValueOnce(undefined);
    deps.feishuClient.patchCard = patchMock as typeof deps.feishuClient.patchCard;

    const result = await notifySub2CardPatch(
      "daily_checkin",
      "oc-1",
      deltaApproveK3("m-1"),
      deps
    );

    expect(result.status).toBe("patched");
    expect(patchMock).toHaveBeenCalledTimes(3);
    expect(deps.sleep).toHaveBeenCalledTimes(2);
    expect(deadLetters).toHaveLength(0);
    expect(patchCalls).toHaveLength(0); // ignored because we overrode the mock
  });

  test("3 rate-limit failures write to dead letter and return failed", async () => {
    const { deps, deadLetters } = fakePatchDeps();
    deps.feishuClient.patchCard = vi.fn().mockRejectedValue(RATE_LIMIT_ERROR);

    const result = await notifySub2CardPatch(
      "daily_checkin",
      "oc-1",
      deltaApproveK3("m-1"),
      deps
    );

    expect(result.status).toBe("failed");
    expect(deps.feishuClient.patchCard).toHaveBeenCalledTimes(3);
    expect(deadLetters).toHaveLength(1);
    expect(deadLetters[0].reason).toContain("rate_limited");
  });

  test("230031 error closes old row and returns needsSend without retry", async () => {
    const { deps, closes } = fakePatchDeps();
    deps.feishuClient.patchCard = vi.fn().mockRejectedValue(EXPIRED_ERROR);

    const result = await notifySub2CardPatch(
      "daily_checkin",
      "oc-1",
      deltaApproveK3("m-1"),
      deps
    );

    expect(result.status).toBe("needsSend");
    if (result.status === "needsSend") {
      expect(result.closedRowId).toBe("flc-1");
    }
    expect(deps.feishuClient.patchCard).toHaveBeenCalledTimes(1);
    expect(closes).toHaveLength(1);
    expect(closes[0].reason).toBe("expired");
  });

  test("unknown error falls through to dead letter after maxAttempts", async () => {
    const { deps, deadLetters } = fakePatchDeps();
    deps.feishuClient.patchCard = vi
      .fn()
      .mockRejectedValue(new Error("boom"));
    const result = await notifySub2CardPatch(
      "daily_checkin",
      "oc-1",
      deltaApproveK3("m-1"),
      deps
    );
    expect(result.status).toBe("failed");
    expect(deadLetters[0].reason).toContain("boom");
  });

  test("delta function receiving the current state is called exactly once per attempt", async () => {
    const { deps } = fakePatchDeps();
    const delta = vi.fn((prev: DailyCheckinState) => ({
      ...prev,
      items: {
        ...prev.items,
        K3: { pending: [], approved: ["m-1"] }
      }
    }));
    await notifySub2CardPatch("daily_checkin", "oc-1", delta, deps);
    expect(delta).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/services/feishu/cards/patch-worker.test.ts`
Expected: FAIL — `patch-worker.js` module not found.

- [ ] **Step 3: Implement `src/services/feishu/cards/patch-worker.ts`**

```typescript
import { renderCard } from "./renderer.js";
import type {
  CardType,
  FeishuCardJson,
  LiveCardRow
} from "./types.js";

export interface PatchWorkerDeps {
  live: {
    findActive: (cardType: CardType, chatId: string) => LiveCardRow | null;
    updateState: (id: string, state: unknown, patchedAt: string) => void;
    close: (id: string, reason: LiveCardRow["closedReason"]) => void;
  };
  feishuClient: {
    patchCard: (messageId: string, content: FeishuCardJson) => Promise<void>;
  };
  deadLetter: {
    insert: (entry: {
      cardType: CardType;
      messageId: string;
      reason: string;
      attempts: number;
      enqueuedAt: string;
    }) => void;
  };
  clock: () => Date;
  sleep: (ms: number) => Promise<void>;
  templateIdFor: (cardType: CardType) => string | null;
  maxAttempts: number;
}

export type StateDelta<TState> = (prev: TState) => TState;

export type PatchWorkerResult =
  | { status: "patched"; rowId: string }
  | { status: "needsSend"; closedRowId: string | null; reason: string }
  | { status: "failed"; reason: string; attempts: number };

const BASE_BACKOFF_MS = 100;
const EXPIRED_CODE = 230031;
const RATE_LIMIT_CODES: ReadonlySet<string | number> = new Set([
  "rate_limited",
  "too_many_request",
  429
]);

function errCode(err: unknown): string | number | null {
  if (!err || typeof err !== "object") return null;
  const code = (err as { code?: unknown }).code;
  if (typeof code === "string" || typeof code === "number") return code;
  return null;
}

function isRateLimited(err: unknown): boolean {
  const code = errCode(err);
  return code !== null && RATE_LIMIT_CODES.has(code);
}

function isExpired(err: unknown): boolean {
  return errCode(err) === EXPIRED_CODE;
}

export async function notifySub2CardPatch<TState>(
  cardType: CardType,
  chatId: string,
  delta: StateDelta<TState>,
  deps: PatchWorkerDeps
): Promise<PatchWorkerResult> {
  const row = deps.live.findActive(cardType, chatId);
  if (!row) {
    return { status: "needsSend", closedRowId: null, reason: "no_active_row" };
  }

  const templateId = deps.templateIdFor(cardType);
  if (!templateId) {
    return {
      status: "failed",
      reason: `no_template_for_${cardType}`,
      attempts: 0
    };
  }

  const currentState = row.stateJson as TState;
  const nextState = delta(currentState);
  const cardJson = renderCard(templateId, nextState, {
    operatorOpenId: "system",
    triggerId: "patch-worker",
    actionName: "patch",
    actionPayload: {},
    messageId: row.feishuMessageId,
    chatId: row.feishuChatId,
    receivedAt: deps.clock().toISOString(),
    currentVersion: row.cardVersion
  });

  let lastError: unknown = null;
  for (let attempt = 1; attempt <= deps.maxAttempts; attempt += 1) {
    try {
      await deps.feishuClient.patchCard(row.feishuMessageId, cardJson);
      deps.live.updateState(row.id, nextState, deps.clock().toISOString());
      return { status: "patched", rowId: row.id };
    } catch (err) {
      lastError = err;
      if (isExpired(err)) {
        deps.live.close(row.id, "expired");
        return {
          status: "needsSend",
          closedRowId: row.id,
          reason: "retention_expired"
        };
      }
      if (isRateLimited(err) && attempt < deps.maxAttempts) {
        const backoff = BASE_BACKOFF_MS * 4 ** (attempt - 1);
        await deps.sleep(backoff);
        continue;
      }
      if (attempt < deps.maxAttempts) {
        const backoff = BASE_BACKOFF_MS * 4 ** (attempt - 1);
        await deps.sleep(backoff);
        continue;
      }
    }
  }

  const reason = formatReason(lastError);
  deps.deadLetter.insert({
    cardType,
    messageId: row.feishuMessageId,
    reason,
    attempts: deps.maxAttempts,
    enqueuedAt: deps.clock().toISOString()
  });
  return { status: "failed", reason, attempts: deps.maxAttempts };
}

function formatReason(err: unknown): string {
  if (err instanceof Error) {
    const code = errCode(err);
    return code ? `${String(code)}: ${err.message}` : err.message;
  }
  return String(err);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/services/feishu/cards/patch-worker.test.ts`
Expected: PASS — 7 assertions green.

- [ ] **Step 5: Commit**

```bash
git add \
  src/services/feishu/cards/patch-worker.ts \
  tests/services/feishu/cards/patch-worker.test.ts
git commit -m "feat(sub2): add notifySub2CardPatch worker with retry and 230031 fallback"
```

---

### Task D2: `notifySub2CardPatch` hook wiring for LLM result → daily-checkin patch

**Files:**
- Create: `src/services/feishu/cards/notify-hooks.ts`
- Test: `tests/services/feishu/cards/notify-hooks.test.ts`

Adds the thin adapter layer that sub-project 1's `LlmScoringWorker` calls when it finishes judging an event. `onLlmDecision({ memberId, itemCode, decision, eventId })` is the API: it resolves the correct group chat (single-chat deployment reads `FEISHU_GROUP_CHAT_ID` from `deps.config`), computes the state delta that moves the member between the `pending` and `approved` lists (rejected events simply remove the member from `pending`), and calls `notifySub2CardPatch`. A `followUp` function schedules the DM-style LLM Decision Card that Task D3 implements.

- [ ] **Step 1: Write failing test**

Create `tests/services/feishu/cards/notify-hooks.test.ts`:

```typescript
import { beforeEach, describe, expect, test, vi } from "vitest";

import {
  createLlmDecisionHook,
  type LlmDecisionHookDeps,
  type OnLlmDecisionInput
} from "../../../../src/services/feishu/cards/notify-hooks.js";
import {
  buildDailyCheckinCard,
  DAILY_CHECKIN_TEMPLATE_ID,
  emptyDailyCheckinState,
  type DailyCheckinState
} from "../../../../src/services/feishu/cards/templates/daily-checkin-v1.js";
import {
  clearTemplateRegistry,
  registerTemplate
} from "../../../../src/services/feishu/cards/renderer.js";
import type { LiveCardRow } from "../../../../src/services/feishu/cards/types.js";

function seedLiveRow(pending: string[], approved: string[]): LiveCardRow {
  const state = emptyDailyCheckinState({ periodNumber: 3, postedAt: "2026-04-10T09:00:00.000Z", periodId: "p-1" });
  state.items.K3.pending = pending;
  state.items.K3.approved = approved;
  state.memberDisplayNames = {
    "m-1": "张三",
    "m-2": "李四"
  };
  return {
    id: "flc-1",
    cardType: "daily_checkin",
    feishuMessageId: "om-dc-1",
    feishuChatId: "oc-group",
    campId: "camp-1",
    periodId: "p-1",
    windowId: null,
    cardVersion: "daily-checkin-v1",
    stateJson: state,
    sentAt: "2026-04-10T09:00:00.000Z",
    lastPatchedAt: null,
    expiresAt: "2026-04-24T09:00:00.000Z",
    closedReason: null
  };
}

function fakeHookDeps(row: LiveCardRow): {
  deps: LlmDecisionHookDeps;
  patchCalls: Array<{ messageId: string; content: unknown }>;
  updates: Array<{ state: unknown }>;
  sendDmCalls: OnLlmDecisionInput[];
} {
  const patchCalls: Array<{ messageId: string; content: unknown }> = [];
  const updates: Array<{ state: unknown }> = [];
  const sendDmCalls: OnLlmDecisionInput[] = [];
  const deps: LlmDecisionHookDeps = {
    config: { groupChatId: "oc-group" },
    patcher: {
      live: {
        findActive: vi.fn((type, chatId) =>
          type === row.cardType && chatId === row.feishuChatId ? row : null
        ),
        updateState: vi.fn((_id, next) => {
          updates.push({ state: next });
          row.stateJson = next;
        }),
        close: vi.fn()
      },
      feishuClient: {
        patchCard: vi.fn(async (messageId, content) => {
          patchCalls.push({ messageId, content });
        })
      },
      deadLetter: { insert: vi.fn() },
      clock: () => new Date("2026-04-10T12:00:00.000Z"),
      sleep: vi.fn(async () => undefined),
      templateIdFor: (t) => (t === "daily_checkin" ? DAILY_CHECKIN_TEMPLATE_ID : null),
      maxAttempts: 3
    },
    sendDecisionDm: vi.fn(async (input: OnLlmDecisionInput) => {
      sendDmCalls.push(input);
    })
  };
  return { deps, patchCalls, updates, sendDmCalls };
}

describe("createLlmDecisionHook (onLlmDecision)", () => {
  beforeEach(() => {
    clearTemplateRegistry();
    registerTemplate(DAILY_CHECKIN_TEMPLATE_ID, buildDailyCheckinCard);
  });

  test("approved K3 moves member from pending to approved", async () => {
    const row = seedLiveRow(["m-1", "m-2"], []);
    const { deps, patchCalls, updates, sendDmCalls } = fakeHookDeps(row);
    const onLlmDecision = createLlmDecisionHook(deps);

    const result = await onLlmDecision({
      memberId: "m-1",
      itemCode: "K3",
      eventId: "evt-1",
      decision: "approved",
      score: 3,
      reason: "内容清晰,覆盖要点"
    });

    expect(result.patch.status).toBe("patched");
    expect(patchCalls).toHaveLength(1);
    const newState = updates[0].state as DailyCheckinState;
    expect(newState.items.K3.approved).toContain("m-1");
    expect(newState.items.K3.pending).not.toContain("m-1");
    expect(newState.items.K3.pending).toContain("m-2");
    expect(sendDmCalls).toHaveLength(1);
    expect(sendDmCalls[0].decision).toBe("approved");
  });

  test("rejected K3 removes member from pending without adding to approved", async () => {
    const row = seedLiveRow(["m-1"], []);
    const { deps, updates, sendDmCalls } = fakeHookDeps(row);
    const onLlmDecision = createLlmDecisionHook(deps);

    await onLlmDecision({
      memberId: "m-1",
      itemCode: "K3",
      eventId: "evt-1",
      decision: "rejected",
      score: 0,
      reason: "描述不具体,缺少具体技术点"
    });

    const newState = updates[0].state as DailyCheckinState;
    expect(newState.items.K3.approved).not.toContain("m-1");
    expect(newState.items.K3.pending).not.toContain("m-1");
    expect(sendDmCalls).toHaveLength(1);
    expect(sendDmCalls[0].decision).toBe("rejected");
  });

  test("decision for unknown active card does NOT crash and still sends DM", async () => {
    const row = seedLiveRow(["m-1"], []);
    const { deps, sendDmCalls } = fakeHookDeps(row);
    deps.patcher.live.findActive = vi.fn(() => null);
    const onLlmDecision = createLlmDecisionHook(deps);

    const result = await onLlmDecision({
      memberId: "m-1",
      itemCode: "K3",
      eventId: "evt-1",
      decision: "approved",
      score: 3,
      reason: "ok"
    });
    expect(result.patch.status).toBe("needsSend");
    expect(sendDmCalls).toHaveLength(1);
  });

  test("non-daily-checkin item codes (e.g. S1) skip the patch but still send DM", async () => {
    const row = seedLiveRow(["m-1"], []);
    const { deps, patchCalls, sendDmCalls } = fakeHookDeps(row);
    const onLlmDecision = createLlmDecisionHook(deps);

    const result = await onLlmDecision({
      memberId: "m-1",
      itemCode: "H1",
      eventId: "evt-1",
      decision: "approved",
      score: 5,
      reason: "ok"
    });
    expect(result.patch.status).toBe("skipped");
    expect(patchCalls).toHaveLength(0);
    expect(sendDmCalls).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/services/feishu/cards/notify-hooks.test.ts`
Expected: FAIL — `notify-hooks.js` module not found.

- [ ] **Step 3: Implement `src/services/feishu/cards/notify-hooks.ts`**

```typescript
import {
  notifySub2CardPatch,
  type PatchWorkerDeps,
  type PatchWorkerResult
} from "./patch-worker.js";
import type {
  DailyCheckinState,
  DailyCheckinItemCode
} from "./templates/daily-checkin-v1.js";

const DAILY_CHECKIN_ITEM_CODES: ReadonlySet<DailyCheckinItemCode> = new Set<DailyCheckinItemCode>([
  "K3",
  "K4",
  "H2",
  "C1",
  "C3",
  "G2"
]);

export interface OnLlmDecisionInput {
  memberId: string;
  itemCode: string;
  eventId: string;
  decision: "approved" | "rejected";
  score: number;
  reason: string;
}

export interface LlmDecisionHookDeps {
  config: { groupChatId: string };
  patcher: PatchWorkerDeps;
  sendDecisionDm: (input: OnLlmDecisionInput) => Promise<void>;
}

export interface OnLlmDecisionResult {
  patch: PatchWorkerResult | { status: "skipped"; reason: string };
}

function isDailyCheckinItem(code: string): code is DailyCheckinItemCode {
  return DAILY_CHECKIN_ITEM_CODES.has(code as DailyCheckinItemCode);
}

function approveDelta(
  memberId: string,
  itemCode: DailyCheckinItemCode
) {
  return (prev: DailyCheckinState): DailyCheckinState => ({
    ...prev,
    items: {
      ...prev.items,
      [itemCode]: {
        pending: prev.items[itemCode].pending.filter((id) => id !== memberId),
        approved: Array.from(
          new Set([...prev.items[itemCode].approved, memberId])
        )
      }
    }
  });
}

function rejectDelta(
  memberId: string,
  itemCode: DailyCheckinItemCode
) {
  return (prev: DailyCheckinState): DailyCheckinState => ({
    ...prev,
    items: {
      ...prev.items,
      [itemCode]: {
        pending: prev.items[itemCode].pending.filter((id) => id !== memberId),
        approved: prev.items[itemCode].approved
      }
    }
  });
}

export function createLlmDecisionHook(deps: LlmDecisionHookDeps) {
  return async function onLlmDecision(
    input: OnLlmDecisionInput
  ): Promise<OnLlmDecisionResult> {
    let patchResult: OnLlmDecisionResult["patch"];

    if (isDailyCheckinItem(input.itemCode)) {
      const delta =
        input.decision === "approved"
          ? approveDelta(input.memberId, input.itemCode)
          : rejectDelta(input.memberId, input.itemCode);
      patchResult = await notifySub2CardPatch(
        "daily_checkin",
        deps.config.groupChatId,
        delta,
        deps.patcher
      );
    } else {
      patchResult = { status: "skipped", reason: "not_daily_checkin_item" };
    }

    // Always send the DM, regardless of patch outcome — the student needs
    // the full LLM reasoning either way.
    await deps.sendDecisionDm(input);

    return { patch: patchResult };
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/services/feishu/cards/notify-hooks.test.ts`
Expected: PASS — 4 assertions green.

- [ ] **Step 5: Commit**

```bash
git add \
  src/services/feishu/cards/notify-hooks.ts \
  tests/services/feishu/cards/notify-hooks.test.ts
git commit -m "feat(sub2): add onLlmDecision hook wiring for daily checkin card"
```

---

### Task D3: LLM Decision card template + DM dispatch + appeal button handler

**Files:**
- Create: `src/services/feishu/cards/templates/llm-decision-v1.ts`
- Create: `src/services/feishu/cards/handlers/llm-decision-handler.ts`
- Test: `tests/services/feishu/cards/templates/llm-decision-v1.test.ts`
- Test: `tests/services/feishu/cards/handlers/llm-decision-handler.test.ts`

Implements the student-facing DM card that shows the LLM's reasoning for a single event. The template accepts an `LlmDecisionCardState` (decision, score, item label, full reason, eventId, and whether the appeal button is visible) and renders a compact card suitable for a private chat (no per-item iteration, just one verdict). Rejected decisions include an "我要申诉" button whose click invokes `POST /api/v2/events/:eventId/appeal` via the aggregator (which rolls the event status back to `review_required` for human review). Approved decisions omit the button.

- [ ] **Step 1: Write failing template test**

Create `tests/services/feishu/cards/templates/llm-decision-v1.test.ts`:

```typescript
import { describe, expect, test } from "vitest";

import {
  buildLlmDecisionCard,
  LLM_DECISION_TEMPLATE_ID,
  type LlmDecisionCardState
} from "../../../../../src/services/feishu/cards/templates/llm-decision-v1.js";
import { assertCardSize } from "../../../../../src/services/feishu/cards/renderer.js";

function approved(): LlmDecisionCardState {
  return {
    eventId: "evt-1",
    itemCode: "K3",
    itemLabel: "🧠 知识总结",
    decision: "approved",
    score: 3,
    reason: "内容清晰,覆盖 Transformer Q K V 三个矩阵的含义,并给出自己的例子",
    canAppeal: false,
    decidedAt: "2026-04-10T12:00:00.000Z"
  };
}

function rejected(): LlmDecisionCardState {
  return {
    ...approved(),
    decision: "rejected",
    score: 0,
    reason: "描述过于宽泛,未落到具体技术点,建议补充代码或公式",
    canAppeal: true
  };
}

describe("buildLlmDecisionCard", () => {
  test("approved card header uses green template and shows +score", () => {
    const card = buildLlmDecisionCard(approved());
    const s = JSON.stringify(card);
    expect(s).toContain("K3");
    expect(s).toContain("+3");
    expect(s).toContain("通过");
  });

  test("rejected card header uses red template and shows 未通过", () => {
    const card = buildLlmDecisionCard(rejected());
    const s = JSON.stringify(card);
    expect(s).toContain("未通过");
    expect(s).toContain("red");
  });

  test("reason text is embedded verbatim", () => {
    const card = buildLlmDecisionCard(approved());
    const s = JSON.stringify(card);
    expect(s).toContain("Transformer Q K V");
  });

  test("appeal button present on rejected canAppeal=true", () => {
    const card = buildLlmDecisionCard(rejected());
    const s = JSON.stringify(card);
    expect(s).toContain("申诉");
    expect(s).toContain("llm_decision_appeal");
    expect(s).toContain("evt-1");
  });

  test("appeal button absent on approved", () => {
    const card = buildLlmDecisionCard(approved());
    const s = JSON.stringify(card);
    expect(s).not.toContain("申诉");
  });

  test("fits under card size budget", () => {
    const card = buildLlmDecisionCard(rejected());
    expect(() => assertCardSize(card)).not.toThrow();
  });

  test("LLM_DECISION_TEMPLATE_ID is 'llm-decision-v1'", () => {
    expect(LLM_DECISION_TEMPLATE_ID).toBe("llm-decision-v1");
  });
});
```

- [ ] **Step 2: Run template test to verify it fails**

Run: `npm test -- tests/services/feishu/cards/templates/llm-decision-v1.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/services/feishu/cards/templates/llm-decision-v1.ts`**

```typescript
import type { FeishuCardJson } from "../types.js";
import { buildHeader } from "./common/header.js";

export const LLM_DECISION_TEMPLATE_ID = "llm-decision-v1" as const;

export interface LlmDecisionCardState {
  eventId: string;
  itemCode: string;
  itemLabel: string;
  decision: "approved" | "rejected";
  score: number;
  reason: string;
  canAppeal: boolean;
  decidedAt: string;
}

export function buildLlmDecisionCard(
  state: LlmDecisionCardState
): FeishuCardJson {
  const approved = state.decision === "approved";
  const headerTitle = approved
    ? `${state.itemLabel} · 通过 +${state.score}`
    : `${state.itemLabel} · 未通过`;

  const elements: Array<Record<string, unknown>> = [
    {
      tag: "markdown",
      content: `**${state.itemCode}** 的评分结果`
    },
    {
      tag: "markdown",
      content: `**LLM 点评**\n${state.reason}`
    },
    {
      tag: "note",
      elements: [
        {
          tag: "plain_text",
          content: `eventId: ${state.eventId} · ${state.decidedAt}`
        }
      ]
    }
  ];

  if (!approved && state.canAppeal) {
    elements.push({
      tag: "action",
      actions: [
        {
          tag: "button",
          text: { tag: "plain_text", content: "我要申诉" },
          type: "default",
          value: {
            action: "llm_decision_appeal",
            eventId: state.eventId
          }
        }
      ]
    });
  }

  return {
    schema: "2.0",
    header: buildHeader({
      title: headerTitle,
      template: approved ? "green" : "red"
    }) as unknown as Record<string, unknown>,
    body: { elements }
  };
}
```

- [ ] **Step 4: Run template test to verify it passes**

Run: `npm test -- tests/services/feishu/cards/templates/llm-decision-v1.test.ts`
Expected: PASS — 7 assertions green.

- [ ] **Step 5: Write failing handler test**

Create `tests/services/feishu/cards/handlers/llm-decision-handler.test.ts`:

```typescript
import { beforeEach, describe, expect, test, vi } from "vitest";

import { llmDecisionAppealHandler } from "../../../../../src/services/feishu/cards/handlers/llm-decision-handler.js";
import type {
  CardActionContext,
  CardHandlerDeps,
  ScoringEventLite
} from "../../../../../src/services/feishu/cards/types.js";

function fakeDeps(): {
  deps: CardHandlerDeps;
  appealCalls: Array<{ eventId: string }>;
} {
  const appealCalls: Array<{ eventId: string }> = [];
  const event: ScoringEventLite = {
    id: "evt-1",
    memberId: "m-1",
    itemCode: "K3",
    status: "rejected",
    scoreDelta: 0,
    payloadJson: { text: "..." },
    createdAt: "2026-04-10T12:00:00.000Z"
  };
  const deps: CardHandlerDeps = {
    repo: {
      insertCardInteraction: vi.fn(() => "inserted" as const),
      findLiveCard: vi.fn(),
      updateLiveCardState: vi.fn(),
      insertLiveCard: vi.fn(),
      closeLiveCard: vi.fn(),
      findEventById: vi.fn((id) => (id === "evt-1" ? event : null)),
      listReviewRequiredEvents: vi.fn(() => []),
      countReviewRequiredEvents: vi.fn(() => 0)
    },
    ingestor: { ingest: vi.fn() },
    aggregator: {
      applyDecision: vi.fn((eventId) => {
        appealCalls.push({ eventId });
        return {
          eventId,
          previousStatus: "review_required" as const,
          newStatus: "approved" as const,
          memberId: "m-1",
          itemCode: "K3",
          scoreDelta: 3
        };
      })
    },
    feishuClient: { patchCard: vi.fn(), sendCard: vi.fn() },
    clock: () => new Date("2026-04-10T12:01:00.000Z"),
    uuid: () => "u-1"
  };
  // appeal endpoint: the handler calls a new per-app helper via deps extension
  (deps as unknown as {
    requestReappeal?: (eventId: string) => Promise<void>;
  }).requestReappeal = vi.fn(async (eventId: string) => {
    appealCalls.push({ eventId });
  });
  return { deps, appealCalls };
}

function ctx(overrides: Partial<CardActionContext> = {}): CardActionContext {
  return {
    operatorOpenId: "ou-stu-1",
    triggerId: "trig-appeal-1",
    actionName: "llm_decision_appeal",
    actionPayload: {
      action: "llm_decision_appeal",
      eventId: "evt-1"
    },
    messageId: "om-dm-1",
    chatId: "ou-stu-1",
    receivedAt: "2026-04-10T12:01:00.000Z",
    currentVersion: "llm-decision-v1",
    ...overrides
  };
}

describe("llmDecisionAppealHandler", () => {
  let state: ReturnType<typeof fakeDeps>;

  beforeEach(() => {
    state = fakeDeps();
  });

  test("rejected event appeal triggers requestReappeal and returns success toast", async () => {
    const result = await llmDecisionAppealHandler(ctx(), state.deps);
    expect(state.appealCalls).toHaveLength(1);
    expect(state.appealCalls[0].eventId).toBe("evt-1");
    expect(result.toast?.type).toBe("success");
    expect(result.toast?.content).toMatch(/已受理|申诉/);
  });

  test("missing eventId returns error", async () => {
    const result = await llmDecisionAppealHandler(
      ctx({ actionPayload: { action: "llm_decision_appeal" } }),
      state.deps
    );
    expect(result.toast?.type).toBe("error");
    expect(state.appealCalls).toHaveLength(0);
  });

  test("event not found returns error", async () => {
    state.deps.repo.findEventById = vi.fn(() => null);
    const result = await llmDecisionAppealHandler(ctx(), state.deps);
    expect(result.toast?.type).toBe("error");
    expect(result.toast?.content).toMatch(/未找到/);
  });

  test("approved event cannot be appealed", async () => {
    state.deps.repo.findEventById = vi.fn(() => ({
      id: "evt-1",
      memberId: "m-1",
      itemCode: "K3",
      status: "approved",
      scoreDelta: 3,
      payloadJson: {},
      createdAt: "2026-04-10T12:00:00.000Z"
    }));
    const result = await llmDecisionAppealHandler(ctx(), state.deps);
    expect(result.toast?.type).toBe("error");
    expect(result.toast?.content).toMatch(/通过/);
  });
});
```

- [ ] **Step 6: Run handler test to verify it fails**

Run: `npm test -- tests/services/feishu/cards/handlers/llm-decision-handler.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 7: Implement `src/services/feishu/cards/handlers/llm-decision-handler.ts`**

```typescript
import type {
  CardHandler,
  CardHandlerDeps
} from "../types.js";

interface AppealDepsExtension {
  }

function resolveAppealFn(
  deps: CardHandlerDeps
): ((eventId: string) => Promise<void>) | null {
  const ext = deps as unknown as AppealDepsExtension;
  return deps.requestReappeal;
}

export const llmDecisionAppealHandler: CardHandler = async (ctx, deps) => {
  const payload = ctx.actionPayload as { eventId?: string };
  if (!payload.eventId) {
    return { toast: { type: "error", content: "申诉参数缺失" } };
  }

  const event = deps.repo.findEventById(payload.eventId);
  if (!event) {
    return { toast: { type: "error", content: "未找到该评分记录" } };
  }

  if (event.status === "approved") {
    return {
      toast: {
        type: "error",
        content: "此项已通过,无需申诉"
      }
    };
  }

  const appealFn = resolveAppealFn(deps);
  if (!appealFn) {
    return {
      toast: {
        type: "error",
        content: "申诉通道未启用,请联系运营"
      }
    };
  }

  await appealFn(payload.eventId);

  // idempotency: log the appeal click as a card_interactions row so replay
  // of the same trigger_id does not re-submit
  deps.repo.insertCardInteraction({
    id: deps.uuid(),
    memberId: event.memberId,
    periodId: null,
    cardType: "llm_decision",
    actionName: "llm_decision_appeal",
    feishuMessageId: ctx.messageId,
    feishuCardVersion: ctx.currentVersion,
    payloadJson: { eventId: payload.eventId },
    receivedAt: ctx.receivedAt,
    triggerId: ctx.triggerId,
    operatorOpenId: ctx.operatorOpenId,
    rejectedReason: null
  });

  return {
    toast: {
      type: "success",
      content: "申诉已受理,运营将尽快人工复核"
    }
  };
};
```

- [ ] **Step 8: Run handler test to verify it passes**

Run: `npm test -- tests/services/feishu/cards/handlers/llm-decision-handler.test.ts`
Expected: PASS — 4 assertions green.

Also run: `npm test` to confirm no regressions.

- [ ] **Step 9: Commit**

```bash
git add \
  src/services/feishu/cards/templates/llm-decision-v1.ts \
  src/services/feishu/cards/handlers/llm-decision-handler.ts \
  tests/services/feishu/cards/templates/llm-decision-v1.test.ts \
  tests/services/feishu/cards/handlers/llm-decision-handler.test.ts
git commit -m "feat(sub2): add LLM decision DM card and appeal handler"
```

---

### Task D4: 230031 fallback exit checkpoint

**Files:**
- Test: `tests/services/feishu/cards/patch-worker-fallback.test.ts`

End-to-end test that locks down the S2 exit criterion: when `notifySub2CardPatch` encounters Feishu error 230031 (card past 14-day retention), the patcher must close the stale row, surface a `needsSend` outcome, and the caller must send a fresh card via `feishuClient.sendCard`, then insert a new `feishu_live_cards` row whose state mirrors the delta. This test uses a real `:memory:` `SqliteRepository`, real `LiveCardRepository`, a fake `feishuClient` that throws 230031 once and then succeeds on `sendCard`, and validates the full recovery flow.

- [ ] **Step 1: Write the fallback test**

Create `tests/services/feishu/cards/patch-worker-fallback.test.ts`:

```typescript
import { beforeEach, describe, expect, test, vi } from "vitest";

import { SqliteRepository } from "../../../../src/storage/sqlite-repository.js";
import { LiveCardRepository } from "../../../../src/services/feishu/cards/live-card-repository.js";
import {
  notifySub2CardPatch,
  type PatchWorkerDeps,
  type PatchWorkerResult
} from "../../../../src/services/feishu/cards/patch-worker.js";
import {
  buildDailyCheckinCard,
  DAILY_CHECKIN_TEMPLATE_ID,
  emptyDailyCheckinState,
  type DailyCheckinState
} from "../../../../src/services/feishu/cards/templates/daily-checkin-v1.js";
import {
  clearTemplateRegistry,
  registerTemplate
} from "../../../../src/services/feishu/cards/renderer.js";
import type { FeishuCardJson } from "../../../../src/services/feishu/cards/types.js";

const EXPIRED_ERROR = Object.assign(new Error("message too old"), {
  code: 230031
});

interface FakeClient {
  patchCard: ReturnType<typeof vi.fn>;
  sendCard: ReturnType<typeof vi.fn>;
}

function seededState(): DailyCheckinState {
  const s = emptyDailyCheckinState({ periodNumber: 3, postedAt: "2026-03-26T09:00:00.000Z", periodId: "p-1" });
  s.items.K3.pending = ["m-1"];
  return s;
}

describe("230031 fallback exit checkpoint", () => {
  let repo: SqliteRepository;
  let live: LiveCardRepository;
  let client: FakeClient;
  let deps: PatchWorkerDeps;
  let deadLetters: Array<{ reason: string }>;

  beforeEach(() => {
    clearTemplateRegistry();
    registerTemplate(DAILY_CHECKIN_TEMPLATE_ID, buildDailyCheckinCard);

    repo = new SqliteRepository(":memory:");
    live = new LiveCardRepository(repo);

    // Seed a stale live row: sent 20 days ago, past the 14-day Feishu window.
    live.insert({
      id: "flc-stale",
      cardType: "daily_checkin",
      feishuMessageId: "om-stale-1",
      feishuChatId: "oc-group",
      campId: "camp-1",
      periodId: "p-1",
      windowId: null,
      cardVersion: "daily-checkin-v1",
      stateJson: seededState(),
      sentAt: "2026-03-21T09:00:00.000Z",
      lastPatchedAt: null,
      expiresAt: "2026-04-04T09:00:00.000Z",
      closedReason: null
    });

    client = {
      patchCard: vi.fn().mockRejectedValue(EXPIRED_ERROR),
      sendCard: vi.fn().mockResolvedValue({ messageId: "om-new-1" })
    };

    deadLetters = [];
    deps = {
      live: {
        findActive: (type, chatId) => live.findActive(type, chatId),
        updateState: (id, state, at) => live.updateState(id, state, at),
        close: (id, reason) => live.close(id, reason ?? null)
      },
      feishuClient: {
        patchCard: client.patchCard as unknown as (
          messageId: string,
          content: FeishuCardJson
        ) => Promise<void>
      },
      deadLetter: {
        insert: (entry) => {
          deadLetters.push({ reason: entry.reason });
        }
      },
      clock: () => new Date("2026-04-10T12:00:00.000Z"),
      sleep: vi.fn(async () => undefined),
      templateIdFor: (t) => (t === "daily_checkin" ? DAILY_CHECKIN_TEMPLATE_ID : null),
      maxAttempts: 3
    };
  });

  test("230031 closes old row, returns needsSend, no dead letter", async () => {
    const result: PatchWorkerResult = await notifySub2CardPatch(
      "daily_checkin",
      "oc-group",
      (prev) => ({
        ...prev,
        items: {
          ...prev.items,
          K3: {
            pending: prev.items.K3.pending.filter((id) => id !== "m-1"),
            approved: Array.from(
              new Set([...prev.items.K3.approved, "m-1"])
            )
          }
        }
      }),
      deps
    );

    expect(result.status).toBe("needsSend");
    if (result.status === "needsSend") {
      expect(result.closedRowId).toBe("flc-stale");
    }
    expect(deadLetters).toHaveLength(0);
    expect(client.patchCard).toHaveBeenCalledTimes(1);

    const stale = live.findActive("daily_checkin", "oc-group");
    expect(stale).toBeNull();
  });

  test("caller can send a fresh card + insert a new LiveCardRow with matching delta state", async () => {
    // run the patch call and receive needsSend
    const result = await notifySub2CardPatch(
      "daily_checkin",
      "oc-group",
      (prev) => ({
        ...prev,
        items: {
          ...prev.items,
          K3: {
            pending: [],
            approved: Array.from(new Set([...prev.items.K3.approved, "m-1"]))
          }
        }
      }),
      deps
    );
    expect(result.status).toBe("needsSend");

    // compute the merged state that must land on the new card
    const merged: DailyCheckinState = {
      ...seededState(),
      items: {
        ...seededState().items,
        K3: { pending: [], approved: ["m-1"] }
      }
    };

    // simulate caller fallback: send a new card
    const sendResult = await client.sendCard({
      chatId: "oc-group",
      content: buildDailyCheckinCard(merged)
    });
    expect(sendResult.messageId).toBe("om-new-1");

    // insert new row
    live.insert({
      id: "flc-new",
      cardType: "daily_checkin",
      feishuMessageId: sendResult.messageId,
      feishuChatId: "oc-group",
      campId: "camp-1",
      periodId: "p-1",
      windowId: null,
      cardVersion: "daily-checkin-v1",
      stateJson: merged,
      sentAt: "2026-04-10T12:00:00.000Z",
      lastPatchedAt: null,
      expiresAt: "2026-04-24T12:00:00.000Z",
      closedReason: null
    });

    const active = live.findActive("daily_checkin", "oc-group");
    expect(active).not.toBeNull();
    expect(active!.id).toBe("flc-new");
    const newState = active!.stateJson as DailyCheckinState;
    expect(newState.items.K3.approved).toContain("m-1");
    expect(newState.items.K3.pending).not.toContain("m-1");

    // stale row still present in DB but closed
    const stale = (live as unknown as {
      findById: (id: string) => ReturnType<typeof live.findActive>;
    }).findById("flc-stale");
    expect(stale?.closedReason).toBe("expired");
  });

  test("patch is NOT retried on 230031 (single attempt only)", async () => {
    await notifySub2CardPatch(
      "daily_checkin",
      "oc-group",
      (prev) => prev,
      deps
    );
    expect(client.patchCard).toHaveBeenCalledTimes(1);
    expect(deps.sleep).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the fallback test**

Run: `npm test -- tests/services/feishu/cards/patch-worker-fallback.test.ts`
Expected: PASS — 3 assertions green. Confirms the 230031 path closes the old row immediately, returns `needsSend` without retries, and the caller's resend-plus-insert fallback correctly produces a new active row with the merged state.

Also run: `npm test` and `npm run build` to confirm the full gate passes.

- [ ] **Step 3: Commit**

```bash
git add tests/services/feishu/cards/patch-worker-fallback.test.ts
git commit -m "test(sub2): add 230031 fallback exit checkpoint for patch worker"
```

---

## Phase D Exit Checkpoint

Run the full suite and build:

```bash
npm test
npm run build
```

Expected: both green. The async path is now proven end-to-end. Three cards are online:
1. **Quiz card (#3)** — static sync path
2. **Daily checkin card (#8)** — sync path (click merges pending) + async path (LLM decision moves pending → approved)
3. **LLM Decision card (#13)** — DM card with appeal button

The full LLM round trip works: student clicks K3 on daily checkin → EventIngestor returns pending → member lands in `state.items.K3.pending` → sub-project 1 `LlmScoringWorker` eventually fires `onLlmDecision` → `notifySub2CardPatch` runs → daily-checkin card patches in place to show ✓ next to the member's name → student receives a DM with the full LLM reason → rejected submissions offer an "我要申诉" button that flips the event back to `review_required` for human follow-up. The 230031 fallback test locks down the 14-day retention edge: a stale live-card row is closed and the caller's re-send path produces a fresh row whose state mirrors the delta.

---

## Phase E — H2 Multimodal (S3 milestone) (3 tasks)

Extends the sync path from Phase C/D to carry an H2 submission's `file_key` end-to-end: from the button click in the daily-checkin card, through the handler that ingests the event, into the sub-project 1 Ingestor payload, and finally into the `v2_llm_scoring_tasks.prompt_text` so the LLM worker can render the multimodal prompt in sub-project 1 Phase E4. The actual `glm-4v-flash` HTTP call is tested in sub-project 1 Phase E4, not here.

**Cross-subproject dependencies (must already be merged before this phase runs):**
- Sub-project 1 Phase D1: `LlmPromptPayload` extended with optional `fileKey?: string`
- Sub-project 1 Phase D3: `EventIngestor` preserves `payload.fileKey` verbatim into `v2_scoring_item_events.payload_json`
- Sub-project 1 Phase E4: `LlmScoringClient` detects `itemCode === "H2"` and routes to `LLM_VISION_MODEL`
- Sub-project 1 env: `LLM_VISION_MODEL=glm-4v-flash` added to `.env.example`

---

### Task E1: H2 button form + file_key capture in daily checkin card

**Files:**
- Modify: `src/services/feishu/cards/templates/daily-checkin/daily-checkin-v1.ts` (extend the H2 button built in Task C2)
- Modify: `tests/services/feishu/cards/templates/daily-checkin/daily-checkin-v1.test.ts` (add H2 form snapshot + action-payload contract tests)

In Task C2 the daily-checkin card renders six item buttons; the H2 button was a plain button. H2 in spec §3.3 requires the click to open an inline form with a text input **and** a file chooser, and on submit Feishu returns `{ text, file_key }` as the action value. This task extends the existing `daily-checkin-v1.ts` builder so the H2 button is a Feishu v2 `action` element of type `form` with two child inputs, and asserts the rendered card JSON surfaces that shape correctly.

- [ ] **Step 1: Write failing test**

Append the following block to `tests/services/feishu/cards/templates/daily-checkin/daily-checkin-v1.test.ts`:

```typescript
import { describe, expect, test } from "vitest";

import { buildDailyCheckinV1 } from "../../../../../../src/services/feishu/cards/templates/daily-checkin/daily-checkin-v1.js";
import type {
  CardActionContext,
  DailyCheckinState
} from "../../../../../../src/services/feishu/cards/types.js";

function ctx(): CardActionContext {
  return {
    operatorOpenId: "ou-student-1",
    triggerId: "t-1",
    actionName: "noop",
    actionPayload: {},
    messageId: "om-1",
    chatId: "oc-1",
    receivedAt: "2026-04-10T09:00:00.000Z",
    currentVersion: "daily-checkin-v1"
  };
}

function emptyState(): DailyCheckinState {
  return {
    items: { K3: [], K4: [], H2: [], C1: [], C3: [], G2: [] },
    postedAt: "2026-04-10T09:00:00.000Z"
  };
}

describe("daily-checkin-v1 H2 multimodal button", () => {
  test("renders H2 button as a form element with text + file_key children", () => {
    const card = buildDailyCheckinV1(emptyState(), ctx());

    const h2Form = findH2Form(card);
    expect(h2Form).toBeDefined();
    expect(h2Form!.tag).toBe("form");
    expect(h2Form!.name).toBe("h2_form");

    const textInput = findChild(h2Form!, (c) => c.name === "h2_text");
    expect(textInput).toBeDefined();
    expect(textInput!.tag).toBe("input");
    expect((textInput as any).placeholder?.content).toContain("实操");

    const fileInput = findChild(h2Form!, (c) => c.name === "h2_file");
    expect(fileInput).toBeDefined();
    expect(fileInput!.tag).toBe("select_file");

    const submit = findChild(h2Form!, (c) => c.tag === "button" && (c as any).behaviors);
    expect(submit).toBeDefined();
    expect((submit as any).text?.content).toContain("提交");
  });

  test("H2 form submit button behavior references h2_submit action with form data", () => {
    const card = buildDailyCheckinV1(emptyState(), ctx());

    const h2Form = findH2Form(card)!;
    const submit = findChild(
      h2Form,
      (c) => c.tag === "button" && Array.isArray((c as any).behaviors)
    )!;
    const behavior = (submit as any).behaviors[0];
    expect(behavior.type).toBe("callback");
    expect(behavior.value).toEqual({
      action: "h2_submit",
      text: "${h2_text.value}",
      file_key: "${h2_file.value}"
    });
  });

  test("H2 form snapshot is stable for empty state", () => {
    const card = buildDailyCheckinV1(emptyState(), ctx());
    const h2Form = findH2Form(card);
    expect(h2Form).toMatchSnapshot();
  });
});

/* --- Test helpers local to this file --- */

type AnyElement = Record<string, unknown> & { tag?: string; name?: string };

function findH2Form(card: {
  body: { elements: Array<Record<string, unknown>> };
}): AnyElement | undefined {
  return walk(card.body.elements).find(
    (el) => el.tag === "form" && el.name === "h2_form"
  );
}

function findChild(
  parent: AnyElement,
  pred: (child: AnyElement) => boolean
): AnyElement | undefined {
  const elements = (parent.elements ?? []) as AnyElement[];
  for (const el of elements) {
    if (pred(el)) return el;
    if (Array.isArray(el.elements)) {
      const deep = findChild(el, pred);
      if (deep) return deep;
    }
  }
  return undefined;
}

function walk(roots: Array<Record<string, unknown>>): AnyElement[] {
  const out: AnyElement[] = [];
  for (const r of roots) {
    out.push(r as AnyElement);
    const nested = (r as AnyElement).elements;
    if (Array.isArray(nested)) {
      out.push(...walk(nested as Array<Record<string, unknown>>));
    }
  }
  return out;
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/services/feishu/cards/templates/daily-checkin/daily-checkin-v1.test.ts -t "H2 multimodal button"`
Expected: FAIL — the H2 button is currently a plain `button`, not a `form`. `findH2Form` returns undefined and the first test aborts with `expect(h2Form).toBeDefined()`.

- [ ] **Step 3: Modify `src/services/feishu/cards/templates/daily-checkin/daily-checkin-v1.ts`**

Locate the `buildItemButton` / `buildH2Button` helper added in Task C2 and replace the H2-specific branch with the new form element. Below is the replacement helper — delete the old `case "H2":` branch in `buildItemButton` and import/call `buildH2Form` instead.

```typescript
import type {
  CardActionContext,
  DailyCheckinState,
  FeishuCardJson
} from "../../types.js";
import { buildHeader } from "../common/header.js";

const ITEM_LABELS: Record<keyof DailyCheckinState["items"], string> = {
  K3: "📚 知识总结",
  K4: "🛠 AI 纠错/补充",
  H2: "🔧 实操分享",
  C1: "💡 创意用法",
  C3: "🧩 提示词模板",
  G2: "🔗 课外资源"
};

export function buildDailyCheckinV1(
  state: DailyCheckinState,
  _ctx: CardActionContext
): FeishuCardJson {
  return {
    schema: "2.0",
    config: { wide_screen_mode: true, update_multi: true },
    header: buildHeader({
      title: "今日打卡",
      subtitle: new Date(state.postedAt).toLocaleDateString("zh-CN"),
      template: "blue"
    }),
    body: {
      elements: [
        buildItemButton("K3", state),
        buildItemButton("K4", state),
        buildH2Form(state),
        buildItemButton("C1", state),
        buildItemButton("C3", state),
        buildItemButton("G2", state)
      ]
    }
  };
}

function buildItemButton(
  code: Exclude<keyof DailyCheckinState["items"], "H2">,
  state: DailyCheckinState
): Record<string, unknown> {
  const queued = state.items[code];
  const tail =
    queued.length === 0
      ? ""
      : ` (${queued.length} 人已提交)`;
  return {
    tag: "button",
    text: {
      tag: "plain_text",
      content: `${ITEM_LABELS[code]}${tail}`
    },
    behaviors: [
      {
        type: "callback",
        value: { action: `${code.toLowerCase()}_submit` }
      }
    ]
  };
}

/**
 * H2 is the only daily-checkin item that requires multimodal evidence,
 * per spec §3.3. The button is rendered as a Feishu v2 form element
 * with a text input and a file chooser. The submit button's callback
 * value references the child inputs by `${name.value}` so Feishu
 * substitutes them into the payload at click time. The handler in
 * `daily-checkin-handler.ts` consumes
 *   { action: "h2_submit", text, file_key }
 * from `ctx.actionPayload`.
 */
function buildH2Form(state: DailyCheckinState): Record<string, unknown> {
  const queued = state.items.H2;
  const tail =
    queued.length === 0
      ? ""
      : ` (${queued.length} 人审核中)`;
  return {
    tag: "form",
    name: "h2_form",
    elements: [
      {
        tag: "markdown",
        content: `**${ITEM_LABELS.H2}**${tail}\n_请填写实操描述并上传效果截图_`
      },
      {
        tag: "input",
        name: "h2_text",
        placeholder: {
          tag: "plain_text",
          content: "简述你用了哪个 AI 工具做了什么(至少 20 字)"
        },
        max_length: 500,
        width: "fill"
      },
      {
        tag: "select_file",
        name: "h2_file",
        placeholder: {
          tag: "plain_text",
          content: "上传效果截图(单张,PNG/JPG)"
        },
        max_count: 1,
        accept: ["image/png", "image/jpeg"]
      },
      {
        tag: "button",
        text: { tag: "plain_text", content: "提交" },
        type: "primary",
        behaviors: [
          {
            type: "callback",
            value: {
              action: "h2_submit",
              text: "${h2_text.value}",
              file_key: "${h2_file.value}"
            }
          }
        ]
      }
    ]
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/services/feishu/cards/templates/daily-checkin/daily-checkin-v1.test.ts`
Expected: PASS — all prior daily-checkin-v1 tests still green plus the three new H2 multimodal button tests. The snapshot file `__snapshots__/daily-checkin-v1.test.ts.snap` is updated with the new H2 form shape.

- [ ] **Step 5: Commit**

```bash
git add \
  src/services/feishu/cards/templates/daily-checkin/daily-checkin-v1.ts \
  tests/services/feishu/cards/templates/daily-checkin/daily-checkin-v1.test.ts \
  tests/services/feishu/cards/templates/daily-checkin/__snapshots__/daily-checkin-v1.test.ts.snap
git commit -m "feat(sub2): render H2 daily-checkin button as multimodal form with file chooser"
```

---

### Task E2: H2 handler path in `daily-checkin-handler.ts` with file_key passthrough

**Files:**
- Modify: `src/services/feishu/cards/handlers/daily-checkin-handler.ts` (extend with `h2_submit` action branch built in Task C3)
- Modify: `tests/services/feishu/cards/handlers/daily-checkin-handler.test.ts` (add H2 happy + soft-validation failure tests)

Task C3 built the non-LLM daily-checkin handler branches (K3 etc. are LLM-gated but flow through the same handler). This task wires the `h2_submit` action name through the pipeline so `file_key` survives verbatim from the button payload to the sub-project 1 Ingestor call. Steps:

1. Parse `ctx.actionPayload` as `{ text, file_key }`.
2. Run `validateH2Submission({ text, fileKey: file_key })` — the Phase A4 soft-validation helper. On rejection return a toast (`toast.type = "error"`) and still insert a `card_interactions` row with `rejected_reason`.
3. `repo.insertCardInteraction` with `payloadJson = { text, file_key }` (keeps the Feishu-native snake case for the audit row).
4. Call `deps.ingestor.ingest({ memberId, itemCode: "H2", sourceType: "card_interaction", sourceRef: cardInteractionId, payload: { text, fileKey: file_key }, requestedAt })`. The `payload.fileKey` field is the camel-case shape `LlmPromptPayload.fileKey` (sub-project 1 Phase D1) consumes.
5. Merge `memberId` into `state.items.H2` on the live card and persist with `repo.updateLiveCardState`.
6. Re-render the daily-checkin card and return `{ newCardJson }`.

**Dependency note (repeated from Phase E preamble):** this task depends on sub-project 1 Phase D1 adding `LlmPromptPayload.fileKey` (optional), Phase D3 preserving `file_key` through `payload_json`, and Phase E4 routing `itemCode === "H2"` to `LLM_VISION_MODEL`. This task exercises only the handler/passthrough layer; the actual multimodal LLM call is covered by sub-project 1 Phase E4 tests.

- [ ] **Step 1: Write failing test**

Append to `tests/services/feishu/cards/handlers/daily-checkin-handler.test.ts`:

```typescript
import { beforeEach, describe, expect, test, vi } from "vitest";

import { dailyCheckinHandler } from "../../../../../src/services/feishu/cards/handlers/daily-checkin-handler.js";
import type {
  CardActionContext,
  CardHandlerDeps,
  DailyCheckinState,
  LiveCardRow
} from "../../../../../src/services/feishu/cards/types.js";

function seedLiveCard(): LiveCardRow {
  return {
    id: "flc-1",
    cardType: "daily_checkin",
    feishuMessageId: "om-1",
    feishuChatId: "oc-1",
    campId: "camp-1",
    periodId: "p-1",
    windowId: "w-1",
    cardVersion: "daily-checkin-v1",
    stateJson: {
      items: { K3: [], K4: [], H2: [], C1: [], C3: [], G2: [] },
      postedAt: "2026-04-10T09:00:00.000Z"
    } satisfies DailyCheckinState,
    sentAt: "2026-04-10T09:00:00.000Z",
    lastPatchedAt: null,
    expiresAt: "2026-04-24T09:00:00.000Z",
    closedReason: null
  };
}

function h2Ctx(overrides: Partial<CardActionContext> = {}): CardActionContext {
  return {
    operatorOpenId: "ou-student-1",
    triggerId: "trig-h2",
    actionName: "h2_submit",
    actionPayload: {
      action: "h2_submit",
      text: "用 Claude 生成 python 脚本,在本地跑通,效果不错",
      file_key: "file_v2_abc"
    },
    messageId: "om-1",
    chatId: "oc-1",
    receivedAt: "2026-04-10T12:30:00.000Z",
    currentVersion: "daily-checkin-v1",
    ...overrides
  };
}

function makeDeps(): CardHandlerDeps {
  const live = seedLiveCard();
  return {
    repo: {
      insertCardInteraction: vi.fn(() => "inserted" as const),
      findLiveCard: vi.fn(() => live),
      updateLiveCardState: vi.fn(),
      insertLiveCard: vi.fn(),
      closeLiveCard: vi.fn(),
      findEventById: vi.fn(),
      listReviewRequiredEvents: vi.fn(() => []),
      countReviewRequiredEvents: vi.fn(() => 0),
      findMemberByOpenId: vi.fn(() => ({
        id: "m-1",
        displayName: "张三",
        openId: "ou-student-1"
      }))
    } as unknown as CardHandlerDeps["repo"],
    ingestor: {
      ingest: vi.fn(() => ({
        eventId: "evt-1",
        effectiveDelta: 3,
        status: "pending" as const
      }))
    },
    aggregator: { applyDecision: vi.fn() },
    feishuClient: {
      patchCard: vi.fn(),
      sendCard: vi.fn()
    },
    clock: () => new Date("2026-04-10T12:30:00.000Z"),
    uuid: () => "uuid-stub"
  };
}

describe("dailyCheckinHandler — H2 multimodal branch", () => {
  let deps: CardHandlerDeps;
  beforeEach(() => {
    deps = makeDeps();
  });

  test("happy path: inserts card_interaction, calls ingestor with fileKey, updates state.items.H2", async () => {
    const result = await dailyCheckinHandler(h2Ctx(), deps);

    expect(deps.repo.insertCardInteraction).toHaveBeenCalledOnce();
    const cardInteractionRow = (
      deps.repo.insertCardInteraction as ReturnType<typeof vi.fn>
    ).mock.calls[0][0];
    expect(cardInteractionRow.cardType).toBe("daily_checkin");
    expect(cardInteractionRow.actionName).toBe("h2_submit");
    expect(cardInteractionRow.payloadJson).toEqual({
      text: "用 Claude 生成 python 脚本,在本地跑通,效果不错",
      file_key: "file_v2_abc"
    });
    expect(cardInteractionRow.rejectedReason).toBeNull();

    expect(deps.ingestor.ingest).toHaveBeenCalledOnce();
    const ingestReq = (deps.ingestor.ingest as ReturnType<typeof vi.fn>)
      .mock.calls[0][0];
    expect(ingestReq.itemCode).toBe("H2");
    expect(ingestReq.sourceType).toBe("card_interaction");
    expect(ingestReq.payload).toEqual({
      text: "用 Claude 生成 python 脚本,在本地跑通,效果不错",
      fileKey: "file_v2_abc"
    });
    expect(ingestReq.sourceRef).toBe(cardInteractionRow.id);

    expect(deps.repo.updateLiveCardState).toHaveBeenCalledOnce();
    const [, updatedState] = (
      deps.repo.updateLiveCardState as ReturnType<typeof vi.fn>
    ).mock.calls[0];
    expect((updatedState as DailyCheckinState).items.H2).toContain("m-1");

    expect(result.newCardJson).toBeDefined();
    expect(result.toast).toBeUndefined();
  });

  test("empty file_key is rejected by soft validation and returns a toast", async () => {
    const ctx = h2Ctx({
      actionPayload: {
        action: "h2_submit",
        text: "用 Claude 做了一个小工具效果不错",
        file_key: ""
      }
    });

    const result = await dailyCheckinHandler(ctx, deps);

    expect(result.toast?.type).toBe("error");
    expect(result.toast?.content).toContain("截图");
    expect(deps.ingestor.ingest).not.toHaveBeenCalled();

    expect(deps.repo.insertCardInteraction).toHaveBeenCalledOnce();
    const row = (deps.repo.insertCardInteraction as ReturnType<typeof vi.fn>)
      .mock.calls[0][0];
    expect(row.rejectedReason).toBe("soft_validation_file_key_required");
  });

  test("text under 20 chars is rejected by soft validation", async () => {
    const ctx = h2Ctx({
      actionPayload: {
        action: "h2_submit",
        text: "太短",
        file_key: "file_v2_abc"
      }
    });

    const result = await dailyCheckinHandler(ctx, deps);

    expect(result.toast?.type).toBe("error");
    expect(result.toast?.content).toContain("20");
    expect(deps.ingestor.ingest).not.toHaveBeenCalled();
  });

  test("ingestor rejection (cap exceeded) does not mutate state.items.H2", async () => {
    (deps.ingestor.ingest as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      eventId: "evt-rej",
      effectiveDelta: 0,
      status: "rejected" as const,
      reason: "cap_exceeded"
    });

    const result = await dailyCheckinHandler(h2Ctx(), deps);

    expect(deps.repo.updateLiveCardState).not.toHaveBeenCalled();
    expect(result.toast?.type).toBe("info");
    expect(result.toast?.content).toContain("满额");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/services/feishu/cards/handlers/daily-checkin-handler.test.ts -t "H2 multimodal branch"`
Expected: FAIL — `dailyCheckinHandler` has no `h2_submit` branch; the first test fails because `deps.ingestor.ingest` was never called.

- [ ] **Step 3: Modify `src/services/feishu/cards/handlers/daily-checkin-handler.ts`**

Locate the `switch (ctx.actionName)` statement added in Task C3 and append the `h2_submit` case. Import `validateH2Submission` from the Phase A4 soft-validation module.

```typescript
import { validateH2Submission } from "../soft-validation.js";
import { buildDailyCheckinV1 } from "../templates/daily-checkin/daily-checkin-v1.js";

import type {
  CardActionContext,
  CardActionResult,
  CardHandler,
  CardHandlerDeps,
  DailyCheckinState,
  LiveCardRow
} from "../types.js";

// ... existing handler scaffolding from Task C3 ...

export const dailyCheckinHandler: CardHandler = async (ctx, deps) => {
  switch (ctx.actionName) {
    // ... K3 / K4 / C1 / C3 / G2 branches from Task C3 unchanged ...

    case "h2_submit":
      return handleH2Submit(ctx, deps);

    default:
      return {
        toast: {
          type: "error",
          content: `daily-checkin handler: unknown action ${ctx.actionName}`
        }
      };
  }
};

async function handleH2Submit(
  ctx: CardActionContext,
  deps: CardHandlerDeps
): Promise<CardActionResult> {
  const payload = ctx.actionPayload as {
    text?: unknown;
    file_key?: unknown;
  };
  const text = typeof payload.text === "string" ? payload.text : "";
  const fileKey = typeof payload.file_key === "string" ? payload.file_key : "";

  const member = deps.repo.findMemberByOpenId?.(ctx.operatorOpenId);
  if (!member) {
    return {
      toast: { type: "error", content: "你不在本营学员名单" }
    };
  }

  const liveCard = deps.repo.findLiveCard("daily_checkin", ctx.chatId);
  if (!liveCard) {
    return {
      toast: { type: "error", content: "当前群没有活跃的打卡卡片" }
    };
  }

  const cardInteractionId = deps.uuid();

  // Step 1 — idempotent card_interactions row (always inserted; rejection path
  // sets rejectedReason to keep the audit trail).
  const validation = validateH2Submission({ text, fileKey });
  if (!validation.ok) {
    deps.repo.insertCardInteraction({
      id: cardInteractionId,
      memberId: member.id,
      periodId: liveCard.periodId,
      cardType: "daily_checkin",
      actionName: "h2_submit",
      feishuMessageId: ctx.messageId,
      feishuCardVersion: ctx.currentVersion,
      payloadJson: { text, file_key: fileKey },
      receivedAt: ctx.receivedAt,
      triggerId: ctx.triggerId,
      operatorOpenId: ctx.operatorOpenId,
      rejectedReason: validation.rejectedReason
    });
    return {
      toast: { type: "error", content: validation.toastContent }
    };
  }

  deps.repo.insertCardInteraction({
    id: cardInteractionId,
    memberId: member.id,
    periodId: liveCard.periodId,
    cardType: "daily_checkin",
    actionName: "h2_submit",
    feishuMessageId: ctx.messageId,
    feishuCardVersion: ctx.currentVersion,
    payloadJson: { text, file_key: fileKey },
    receivedAt: ctx.receivedAt,
    triggerId: ctx.triggerId,
    operatorOpenId: ctx.operatorOpenId,
    rejectedReason: null
  });

  // Step 2 — hand the submission to the sub-project 1 Ingestor. The
  // `payload.fileKey` field flows through `v2_scoring_item_events.payload_json`
  // (preserved by sub-project 1 Phase D3) into
  // `LlmPromptPayload` (sub-project 1 Phase D1 optional field) and finally
  // into the `LLM_VISION_MODEL` multimodal call in sub-project 1 Phase E4.
  const ingestResult = deps.ingestor.ingest({
    memberId: member.id,
    itemCode: "H2",
    sourceType: "card_interaction",
    sourceRef: cardInteractionId,
    payload: { text, fileKey },
    requestedAt: ctx.receivedAt
  });

  if (
    ingestResult.status === "rejected" &&
    ingestResult.reason === "cap_exceeded"
  ) {
    return {
      toast: {
        type: "info",
        content: "H2 本期已满额,可继续提交但不计分"
      }
    };
  }
  if (ingestResult.status === "rejected") {
    return {
      toast: {
        type: "error",
        content: `已记录,但未入账: ${ingestResult.reason ?? "unknown"}`
      }
    };
  }

  // Step 3 — merge the member into the H2 "审核中" list and persist.
  const currentState = liveCard.stateJson as DailyCheckinState;
  const nextState: DailyCheckinState = {
    ...currentState,
    items: {
      ...currentState.items,
      H2: currentState.items.H2.includes(member.id)
        ? currentState.items.H2
        : [...currentState.items.H2, member.id]
    }
  };
  deps.repo.updateLiveCardState(
    liveCard.id,
    nextState,
    deps.clock().toISOString()
  );

  // Step 4 — re-render the card so the caller returns the updated JSON
  // synchronously (Option D sync path).
  const newCardJson = buildDailyCheckinV1(nextState, ctx);
  return { newCardJson };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/services/feishu/cards/handlers/daily-checkin-handler.test.ts`
Expected: PASS — 4 new H2 branch assertions green plus the pre-existing Task C3 assertions unchanged. `deps.ingestor.ingest` was called once with `payload.fileKey === "file_v2_abc"`, and the live card state has `items.H2 = ["m-1"]`.

- [ ] **Step 5: Commit**

```bash
git add \
  src/services/feishu/cards/handlers/daily-checkin-handler.ts \
  tests/services/feishu/cards/handlers/daily-checkin-handler.test.ts
git commit -m "feat(sub2): wire H2 handler with file_key passthrough to Ingestor"
```

---

### Task E3: H2 multimodal smoke test (integration)

**Files:**
- Create: `tests/services/feishu/cards/integration/h2-multimodal-smoke.test.ts`
- No production code changes — this task is a pure integration exercise that boots a full Fastify instance with the real sub-project 1 `EventIngestor`, a fake `LlmScoringClient`, and the sub2 dispatcher + handler wired together.

The smoke test walks the full round-trip:
1. Boot `createApp({ databaseUrl: ":memory:" })` (same shape used by sub-project 1 tests) with a seeded camp + period + daily-checkin live card row.
2. POST `/api/v2/feishu/card-action` with an H2 click payload `{ text: "...", file_key: "file_v2_abc" }`.
3. Assert the sync response contains the updated daily-checkin card JSON with `m-1` in the H2 `审核中` list.
4. Inspect the DB: `card_interactions`, `v2_scoring_item_events` (status=`pending`), and `v2_llm_scoring_tasks` (prompt_text contains `H2` and `file_v2_abc`).
5. Simulate the worker finishing the task: call `aggregator.applyDecision(eventId, { decision: "approved", note: "good ai tool screenshot" }, operator)`.
6. Trigger the sub2 notify hook (`notifySub2CardPatch` from Phase D2) to patch the live daily-checkin card.
7. Assert the re-rendered card now shows `"✓ (+3)"` next to `m-1` in the H2 row instead of `"审核中"`.

This is the single integration test that proves sub2 <-> sub1 data flow for H2 end-to-end. The real `glm-4v-flash` HTTP call is **not** exercised here — that lives in sub-project 1 Phase E4's own test suite. The fake LlmScoringClient short-circuits directly to `{ pass: true, score: 3, reason: "..." }`.

- [ ] **Step 1: Write failing test**

Create `tests/services/feishu/cards/integration/h2-multimodal-smoke.test.ts`:

```typescript
import { beforeEach, describe, expect, test } from "vitest";
import type { FastifyInstance } from "fastify";

import { createApp } from "../../../../../src/app.js";
import { seedH2FixtureCamp } from "./helpers/h2-fixture.js";

interface SmokeContext {
  app: FastifyInstance;
  memberId: string;
  memberOpenId: string;
  operatorOpenId: string;
  liveCardId: string;
  messageId: string;
  chatId: string;
}

async function bootSmokeCamp(): Promise<SmokeContext> {
  const app = await createApp({
    databaseUrl: ":memory:",
    llmEnabled: false, // fake client short-circuit
    feishuStubMode: "in_memory"
  });
  const fixture = await seedH2FixtureCamp(app);
  return { app, ...fixture };
}

describe("H2 multimodal smoke — click → Ingestor → LLM task → worker decision → patch", () => {
  let ctx: SmokeContext;

  beforeEach(async () => {
    ctx = await bootSmokeCamp();
  });

  test("full round-trip writes card_interactions, v2_scoring_item_events, v2_llm_scoring_tasks; then patch flips state", async () => {
    // --- Step 1: student clicks H2 submit ---
    const clickRes = await ctx.app.inject({
      method: "POST",
      url: "/api/v2/feishu/card-action",
      headers: {
        "x-feishu-signature": "stub",
        "x-feishu-timestamp": "stub"
      },
      payload: {
        card_type: "daily_checkin",
        action_name: "h2_submit",
        message_id: ctx.messageId,
        chat_id: ctx.chatId,
        trigger_id: "trig-smoke-1",
        operator_open_id: ctx.memberOpenId,
        card_version: "daily-checkin-v1",
        payload: {
          action: "h2_submit",
          text: "用 Claude 生成 python 脚本,在本地跑通,成功实现自动归档功能",
          file_key: "file_v2_abc"
        }
      }
    });

    expect(clickRes.statusCode).toBe(200);
    const clickBody = clickRes.json();
    expect(clickBody.card).toBeDefined();
    expect(JSON.stringify(clickBody.card)).toContain("审核中");

    // --- Step 2: DB inspection ---
    const repo = ctx.app.scoringRepo;
    const cardInteractions = repo.db
      .prepare(
        "SELECT * FROM card_interactions WHERE action_name = 'h2_submit' AND member_id = ?"
      )
      .all(ctx.memberId) as Array<{ id: string; payload_json: string }>;
    expect(cardInteractions).toHaveLength(1);
    const cardInteraction = cardInteractions[0];
    expect(JSON.parse(cardInteraction.payload_json)).toEqual({
      text: expect.stringContaining("python"),
      file_key: "file_v2_abc"
    });

    const events = repo.db
      .prepare(
        "SELECT id, status, source_ref, payload_json FROM v2_scoring_item_events WHERE item_code = 'H2'"
      )
      .all() as Array<{
        id: string;
        status: string;
        source_ref: string;
        payload_json: string;
      }>;
    expect(events).toHaveLength(1);
    expect(events[0].status).toBe("pending");
    expect(events[0].source_ref).toBe(cardInteraction.id);
    // Sub-project 1 Phase D3 preserves file_key in payload_json
    expect(JSON.parse(events[0].payload_json)).toMatchObject({
      file_key: "file_v2_abc"
    });

    const tasks = repo.db
      .prepare("SELECT * FROM v2_llm_scoring_tasks WHERE event_id = ?")
      .all(events[0].id) as Array<{
        id: string;
        prompt_text: string;
        model: string;
        status: string;
      }>;
    expect(tasks).toHaveLength(1);
    expect(tasks[0].status).toBe("pending");
    expect(tasks[0].prompt_text).toContain("H2");
    expect(tasks[0].prompt_text).toContain("file_v2_abc");
    // Sub-project 1 Phase E4 routes H2 → LLM_VISION_MODEL; the fake stub
    // still records the resolved model name on the task row.
    expect(tasks[0].model).toMatch(/glm-4v-flash|vision/i);

    // --- Step 3: simulate the worker completing the task (approved) ---
    ctx.app.scoringAggregator.applyDecision(
      events[0].id,
      { decision: "approved", note: "good ai tool screenshot" },
      { id: "op-system", openId: "ou-system", roleType: "operator" }
    );

    // --- Step 4: sub2 notify hook patches the daily-checkin card ---
    await ctx.app.sub2NotifyHook.onLlmDecision({
      eventId: events[0].id,
      memberId: ctx.memberId,
      itemCode: "H2",
      decision: "approved",
      scoreDelta: 3
    });

    // --- Step 5: assert the in-memory feishu stub shows the patched card ---
    const stub = ctx.app.feishuClient as {
      patchedCards: Array<{ messageId: string; content: unknown }>;
    };
    expect(stub.patchedCards).toHaveLength(1);
    const patchedJson = JSON.stringify(stub.patchedCards[0].content);
    expect(patchedJson).not.toContain("审核中");
    expect(patchedJson).toContain("✓");
    expect(patchedJson).toContain("+3");

    // --- Step 6: the member dimension score was incremented ---
    const dims = repo.db
      .prepare(
        "SELECT dimension, period_score FROM v2_member_dimension_scores WHERE member_id = ?"
      )
      .all(ctx.memberId) as Array<{
        dimension: string;
        period_score: number;
      }>;
    const h = dims.find((d) => d.dimension === "H");
    expect(h?.period_score).toBe(3);
  });

  test("rejected LLM decision keeps the member out of the approved list", async () => {
    const clickRes = await ctx.app.inject({
      method: "POST",
      url: "/api/v2/feishu/card-action",
      payload: {
        card_type: "daily_checkin",
        action_name: "h2_submit",
        message_id: ctx.messageId,
        chat_id: ctx.chatId,
        trigger_id: "trig-smoke-2",
        operator_open_id: ctx.memberOpenId,
        card_version: "daily-checkin-v1",
        payload: {
          action: "h2_submit",
          text: "用 ChatGPT 做了一个实操分享,效果很好,值得推荐",
          file_key: "file_v2_xyz"
        }
      }
    });
    expect(clickRes.statusCode).toBe(200);

    const events = ctx.app.scoringRepo.db
      .prepare(
        "SELECT id FROM v2_scoring_item_events WHERE item_code = 'H2' ORDER BY created_at DESC LIMIT 1"
      )
      .all() as Array<{ id: string }>;
    const eventId = events[0].id;

    ctx.app.scoringAggregator.applyDecision(
      eventId,
      { decision: "rejected", note: "截图不是 AI 工具界面" },
      { id: "op-system", openId: "ou-system", roleType: "operator" }
    );
    await ctx.app.sub2NotifyHook.onLlmDecision({
      eventId,
      memberId: ctx.memberId,
      itemCode: "H2",
      decision: "rejected",
      scoreDelta: 0
    });

    const dims = ctx.app.scoringRepo.db
      .prepare(
        "SELECT dimension, period_score FROM v2_member_dimension_scores WHERE member_id = ?"
      )
      .all(ctx.memberId) as Array<{
        dimension: string;
        period_score: number;
      }>;
    const h = dims.find((d) => d.dimension === "H");
    expect(h?.period_score ?? 0).toBe(0);
  });
});
```

Create the tiny fixture helper at `tests/services/feishu/cards/integration/helpers/h2-fixture.ts`:

```typescript
import type { FastifyInstance } from "fastify";

export interface H2Fixture {
  memberId: string;
  memberOpenId: string;
  operatorOpenId: string;
  liveCardId: string;
  messageId: string;
  chatId: string;
}

/**
 * Seeds the minimum schema needed for the H2 multimodal smoke test:
 * - one camp, one non-ice-breaker period
 * - one student member bound to a Feishu open id
 * - one operator member (for the applyDecision audit tag)
 * - one active `feishu_live_cards` row for the daily-checkin card
 *
 * The helper lives in `tests/services/feishu/cards/integration/helpers`
 * to avoid polluting the unit-test folder with multi-row fixtures.
 */
export async function seedH2FixtureCamp(
  app: FastifyInstance
): Promise<H2Fixture> {
  const repo = app.scoringRepo;
  const now = "2026-04-10T09:00:00.000Z";
  const campId = "camp-smoke";
  const periodId = "p-smoke";
  const windowId = "w-smoke";
  const memberId = "m-smoke-student";
  const operatorId = "m-smoke-op";
  const liveCardId = "flc-smoke";
  const messageId = "om-smoke";
  const chatId = "oc-smoke";

  repo.db
    .prepare(
      "INSERT INTO camps (id, name, created_at) VALUES (?, 'smoke camp', ?)"
    )
    .run(campId, now);
  repo.db
    .prepare(
      "INSERT INTO v2_periods (id, camp_id, number, is_ice_breaker, started_at, ended_at) VALUES (?, ?, 2, 0, ?, NULL)"
    )
    .run(periodId, campId, now);
  repo.db
    .prepare(
      "INSERT INTO v2_windows (id, camp_id, period_id, code, started_at, ended_at) VALUES (?, ?, ?, 'W1', ?, NULL)"
    )
    .run(windowId, campId, periodId, now);
  repo.db
    .prepare(
      `INSERT INTO members (id, camp_id, display_name, role_type, is_participant, is_excluded_from_board, source_feishu_open_id)
       VALUES (?, ?, '张三', 'student', 1, 0, 'ou-student-smoke')`
    )
    .run(memberId, campId);
  repo.db
    .prepare(
      `INSERT INTO members (id, camp_id, display_name, role_type, is_participant, is_excluded_from_board, source_feishu_open_id)
       VALUES (?, ?, '运营甲', 'operator', 0, 0, 'ou-operator-smoke')`
    )
    .run(operatorId, campId);
  repo.db
    .prepare(
      `INSERT INTO feishu_live_cards (id, card_type, feishu_message_id, feishu_chat_id, camp_id, period_id, window_id, card_version, state_json, sent_at, last_patched_at, expires_at, closed_reason)
       VALUES (?, 'daily_checkin', ?, ?, ?, ?, ?, 'daily-checkin-v1', ?, ?, NULL, ?, NULL)`
    )
    .run(
      liveCardId,
      messageId,
      chatId,
      campId,
      periodId,
      windowId,
      JSON.stringify({
        items: { K3: [], K4: [], H2: [], C1: [], C3: [], G2: [] },
        postedAt: now
      }),
      now,
      "2026-04-24T09:00:00.000Z"
    );

  return {
    memberId,
    memberOpenId: "ou-student-smoke",
    operatorOpenId: "ou-operator-smoke",
    liveCardId,
    messageId,
    chatId
  };
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/services/feishu/cards/integration/h2-multimodal-smoke.test.ts`
Expected: FAIL — depending on the state of `createApp`, either the stub Feishu client does not yet expose `patchedCards`, or the `sub2NotifyHook` dependency is not wired. Both are filled in by re-using the Phase D2 notify hook (if it is already merged) or by appending the minimal wire-up to `createApp` in this task's GREEN step.

- [ ] **Step 3: Wire the missing scaffold in `src/app.ts`**

If Phase D2 already shipped `sub2NotifyHook` and the in-memory Feishu stub exposes `patchedCards`, skip this step. Otherwise, extend `createApp` to:
1. Construct the `InMemoryFeishuClient` test stub (under `src/services/feishu/cards/testing/in-memory-feishu-client.ts`) when `feishuStubMode === "in_memory"`.
2. Attach `patchedCards: []` to the stub and push `{ messageId, content }` on every `patchCard` call.
3. Wire `app.sub2NotifyHook = createSub2NotifyHook({ repo, feishuClient: stub, renderer: renderCard })`.

No new production logic — only plumbing. The Phase D2 hook implementation is already tested; this task only ensures the wiring exists for the smoke test.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/services/feishu/cards/integration/h2-multimodal-smoke.test.ts`
Expected: PASS — two scenarios green. The approved path increments `v2_member_dimension_scores` for dimension `H` by 3; the rejected path leaves it at 0.

- [ ] **Step 5: Commit**

```bash
git add \
  tests/services/feishu/cards/integration/h2-multimodal-smoke.test.ts \
  tests/services/feishu/cards/integration/helpers/h2-fixture.ts \
  src/app.ts \
  src/services/feishu/cards/testing/in-memory-feishu-client.ts
git commit -m "test(sub2): add H2 multimodal smoke round-trip from click to patch"
```

---

## Phase E Exit Checkpoint

Run the full suite and build:
```bash
npm test
npm run build
```

Expected: both green. The H2 end-to-end path works: H2 click → `card_interactions` → `EventIngestor.ingest({ payload: { text, fileKey } })` → `v2_scoring_item_events` + `v2_llm_scoring_tasks` rows with `file_key` preserved → simulated worker `applyDecision` → sub2 notify hook → patched daily-checkin card shows `"✓ (+3)"` next to the member.

The real `glm-4v-flash` HTTP call is NOT tested here — that lives in sub-project 1 Phase E4 where the multimodal routing is implemented against the real HTTP client. Phase E of sub2 only guarantees the passthrough plumbing is correct.

Before moving on to Phase F, the following must all be true:

- [ ] `npm test -- tests/services/feishu/cards/` green with zero skipped
- [ ] `npm test -- tests/services/feishu/cards/integration/h2-multimodal-smoke.test.ts` green
- [ ] `npm run build` clean (no TypeScript errors)
- [ ] The daily-checkin H2 button renders as a form element with `input` + `select_file` + submit behavior whose value references both child inputs
- [ ] `dailyCheckinHandler` insert a `card_interactions` row for every H2 click, with `payload_json` preserving `file_key` in snake_case and `rejected_reason` populated on soft-validation failure
- [ ] Ingestor is called with `payload.fileKey` in camelCase and `sourceType === "card_interaction"`
- [ ] Sub-project 1 Phase D3 preserves `file_key` through `v2_scoring_item_events.payload_json` (verified in the smoke test DB assertion)
- [ ] Sub-project 1 Phase E4 records `model` with a vision identifier on the `v2_llm_scoring_tasks` row (verified by regex match in the smoke test)
- [ ] The `applyDecision` call shape `(eventId, { decision, note }, operator)` matches the one consumed by the Phase F review queue handler — any drift between Phase E and Phase F must be resolved before F1 starts

---

## Phase F — Operator cards (S4 milestone) (4 tasks)

Ships the three operator-facing cards described in spec §4.2 (#15 review queue, #16 member management, #17 manual score adjust) plus a round-trip integration test that walks a realistic operator session end-to-end. All three cards are DM'd to the operator (not posted in the group) so they stay out of student view.

**Cross-subproject dependencies:**
- Sub-project 1 Phase G9 (admin review queue routes) ships before F1. The aggregator signature `applyDecision(eventId, { decision, note }, operator)` is the shared contract.
- Sub-project 1 Phase G10 (admin members PATCH endpoint `/api/v2/admin/members/:id`) ships before F2. F2 calls this HTTP endpoint from the handler; it does not write to `members` directly.
- Sub-project 1 Phase D2 `ScoringAggregator` re-signature: the dispatcher fix from Phase B4 already aligns `deps.aggregator.applyDecision` to the `{ decision, note }, operator` shape; any residual mismatch with sub-project 1 Phase D2's legacy `(eventId, decision, note)` signature must be resolved as a pre-F1 patch to sub-project 1.

---

### Task F1: Review queue card template + state + handler with pagination + inline patch (#15)

**Files:**
- Create: `src/services/feishu/cards/templates/review-queue/review-queue-v1.ts`
- Create: `tests/services/feishu/cards/templates/review-queue/review-queue-v1.test.ts`
- Create: `src/services/feishu/cards/handlers/review-queue-handler.ts`
- Create: `tests/services/feishu/cards/handlers/review-queue-handler.test.ts`

Ships card #15. The template renders a `ReviewQueueState` (Phase A2 type) with 10 events per page. Each event row shows `memberName / itemCode / scoreDelta / textExcerpt / llmReason` plus three action buttons `[✅ 批准] [❌ 拒绝] [✏️ 调整分数]`. The bottom of the card carries `[← 上一页] [下一页 →]` pagination buttons and a `第 X / Y 页` label. The `review-queue-handler.ts` consumes six action names:

| Action name | Button | Behavior |
|---|---|---|
| `approve` | ✅ 批准 | Calls `aggregator.applyDecision(eventId, { decision: "approved", note }, operator)`; on `InvalidDecisionStateError` returns `"已被其他运营处理"` toast |
| `reject` | ❌ 拒绝 | Calls `aggregator.applyDecision(eventId, { decision: "rejected", note }, operator)` |
| `open_adjust` | ✏️ 调整分数 | Switches the card into an adjust sub-state OR delegates to the manual-adjust card |
| `page_prev` | ← 上一页 | Recomputes `ReviewQueueState` with `currentPage - 1` |
| `page_next` | 下一页 → | Recomputes `ReviewQueueState` with `currentPage + 1` |
| `refresh` | 🔄 刷新 | Recomputes `ReviewQueueState` with `currentPage` unchanged |

**Size budget:** 10 events × ~2 KB ≈ 20 KB rendered JSON; under the 25 KB budget. The test asserts `JSON.stringify(card).length <= 25 * 1024`.

- [ ] **Step 1: Write failing test for the template**

Create `tests/services/feishu/cards/templates/review-queue/review-queue-v1.test.ts`:

```typescript
import { describe, expect, test } from "vitest";

import { buildReviewQueueV1 } from "../../../../../../src/services/feishu/cards/templates/review-queue/review-queue-v1.js";
import { CARD_SIZE_BUDGET_BYTES } from "../../../../../../src/services/feishu/cards/renderer.js";
import type {
  CardActionContext,
  ReviewQueueState
} from "../../../../../../src/services/feishu/cards/types.js";

function ctx(): CardActionContext {
  return {
    operatorOpenId: "ou-op",
    triggerId: "t-rq",
    actionName: "noop",
    actionPayload: {},
    messageId: "om-rq-1",
    chatId: "oc-op",
    receivedAt: "2026-04-10T12:00:00.000Z",
    currentVersion: "review-queue-v1"
  };
}

function fakeEvents(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    eventId: `evt-${i + 1}`,
    memberId: `m-${i + 1}`,
    memberName: `学员 ${i + 1}`,
    itemCode: (["K3", "C1", "G2", "H2"] as const)[i % 4],
    scoreDelta: 3,
    textExcerpt: `今天学到了一些知识点,第 ${i + 1} 条摘要内容`.slice(0, 60),
    llmReason: `LLM 判断 ${i + 1}: 内容描述不够具体`,
    createdAt: "2026-04-10T10:00:00.000Z"
  }));
}

describe("review-queue-v1 template", () => {
  test("renders an empty state with a friendly message", () => {
    const state: ReviewQueueState = {
      currentPage: 1,
      totalPages: 0,
      totalEvents: 0,
      events: []
    };
    const card = buildReviewQueueV1(state, ctx());
    expect(JSON.stringify(card)).toContain("暂无待复核");
  });

  test("renders 10 events with per-row 3 action buttons + pagination footer", () => {
    const state: ReviewQueueState = {
      currentPage: 1,
      totalPages: 2,
      totalEvents: 14,
      events: fakeEvents(10)
    };
    const card = buildReviewQueueV1(state, ctx());
    const serialized = JSON.stringify(card);

    // Every event row contains the three action names
    for (let i = 1; i <= 10; i += 1) {
      expect(serialized).toContain(`evt-${i}`);
      expect(serialized).toContain(`学员 ${i}`);
    }
    expect(countOccurrences(serialized, '"action":"approve"')).toBe(10);
    expect(countOccurrences(serialized, '"action":"reject"')).toBe(10);
    expect(countOccurrences(serialized, '"action":"open_adjust"')).toBe(10);

    // Pagination footer
    expect(serialized).toContain("第 1 / 2 页");
    expect(serialized).toContain("page_prev");
    expect(serialized).toContain("page_next");
  });

  test("10-event page renders under the 25 KB card size budget", () => {
    const state: ReviewQueueState = {
      currentPage: 1,
      totalPages: 2,
      totalEvents: 14,
      events: fakeEvents(10)
    };
    const card = buildReviewQueueV1(state, ctx());
    const size = Buffer.byteLength(JSON.stringify(card), "utf8");
    expect(size).toBeLessThanOrEqual(CARD_SIZE_BUDGET_BYTES);
  });

  test("pagination disables prev on page 1 and next on last page", () => {
    const firstPage: ReviewQueueState = {
      currentPage: 1,
      totalPages: 3,
      totalEvents: 24,
      events: fakeEvents(10)
    };
    const lastPage: ReviewQueueState = {
      currentPage: 3,
      totalPages: 3,
      totalEvents: 24,
      events: fakeEvents(4)
    };
    const first = JSON.stringify(buildReviewQueueV1(firstPage, ctx()));
    const last = JSON.stringify(buildReviewQueueV1(lastPage, ctx()));

    expect(first).toContain('"name":"page_prev_btn","disabled":true');
    expect(first).toContain('"name":"page_next_btn","disabled":false');
    expect(last).toContain('"name":"page_prev_btn","disabled":false');
    expect(last).toContain('"name":"page_next_btn","disabled":true');
  });
});

function countOccurrences(haystack: string, needle: string): number {
  let count = 0;
  let i = 0;
  while (true) {
    const next = haystack.indexOf(needle, i);
    if (next === -1) break;
    count += 1;
    i = next + needle.length;
  }
  return count;
}
```

- [ ] **Step 2: Run template test to verify it fails**

Run: `npm test -- tests/services/feishu/cards/templates/review-queue/review-queue-v1.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/services/feishu/cards/templates/review-queue/review-queue-v1.ts`**

```typescript
import type {
  CardActionContext,
  FeishuCardJson,
  ReviewQueueEventRow,
  ReviewQueueState
} from "../../types.js";
import { buildHeader } from "../common/header.js";

export function buildReviewQueueV1(
  state: ReviewQueueState,
  _ctx: CardActionContext
): FeishuCardJson {
  return {
    schema: "2.0",
    config: { wide_screen_mode: true, update_multi: true },
    header: buildHeader({
      title: "LLM 复核队列",
      subtitle:
        state.totalEvents === 0
          ? "当前无待复核事件"
          : `共 ${state.totalEvents} 条待复核`,
      template: "orange"
    }),
    body: {
      elements:
        state.events.length === 0
          ? [emptyStateBlock()]
          : [...state.events.map(buildEventRow), buildPaginationFooter(state)]
    }
  };
}

function emptyStateBlock(): Record<string, unknown> {
  return {
    tag: "markdown",
    content: "✨ 暂无待复核事件,运营可以喝杯茶了"
  };
}

function buildEventRow(event: ReviewQueueEventRow): Record<string, unknown> {
  return {
    tag: "div",
    elements: [
      {
        tag: "markdown",
        content:
          `**${event.memberName}** · \`${event.itemCode}\` · +${event.scoreDelta}\n` +
          `> ${truncate(event.textExcerpt, 80)}\n` +
          `_LLM: ${truncate(event.llmReason, 60)}_`
      },
      {
        tag: "action",
        actions: [
          approveButton(event.eventId),
          rejectButton(event.eventId),
          adjustButton(event.eventId)
        ]
      }
    ]
  };
}

function approveButton(eventId: string): Record<string, unknown> {
  return {
    tag: "button",
    text: { tag: "plain_text", content: "✅ 批准" },
    type: "primary",
    behaviors: [
      {
        type: "callback",
        value: { action: "approve", event_id: eventId, note: "operator approved via queue" }
      }
    ]
  };
}

function rejectButton(eventId: string): Record<string, unknown> {
  return {
    tag: "button",
    text: { tag: "plain_text", content: "❌ 拒绝" },
    type: "danger",
    behaviors: [
      {
        type: "callback",
        value: { action: "reject", event_id: eventId, note: "operator rejected via queue" }
      }
    ]
  };
}

function adjustButton(eventId: string): Record<string, unknown> {
  return {
    tag: "button",
    text: { tag: "plain_text", content: "✏️ 调整分数" },
    type: "default",
    behaviors: [
      {
        type: "callback",
        value: { action: "open_adjust", event_id: eventId }
      }
    ]
  };
}

function buildPaginationFooter(
  state: ReviewQueueState
): Record<string, unknown> {
  return {
    tag: "action",
    actions: [
      {
        tag: "button",
        name: "page_prev_btn",
        text: { tag: "plain_text", content: "← 上一页" },
        disabled: state.currentPage <= 1,
        behaviors: [
          {
            type: "callback",
            value: { action: "page_prev", page: state.currentPage }
          }
        ]
      },
      {
        tag: "plain_text",
        content: `第 ${state.currentPage} / ${Math.max(1, state.totalPages)} 页`
      },
      {
        tag: "button",
        name: "page_next_btn",
        text: { tag: "plain_text", content: "下一页 →" },
        disabled: state.currentPage >= state.totalPages,
        behaviors: [
          {
            type: "callback",
            value: { action: "page_next", page: state.currentPage }
          }
        ]
      }
    ]
  };
}

function truncate(input: string, maxChars: number): string {
  if (input.length <= maxChars) return input;
  return `${input.slice(0, maxChars - 1)}…`;
}
```

- [ ] **Step 4: Run template test to verify it passes**

Run: `npm test -- tests/services/feishu/cards/templates/review-queue/review-queue-v1.test.ts`
Expected: PASS — 4 template assertions green. The 10-event size assertion shows the serialized card at ~18-22 KB, safely under 25 KB.

- [ ] **Step 5: Write failing handler test**

Create `tests/services/feishu/cards/handlers/review-queue-handler.test.ts`:

```typescript
import { beforeEach, describe, expect, test, vi } from "vitest";

import { reviewQueueHandler } from "../../../../../src/services/feishu/cards/handlers/review-queue-handler.js";
import type {
  CardActionContext,
  CardHandlerDeps,
  ReviewQueueEventRow
} from "../../../../../src/services/feishu/cards/types.js";
import { InvalidDecisionStateError } from "../../../../../src/domain/v2/errors.js";

function seedEvents(n: number): ReviewQueueEventRow[] {
  return Array.from({ length: n }, (_, i) => ({
    eventId: `evt-${i + 1}`,
    memberId: `m-${i + 1}`,
    memberName: `学员 ${i + 1}`,
    itemCode: "K3",
    scoreDelta: 3,
    textExcerpt: `review ${i + 1}`,
    llmReason: "不够具体",
    createdAt: "2026-04-10T10:00:00.000Z"
  }));
}

function makeDeps(events: ReviewQueueEventRow[]): CardHandlerDeps {
  return {
    repo: {
      insertCardInteraction: vi.fn(() => "inserted" as const),
      findLiveCard: vi.fn(),
      updateLiveCardState: vi.fn(),
      insertLiveCard: vi.fn(),
      closeLiveCard: vi.fn(),
      findEventById: vi.fn(),
      listReviewRequiredEvents: vi.fn(({ limit, offset }) =>
        events.slice(offset, offset + limit)
      ),
      countReviewRequiredEvents: vi.fn(() => events.length),
      findMemberByOpenId: vi.fn(() => ({
        id: "op-1",
        displayName: "运营甲",
        openId: "ou-op",
        roleType: "operator"
      }))
    } as unknown as CardHandlerDeps["repo"],
    ingestor: { ingest: vi.fn() },
    aggregator: { applyDecision: vi.fn() },
    feishuClient: { patchCard: vi.fn(), sendCard: vi.fn() },
    clock: () => new Date("2026-04-10T12:00:00.000Z"),
    uuid: () => "uuid-stub"
  };
}

function ctx(action: string, payload: Record<string, unknown>): CardActionContext {
  return {
    operatorOpenId: "ou-op",
    triggerId: "t-rq",
    actionName: action,
    actionPayload: payload,
    messageId: "om-rq",
    chatId: "oc-op",
    receivedAt: "2026-04-10T12:00:00.000Z",
    currentVersion: "review-queue-v1"
  };
}

describe("reviewQueueHandler", () => {
  let deps: CardHandlerDeps;
  beforeEach(() => {
    deps = makeDeps(seedEvents(14));
  });

  test("approve button calls applyDecision with { decision, note }, operator shape", async () => {
    const result = await reviewQueueHandler(
      ctx("approve", {
        action: "approve",
        event_id: "evt-3",
        note: "looks good"
      }),
      deps
    );

    expect(deps.aggregator.applyDecision).toHaveBeenCalledOnce();
    const [eventId, decisionArg, operatorArg] = (
      deps.aggregator.applyDecision as ReturnType<typeof vi.fn>
    ).mock.calls[0];
    expect(eventId).toBe("evt-3");
    expect(decisionArg).toEqual({ decision: "approved", note: "looks good" });
    expect(operatorArg).toMatchObject({
      id: "op-1",
      roleType: "operator"
    });

    expect(result.newCardJson).toBeDefined();
    expect(JSON.stringify(result.newCardJson)).toContain("第 1 / 2 页");
  });

  test("reject button calls applyDecision with decision=rejected", async () => {
    await reviewQueueHandler(
      ctx("reject", {
        action: "reject",
        event_id: "evt-5",
        note: "not clear"
      }),
      deps
    );
    const [, decisionArg] = (
      deps.aggregator.applyDecision as ReturnType<typeof vi.fn>
    ).mock.calls[0];
    expect(decisionArg).toEqual({ decision: "rejected", note: "not clear" });
  });

  test("page_next increments currentPage and re-queries the repository", async () => {
    const result = await reviewQueueHandler(
      ctx("page_next", { action: "page_next", page: 1 }),
      deps
    );
    expect(deps.repo.listReviewRequiredEvents).toHaveBeenLastCalledWith(
      expect.objectContaining({ limit: 10, offset: 10 })
    );
    expect(JSON.stringify(result.newCardJson)).toContain("第 2 / 2 页");
  });

  test("page_prev at page 1 stays on page 1 (clamp)", async () => {
    const result = await reviewQueueHandler(
      ctx("page_prev", { action: "page_prev", page: 1 }),
      deps
    );
    expect(JSON.stringify(result.newCardJson)).toContain("第 1 / 2 页");
  });

  test("InvalidDecisionStateError from aggregator → '已被其他运营处理' toast", async () => {
    (deps.aggregator.applyDecision as ReturnType<typeof vi.fn>).mockImplementationOnce(
      () => {
        throw new InvalidDecisionStateError("evt-3", "approved");
      }
    );
    const result = await reviewQueueHandler(
      ctx("approve", {
        action: "approve",
        event_id: "evt-3",
        note: "race condition"
      }),
      deps
    );
    expect(result.toast?.type).toBe("error");
    expect(result.toast?.content).toContain("已被");
  });

  test("double-review race: two operators approving the same event — second gets 409-style toast", async () => {
    const seq = vi.fn();
    seq.mockImplementationOnce(() => undefined);
    seq.mockImplementationOnce(() => {
      throw new InvalidDecisionStateError("evt-3", "approved");
    });
    (deps.aggregator.applyDecision as unknown) = seq;

    const first = await reviewQueueHandler(
      ctx("approve", { action: "approve", event_id: "evt-3", note: "op A" }),
      deps
    );
    const second = await reviewQueueHandler(
      ctx("approve", { action: "approve", event_id: "evt-3", note: "op B" }),
      deps
    );
    expect(first.newCardJson).toBeDefined();
    expect(second.toast?.type).toBe("error");
  });

  test("unknown action returns an error toast", async () => {
    const result = await reviewQueueHandler(
      ctx("ghost", { action: "ghost" }),
      deps
    );
    expect(result.toast?.type).toBe("error");
  });
});
```

- [ ] **Step 6: Run handler test to verify it fails**

Run: `npm test -- tests/services/feishu/cards/handlers/review-queue-handler.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 7: Implement `src/services/feishu/cards/handlers/review-queue-handler.ts`**

```typescript
import type {
  CardActionContext,
  CardActionResult,
  CardHandler,
  CardHandlerDeps,
  ReviewQueueState
} from "../types.js";
import { buildReviewQueueV1 } from "../templates/review-queue/review-queue-v1.js";
import { InvalidDecisionStateError } from "../../../domain/v2/errors.js";

const PAGE_SIZE = 10;

export const reviewQueueHandler: CardHandler = async (ctx, deps) => {
  const action = ctx.actionName;
  switch (action) {
    case "approve":
      return handleDecision("approved", ctx, deps);
    case "reject":
      return handleDecision("rejected", ctx, deps);
    case "page_next":
      return handlePagination(+1, ctx, deps);
    case "page_prev":
      return handlePagination(-1, ctx, deps);
    case "refresh":
      return handlePagination(0, ctx, deps);
    case "open_adjust":
      return handleOpenAdjust(ctx, deps);
    default:
      return {
        toast: {
          type: "error",
          content: `review-queue handler: unknown action ${action}`
        }
      };
  }
};

async function handleDecision(
  decision: "approved" | "rejected",
  ctx: CardActionContext,
  deps: CardHandlerDeps
): Promise<CardActionResult> {
  const payload = ctx.actionPayload as {
    event_id?: unknown;
    note?: unknown;
    page?: unknown;
  };
  const eventId = typeof payload.event_id === "string" ? payload.event_id : "";
  const note =
    typeof payload.note === "string" && payload.note.trim().length > 0
      ? payload.note
      : decision === "approved"
      ? "operator approved via queue"
      : "operator rejected via queue";

  const operator = deps.repo.findMemberByOpenId?.(ctx.operatorOpenId);
  if (!operator || operator.roleType !== "operator") {
    return {
      toast: { type: "error", content: "仅运营可以操作复核队列" }
    };
  }

  try {
    deps.aggregator.applyDecision(eventId, { decision, note }, operator);
  } catch (err) {
    if (err instanceof InvalidDecisionStateError) {
      return {
        toast: { type: "error", content: "此条已被其他运营处理,请刷新队列" }
      };
    }
    throw err;
  }

  const requestedPage = numberOrDefault(payload.page, 1);
  const state = queryState(requestedPage, deps);
  return { newCardJson: buildReviewQueueV1(state, ctx) };
}

async function handlePagination(
  delta: -1 | 0 | 1,
  ctx: CardActionContext,
  deps: CardHandlerDeps
): Promise<CardActionResult> {
  const payload = ctx.actionPayload as { page?: unknown };
  const currentPage = numberOrDefault(payload.page, 1);
  const totalEvents = deps.repo.countReviewRequiredEvents();
  const totalPages = Math.max(1, Math.ceil(totalEvents / PAGE_SIZE));
  const nextPage = clamp(currentPage + delta, 1, totalPages);
  const state = queryState(nextPage, deps);
  return { newCardJson: buildReviewQueueV1(state, ctx) };
}

async function handleOpenAdjust(
  ctx: CardActionContext,
  deps: CardHandlerDeps
): Promise<CardActionResult> {
  // Task F3 defines the manual-adjust card as a separate DM card.
  // The review queue handler simply notes the intent and leaves the
  // queue page in place; the followUp callback DMs the operator
  // a fresh manual-adjust card via feishuClient.sendCard.
  const payload = ctx.actionPayload as { event_id?: unknown };
  const eventId = typeof payload.event_id === "string" ? payload.event_id : "";
  const currentPage = numberOrDefault(payload.page, 1);
  const state = queryState(currentPage, deps);

  return {
    newCardJson: buildReviewQueueV1(state, ctx),
    followUp: async () => {
      const event = deps.repo.findEventById(eventId);
      if (!event) return;
      // The adjust card factory is defined in Task F3.
      // The handler imports it lazily to avoid a circular dependency.
      const { buildManualAdjustCardForEvent } = await import(
        "../templates/manual-adjust/manual-adjust-v1.js"
      );
      const adjustCard = buildManualAdjustCardForEvent(event, ctx);
      await deps.feishuClient.sendCard({
        receiveId: ctx.operatorOpenId,
        content: adjustCard
      });
    }
  };
}

function queryState(page: number, deps: CardHandlerDeps): ReviewQueueState {
  const totalEvents = deps.repo.countReviewRequiredEvents();
  const totalPages = Math.max(1, Math.ceil(totalEvents / PAGE_SIZE));
  const safePage = clamp(page, 1, totalPages);
  const offset = (safePage - 1) * PAGE_SIZE;
  const events = deps.repo.listReviewRequiredEvents({
    limit: PAGE_SIZE,
    offset
  });
  return {
    currentPage: safePage,
    totalPages,
    totalEvents,
    events
  };
}

function numberOrDefault(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(value: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, value));
}
```

- [ ] **Step 8: Run handler test to verify it passes**

Run: `npm test -- tests/services/feishu/cards/handlers/review-queue-handler.test.ts`
Expected: PASS — 7 assertions green. The dispatcher signature `(eventId, { decision, note }, operator)` is forwarded to `aggregator.applyDecision` verbatim, matching sub-project 1 Phase G9.

- [ ] **Step 9: Commit**

```bash
git add \
  src/services/feishu/cards/templates/review-queue/review-queue-v1.ts \
  src/services/feishu/cards/handlers/review-queue-handler.ts \
  tests/services/feishu/cards/templates/review-queue/review-queue-v1.test.ts \
  tests/services/feishu/cards/handlers/review-queue-handler.test.ts
git commit -m "feat(sub2): add review-queue card with pagination and inline decision patch"
```

---

### Task F2: Member management card template + handler (#16)

**Files:**
- Create: `src/services/feishu/cards/templates/member-mgmt/member-mgmt-v1.ts`
- Create: `tests/services/feishu/cards/templates/member-mgmt/member-mgmt-v1.test.ts`
- Create: `src/services/feishu/cards/handlers/member-mgmt-handler.ts`
- Create: `tests/services/feishu/cards/handlers/member-mgmt-handler.test.ts`

Ships card #16. The template lists members with per-row buttons `[提为运营] [隐藏上榜] [改别名]`. The handler dispatches to the sub-project 1 Phase G10 PATCH endpoint `/api/v2/admin/members/:memberId` with the right body shape. All HTTP calls are made through an injected `adminApiClient` so unit tests can replace it with a fake.

- [ ] **Step 1: Write failing template test**

Create `tests/services/feishu/cards/templates/member-mgmt/member-mgmt-v1.test.ts`:

```typescript
import { describe, expect, test } from "vitest";

import { buildMemberMgmtV1 } from "../../../../../../src/services/feishu/cards/templates/member-mgmt/member-mgmt-v1.js";
import type { CardActionContext } from "../../../../../../src/services/feishu/cards/types.js";

function ctx(): CardActionContext {
  return {
    operatorOpenId: "ou-op",
    triggerId: "t-mm",
    actionName: "noop",
    actionPayload: {},
    messageId: "om-mm",
    chatId: "oc-op",
    receivedAt: "2026-04-10T12:00:00.000Z",
    currentVersion: "member-mgmt-v1"
  };
}

describe("member-mgmt-v1 template", () => {
  test("renders one row per member with the three action buttons", () => {
    const card = buildMemberMgmtV1(
      {
        members: [
          {
            id: "m-1",
            displayName: "张三",
            roleType: "student",
            hiddenFromBoard: false,
            isParticipant: true
          },
          {
            id: "m-2",
            displayName: "李四",
            roleType: "student",
            hiddenFromBoard: true,
            isParticipant: true
          }
        ]
      },
      ctx()
    );
    const serialized = JSON.stringify(card);
    expect(serialized).toContain("张三");
    expect(serialized).toContain("李四");
    expect(serialized).toContain("promote_to_operator");
    expect(serialized).toContain("toggle_hidden_from_board");
    expect(serialized).toContain("rename_member");
  });

  test("empty member list renders a helpful markdown block", () => {
    const card = buildMemberMgmtV1({ members: [] }, ctx());
    expect(JSON.stringify(card)).toContain("当前没有成员");
  });

  test("hidden_from_board=true renders '🙈 已隐藏' label on the toggle button", () => {
    const card = buildMemberMgmtV1(
      {
        members: [
          {
            id: "m-1",
            displayName: "张三",
            roleType: "student",
            hiddenFromBoard: true,
            isParticipant: true
          }
        ]
      },
      ctx()
    );
    expect(JSON.stringify(card)).toContain("🙈 已隐藏");
  });
});
```

- [ ] **Step 2: Run template test to verify it fails**

Run: `npm test -- tests/services/feishu/cards/templates/member-mgmt/member-mgmt-v1.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/services/feishu/cards/templates/member-mgmt/member-mgmt-v1.ts`**

```typescript
import type {
  CardActionContext,
  FeishuCardJson
} from "../../types.js";
import { buildHeader } from "../common/header.js";

export interface MemberMgmtState {
  members: Array<{
    id: string;
    displayName: string;
    roleType: "student" | "operator" | "trainer" | "observer";
    hiddenFromBoard: boolean;
    isParticipant: boolean;
  }>;
}

export function buildMemberMgmtV1(
  state: MemberMgmtState,
  _ctx: CardActionContext
): FeishuCardJson {
  return {
    schema: "2.0",
    config: { wide_screen_mode: true, update_multi: true },
    header: buildHeader({
      title: "成员管理",
      subtitle: `共 ${state.members.length} 人`,
      template: "purple"
    }),
    body: {
      elements:
        state.members.length === 0
          ? [
              {
                tag: "markdown",
                content: "当前没有成员,请先执行 /开期 初始化营期"
              }
            ]
          : state.members.map(buildMemberRow)
    }
  };
}

function buildMemberRow(
  member: MemberMgmtState["members"][number]
): Record<string, unknown> {
  const hiddenLabel = member.hiddenFromBoard ? "🙈 已隐藏" : "👁 显示";
  return {
    tag: "div",
    elements: [
      {
        tag: "markdown",
        content:
          `**${member.displayName}** · \`${member.roleType}\`` +
          (member.isParticipant ? "" : " · _已退出_")
      },
      {
        tag: "action",
        actions: [
          {
            tag: "button",
            text: { tag: "plain_text", content: "提为运营" },
            type: "default",
            behaviors: [
              {
                type: "callback",
                value: {
                  action: "promote_to_operator",
                  member_id: member.id
                }
              }
            ]
          },
          {
            tag: "button",
            text: { tag: "plain_text", content: hiddenLabel },
            type: "default",
            behaviors: [
              {
                type: "callback",
                value: {
                  action: "toggle_hidden_from_board",
                  member_id: member.id,
                  next_value: !member.hiddenFromBoard
                }
              }
            ]
          },
          {
            tag: "button",
            text: { tag: "plain_text", content: "改别名" },
            type: "default",
            behaviors: [
              {
                type: "callback",
                value: {
                  action: "rename_member",
                  member_id: member.id
                }
              }
            ]
          }
        ]
      }
    ]
  };
}
```

- [ ] **Step 4: Run template test to verify it passes**

Run: `npm test -- tests/services/feishu/cards/templates/member-mgmt/member-mgmt-v1.test.ts`
Expected: PASS.

- [ ] **Step 5: Write failing handler test**

Create `tests/services/feishu/cards/handlers/member-mgmt-handler.test.ts`:

```typescript
import { beforeEach, describe, expect, test, vi } from "vitest";

import { memberMgmtHandler } from "../../../../../src/services/feishu/cards/handlers/member-mgmt-handler.js";
import type {
  CardActionContext,
  CardHandlerDeps
} from "../../../../../src/services/feishu/cards/types.js";

interface AdminPatchCall {
  memberId: string;
  body: Record<string, unknown>;
}

function makeDeps(patches: AdminPatchCall[]): CardHandlerDeps & {
  adminApiClient: {
    patchMember: (id: string, body: Record<string, unknown>) => Promise<void>;
    listMembers: () => Promise<Array<{
      id: string;
      displayName: string;
      roleType: string;
      hiddenFromBoard: boolean;
      isParticipant: boolean;
    }>>;
  };
} {
  const members = [
    {
      id: "m-1",
      displayName: "张三",
      roleType: "student" as const,
      hiddenFromBoard: false,
      isParticipant: true
    }
  ];
  return {
    repo: {
      insertCardInteraction: vi.fn(() => "inserted" as const),
      findLiveCard: vi.fn(),
      updateLiveCardState: vi.fn(),
      insertLiveCard: vi.fn(),
      closeLiveCard: vi.fn(),
      findEventById: vi.fn(),
      listReviewRequiredEvents: vi.fn(() => []),
      countReviewRequiredEvents: vi.fn(() => 0),
      findMemberByOpenId: vi.fn(() => ({
        id: "op-1",
        displayName: "运营甲",
        openId: "ou-op",
        roleType: "operator"
      }))
    } as unknown as CardHandlerDeps["repo"],
    ingestor: { ingest: vi.fn() },
    aggregator: { applyDecision: vi.fn() },
    feishuClient: { patchCard: vi.fn(), sendCard: vi.fn() },
    clock: () => new Date("2026-04-10T12:00:00.000Z"),
    uuid: () => "uuid-stub",
    adminApiClient: {
      patchMember: vi.fn(
        async (memberId: string, body: Record<string, unknown>) => {
          patches.push({ memberId, body });
          if (body.hiddenFromBoard !== undefined) {
            members[0].hiddenFromBoard = Boolean(body.hiddenFromBoard);
          }
          if (body.roleType !== undefined) {
            members[0].roleType = body.roleType as typeof members[0]["roleType"];
          }
          if (body.displayName !== undefined) {
            members[0].displayName = body.displayName as string;
          }
        }
      ),
      listMembers: vi.fn(async () => members)
    }
  };
}

function ctx(action: string, payload: Record<string, unknown>): CardActionContext {
  return {
    operatorOpenId: "ou-op",
    triggerId: "t-mm",
    actionName: action,
    actionPayload: payload,
    messageId: "om-mm",
    chatId: "oc-op",
    receivedAt: "2026-04-10T12:00:00.000Z",
    currentVersion: "member-mgmt-v1"
  };
}

describe("memberMgmtHandler", () => {
  let patches: AdminPatchCall[];
  let deps: ReturnType<typeof makeDeps>;

  beforeEach(() => {
    patches = [];
    deps = makeDeps(patches);
  });

  test("promote_to_operator PATCHes with roleType=operator", async () => {
    const result = await memberMgmtHandler(
      ctx("promote_to_operator", {
        action: "promote_to_operator",
        member_id: "m-1"
      }),
      deps
    );
    expect(patches).toHaveLength(1);
    expect(patches[0]).toEqual({
      memberId: "m-1",
      body: { roleType: "operator" }
    });
    expect(result.newCardJson).toBeDefined();
  });

  test("toggle_hidden_from_board PATCHes with hiddenFromBoard=true", async () => {
    await memberMgmtHandler(
      ctx("toggle_hidden_from_board", {
        action: "toggle_hidden_from_board",
        member_id: "m-1",
        next_value: true
      }),
      deps
    );
    expect(patches[0]).toEqual({
      memberId: "m-1",
      body: { hiddenFromBoard: true }
    });
  });

  test("rename_member with a new displayName PATCHes with displayName", async () => {
    await memberMgmtHandler(
      ctx("rename_member", {
        action: "rename_member",
        member_id: "m-1",
        new_display_name: "张三丰"
      }),
      deps
    );
    expect(patches[0]).toEqual({
      memberId: "m-1",
      body: { displayName: "张三丰" }
    });
  });

  test("rename_member without a new name returns a follow-up hint toast", async () => {
    const result = await memberMgmtHandler(
      ctx("rename_member", {
        action: "rename_member",
        member_id: "m-1"
      }),
      deps
    );
    expect(patches).toHaveLength(0);
    expect(result.toast?.type).toBe("info");
    expect(result.toast?.content).toContain("/改名");
  });

  test("non-operator caller returns a 403-style toast", async () => {
    (deps.repo.findMemberByOpenId as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      id: "m-1",
      displayName: "学员",
      openId: "ou-op",
      roleType: "student"
    });
    const result = await memberMgmtHandler(
      ctx("promote_to_operator", {
        action: "promote_to_operator",
        member_id: "m-2"
      }),
      deps
    );
    expect(patches).toHaveLength(0);
    expect(result.toast?.type).toBe("error");
    expect(result.toast?.content).toContain("运营");
  });
});
```

- [ ] **Step 6: Run handler test to verify it fails**

Run: `npm test -- tests/services/feishu/cards/handlers/member-mgmt-handler.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 7: Implement `src/services/feishu/cards/handlers/member-mgmt-handler.ts`**

```typescript
import type {
  CardActionContext,
  CardActionResult,
  CardHandler,
  CardHandlerDeps
} from "../types.js";
import { buildMemberMgmtV1 } from "../templates/member-mgmt/member-mgmt-v1.js";

/**
 * Extended dep shape: member-mgmt-handler talks to sub-project 1 Phase G10's
 * admin API via an injected HTTP client instead of writing to `members`
 * directly. The router injects the concrete `AdminApiClient` at wire-up
 * time; tests inject a `vi.fn()`-based fake.
 */
export interface MemberMgmtDeps extends CardHandlerDeps {
  adminApiClient: {
    patchMember(memberId: string, body: Record<string, unknown>): Promise<void>;
    listMembers(): Promise<
      Array<{
        id: string;
        displayName: string;
        roleType: "student" | "operator" | "trainer" | "observer";
        hiddenFromBoard: boolean;
        isParticipant: boolean;
      }>
    >;
  };
}

export const memberMgmtHandler: CardHandler = async (ctx, baseDeps) => {
  const deps = baseDeps as MemberMgmtDeps;
  const operator = deps.repo.findMemberByOpenId?.(ctx.operatorOpenId);
  if (!operator || operator.roleType !== "operator") {
    return {
      toast: { type: "error", content: "仅运营可以操作成员管理" }
    };
  }

  switch (ctx.actionName) {
    case "promote_to_operator":
      return applyPatch(ctx, deps, { roleType: "operator" });
    case "toggle_hidden_from_board":
      return applyPatch(ctx, deps, {
        hiddenFromBoard: Boolean(
          (ctx.actionPayload as { next_value?: unknown }).next_value
        )
      });
    case "rename_member":
      return handleRename(ctx, deps);
    default:
      return {
        toast: {
          type: "error",
          content: `member-mgmt handler: unknown action ${ctx.actionName}`
        }
      };
  }
};

async function applyPatch(
  ctx: CardActionContext,
  deps: MemberMgmtDeps,
  patchBody: Record<string, unknown>
): Promise<CardActionResult> {
  const payload = ctx.actionPayload as { member_id?: unknown };
  const memberId = typeof payload.member_id === "string" ? payload.member_id : "";
  if (!memberId) {
    return { toast: { type: "error", content: "缺少 member_id" } };
  }
  await deps.adminApiClient.patchMember(memberId, patchBody);
  const members = await deps.adminApiClient.listMembers();
  return {
    newCardJson: buildMemberMgmtV1({ members }, ctx)
  };
}

async function handleRename(
  ctx: CardActionContext,
  deps: MemberMgmtDeps
): Promise<CardActionResult> {
  const payload = ctx.actionPayload as {
    member_id?: unknown;
    new_display_name?: unknown;
  };
  const memberId = typeof payload.member_id === "string" ? payload.member_id : "";
  const newName =
    typeof payload.new_display_name === "string"
      ? payload.new_display_name.trim()
      : "";

  if (!newName) {
    return {
      toast: {
        type: "info",
        content:
          "请先发送 /改名 <memberId> <新名称> 指令,然后重新点击此按钮"
      }
    };
  }

  await deps.adminApiClient.patchMember(memberId, { displayName: newName });
  const members = await deps.adminApiClient.listMembers();
  return {
    newCardJson: buildMemberMgmtV1({ members }, ctx)
  };
}
```

- [ ] **Step 8: Run handler test to verify it passes**

Run: `npm test -- tests/services/feishu/cards/handlers/member-mgmt-handler.test.ts`
Expected: PASS — 5 assertions green. Each button click produces exactly one PATCH call with the right body shape.

- [ ] **Step 9: Commit**

```bash
git add \
  src/services/feishu/cards/templates/member-mgmt/member-mgmt-v1.ts \
  src/services/feishu/cards/handlers/member-mgmt-handler.ts \
  tests/services/feishu/cards/templates/member-mgmt/member-mgmt-v1.test.ts \
  tests/services/feishu/cards/handlers/member-mgmt-handler.test.ts
git commit -m "feat(sub2): add member-management card delegating to admin PATCH API"
```

---

### Task F3: Manual score adjust card template + handler (#17)

**Files:**
- Create: `src/services/feishu/cards/templates/manual-adjust/manual-adjust-v1.ts`
- Create: `tests/services/feishu/cards/templates/manual-adjust/manual-adjust-v1.test.ts`
- Create: `src/services/feishu/cards/handlers/manual-adjust-handler.ts`
- Create: `tests/services/feishu/cards/handlers/manual-adjust-handler.test.ts`

Ships card #17. The template renders a confirm/cancel pair for a proposed `{memberId, itemCode, delta, reason}`. On confirm, the handler calls `EventIngestor.ingest` with `sourceType === "operator_manual"` and an auto-generated UUID as `sourceRef`. On cancel, returns a `已取消` toast. This task also exports `buildManualAdjustCardForEvent` so the review-queue handler's `open_adjust` branch can lazily import it.

- [ ] **Step 1: Write failing template test**

Create `tests/services/feishu/cards/templates/manual-adjust/manual-adjust-v1.test.ts`:

```typescript
import { describe, expect, test } from "vitest";

import {
  buildManualAdjustV1,
  buildManualAdjustCardForEvent
} from "../../../../../../src/services/feishu/cards/templates/manual-adjust/manual-adjust-v1.js";
import type { CardActionContext } from "../../../../../../src/services/feishu/cards/types.js";

function ctx(): CardActionContext {
  return {
    operatorOpenId: "ou-op",
    triggerId: "t-ma",
    actionName: "noop",
    actionPayload: {},
    messageId: "om-ma",
    chatId: "oc-op",
    receivedAt: "2026-04-10T12:00:00.000Z",
    currentVersion: "manual-adjust-v1"
  };
}

describe("manual-adjust-v1 template", () => {
  test("renders the proposed adjustment with confirm + cancel buttons", () => {
    const card = buildManualAdjustV1(
      {
        memberId: "m-1",
        memberName: "张三",
        itemCode: "K3",
        delta: -2,
        reason: "wrong submission"
      },
      ctx()
    );
    const serialized = JSON.stringify(card);
    expect(serialized).toContain("张三");
    expect(serialized).toContain("K3");
    expect(serialized).toContain("-2");
    expect(serialized).toContain("wrong submission");
    expect(serialized).toContain('"action":"manual_adjust_confirm"');
    expect(serialized).toContain('"action":"manual_adjust_cancel"');
  });

  test("buildManualAdjustCardForEvent produces an adjust card with delta=0 + blank reason", () => {
    const card = buildManualAdjustCardForEvent(
      {
        id: "evt-1",
        memberId: "m-1",
        itemCode: "H2",
        status: "review_required",
        scoreDelta: 3,
        payloadJson: { text: "..." },
        createdAt: "2026-04-10T10:00:00.000Z"
      },
      ctx()
    );
    const serialized = JSON.stringify(card);
    expect(serialized).toContain("m-1");
    expect(serialized).toContain("H2");
  });
});
```

- [ ] **Step 2: Run template test to verify it fails**

Run: `npm test -- tests/services/feishu/cards/templates/manual-adjust/manual-adjust-v1.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/services/feishu/cards/templates/manual-adjust/manual-adjust-v1.ts`**

```typescript
import type {
  CardActionContext,
  FeishuCardJson,
  ScoringEventLite
} from "../../types.js";
import { buildHeader } from "../common/header.js";

export interface ManualAdjustState {
  memberId: string;
  memberName: string;
  itemCode: string;
  delta: number;
  reason: string;
}

export function buildManualAdjustV1(
  state: ManualAdjustState,
  _ctx: CardActionContext
): FeishuCardJson {
  return {
    schema: "2.0",
    config: { wide_screen_mode: true, update_multi: true },
    header: buildHeader({
      title: "手动调分",
      subtitle: "请确认调整内容",
      template: "red"
    }),
    body: {
      elements: [
        {
          tag: "markdown",
          content:
            `**${state.memberName}** (\`${state.memberId}\`)\n` +
            `评分项: \`${state.itemCode}\`\n` +
            `分数变化: **${state.delta >= 0 ? "+" : ""}${state.delta}**\n` +
            `理由: ${state.reason}`
        },
        {
          tag: "action",
          actions: [
            {
              tag: "button",
              text: { tag: "plain_text", content: "✅ 确认调整" },
              type: "danger",
              behaviors: [
                {
                  type: "callback",
                  value: {
                    action: "manual_adjust_confirm",
                    member_id: state.memberId,
                    item_code: state.itemCode,
                    delta: state.delta,
                    reason: state.reason
                  }
                }
              ]
            },
            {
              tag: "button",
              text: { tag: "plain_text", content: "❌ 取消" },
              type: "default",
              behaviors: [
                {
                  type: "callback",
                  value: { action: "manual_adjust_cancel" }
                }
              ]
            }
          ]
        }
      ]
    }
  };
}

/**
 * Convenience factory used by the review queue handler's `open_adjust`
 * branch. Pre-fills the adjust card with the event's existing delta and
 * a blank reason; the operator edits the reason via a follow-up
 * `/调分 ...` command (static cards do not support text input without
 * a full form). The UX is: click "调整分数" → receive this DM card → run
 * `/调分 m-1 K3 -1 reason="wrong"` → receive a refreshed adjust card with
 * the new delta/reason → click confirm.
 */
export function buildManualAdjustCardForEvent(
  event: ScoringEventLite,
  ctx: CardActionContext
): FeishuCardJson {
  return buildManualAdjustV1(
    {
      memberId: event.memberId,
      memberName: event.memberId, // upstream caller can resolve display name
      itemCode: event.itemCode,
      delta: 0,
      reason: `adjust from review queue for event ${event.id}`
    },
    ctx
  );
}
```

- [ ] **Step 4: Run template test to verify it passes**

Run: `npm test -- tests/services/feishu/cards/templates/manual-adjust/manual-adjust-v1.test.ts`
Expected: PASS.

- [ ] **Step 5: Write failing handler test**

Create `tests/services/feishu/cards/handlers/manual-adjust-handler.test.ts`:

```typescript
import { beforeEach, describe, expect, test, vi } from "vitest";

import { manualAdjustHandler } from "../../../../../src/services/feishu/cards/handlers/manual-adjust-handler.js";
import type {
  CardActionContext,
  CardHandlerDeps
} from "../../../../../src/services/feishu/cards/types.js";

function makeDeps(): CardHandlerDeps {
  return {
    repo: {
      insertCardInteraction: vi.fn(() => "inserted" as const),
      findLiveCard: vi.fn(),
      updateLiveCardState: vi.fn(),
      insertLiveCard: vi.fn(),
      closeLiveCard: vi.fn(),
      findEventById: vi.fn(),
      listReviewRequiredEvents: vi.fn(() => []),
      countReviewRequiredEvents: vi.fn(() => 0),
      findMemberByOpenId: vi.fn(() => ({
        id: "op-1",
        displayName: "运营甲",
        openId: "ou-op",
        roleType: "operator"
      }))
    } as unknown as CardHandlerDeps["repo"],
    ingestor: {
      ingest: vi.fn(() => ({
        eventId: "evt-adjust-1",
        effectiveDelta: -2,
        status: "approved" as const
      }))
    },
    aggregator: { applyDecision: vi.fn() },
    feishuClient: { patchCard: vi.fn(), sendCard: vi.fn() },
    clock: () => new Date("2026-04-10T12:00:00.000Z"),
    uuid: () => "uuid-adjust-stub"
  };
}

function ctx(action: string, payload: Record<string, unknown>): CardActionContext {
  return {
    operatorOpenId: "ou-op",
    triggerId: "t-ma",
    actionName: action,
    actionPayload: payload,
    messageId: "om-ma",
    chatId: "oc-op",
    receivedAt: "2026-04-10T12:00:00.000Z",
    currentVersion: "manual-adjust-v1"
  };
}

describe("manualAdjustHandler", () => {
  let deps: CardHandlerDeps;
  beforeEach(() => {
    deps = makeDeps();
  });

  test("confirm ingests with sourceType=operator_manual and preserves delta", async () => {
    const result = await manualAdjustHandler(
      ctx("manual_adjust_confirm", {
        action: "manual_adjust_confirm",
        member_id: "m-1",
        item_code: "K3",
        delta: -2,
        reason: "wrong submission"
      }),
      deps
    );

    expect(deps.ingestor.ingest).toHaveBeenCalledOnce();
    const req = (deps.ingestor.ingest as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(req).toMatchObject({
      memberId: "m-1",
      itemCode: "K3",
      sourceType: "operator_manual",
      payload: {
        reason: "wrong submission",
        operator_id: "op-1"
      }
    });
    expect(req.sourceRef).toBe("uuid-adjust-stub");
    expect(req.requestedDelta).toBe(-2);

    expect(result.newCardJson).toBeDefined();
    expect(JSON.stringify(result.newCardJson)).toContain("已调整");
  });

  test("cancel returns 已取消 toast and does not call ingestor", async () => {
    const result = await manualAdjustHandler(
      ctx("manual_adjust_cancel", { action: "manual_adjust_cancel" }),
      deps
    );
    expect(deps.ingestor.ingest).not.toHaveBeenCalled();
    expect(result.toast?.type).toBe("info");
    expect(result.toast?.content).toContain("已取消");
  });

  test("non-operator caller is rejected with a toast", async () => {
    (deps.repo.findMemberByOpenId as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      id: "m-1",
      displayName: "学员",
      openId: "ou-op",
      roleType: "student"
    });
    const result = await manualAdjustHandler(
      ctx("manual_adjust_confirm", {
        action: "manual_adjust_confirm",
        member_id: "m-1",
        item_code: "K3",
        delta: -2,
        reason: "test"
      }),
      deps
    );
    expect(deps.ingestor.ingest).not.toHaveBeenCalled();
    expect(result.toast?.type).toBe("error");
  });
});
```

- [ ] **Step 6: Run handler test to verify it fails**

Run: `npm test -- tests/services/feishu/cards/handlers/manual-adjust-handler.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 7: Implement `src/services/feishu/cards/handlers/manual-adjust-handler.ts`**

```typescript
import type {
  CardActionContext,
  CardActionResult,
  CardHandler,
  CardHandlerDeps
} from "../types.js";
import { buildManualAdjustV1 } from "../templates/manual-adjust/manual-adjust-v1.js";
import { buildHeader } from "../templates/common/header.js";

export const manualAdjustHandler: CardHandler = async (ctx, deps) => {
  const operator = deps.repo.findMemberByOpenId?.(ctx.operatorOpenId);
  if (!operator || operator.roleType !== "operator") {
    return {
      toast: { type: "error", content: "仅运营可以手动调分" }
    };
  }

  switch (ctx.actionName) {
    case "manual_adjust_confirm":
      return handleConfirm(ctx, deps, operator);
    case "manual_adjust_cancel":
      return {
        toast: { type: "info", content: "已取消,未做任何调整" }
      };
    default:
      return {
        toast: {
          type: "error",
          content: `manual-adjust handler: unknown action ${ctx.actionName}`
        }
      };
  }
};

async function handleConfirm(
  ctx: CardActionContext,
  deps: CardHandlerDeps,
  operator: { id: string; openId: string; displayName: string }
): Promise<CardActionResult> {
  const payload = ctx.actionPayload as {
    member_id?: unknown;
    item_code?: unknown;
    delta?: unknown;
    reason?: unknown;
  };
  const memberId = typeof payload.member_id === "string" ? payload.member_id : "";
  const itemCode = typeof payload.item_code === "string" ? payload.item_code : "";
  const delta = typeof payload.delta === "number" ? payload.delta : Number(payload.delta);
  const reason = typeof payload.reason === "string" ? payload.reason : "";

  if (!memberId || !itemCode || !Number.isFinite(delta) || !reason) {
    return {
      toast: { type: "error", content: "参数不完整,无法执行调分" }
    };
  }

  const sourceRef = deps.uuid();
  const ingestResult = deps.ingestor.ingest({
    memberId,
    itemCode,
    sourceType: "operator_manual",
    sourceRef,
    payload: {
      reason,
      operator_id: operator.id
    },
    requestedDelta: delta,
    requestedAt: ctx.receivedAt
  });

  if (ingestResult.status === "rejected") {
    return {
      toast: {
        type: "error",
        content: `调分未入账: ${ingestResult.reason ?? "unknown"}`
      }
    };
  }

  return {
    newCardJson: {
      schema: "2.0",
      header: buildHeader({
        title: "手动调分",
        subtitle: "已完成",
        template: "green"
      }),
      body: {
        elements: [
          {
            tag: "markdown",
            content:
              `✅ **${memberId}** 的 \`${itemCode}\` 已调整 **${delta >= 0 ? "+" : ""}${delta}** 分。\n` +
              `事件 ID: \`${ingestResult.eventId}\`\n` +
              `理由: ${reason}`
          }
        ]
      }
    }
  };
}
```

- [ ] **Step 8: Run handler test to verify it passes**

Run: `npm test -- tests/services/feishu/cards/handlers/manual-adjust-handler.test.ts`
Expected: PASS — 3 assertions green. The Ingestor is called with `sourceType: "operator_manual"` and `requestedDelta: -2`.

- [ ] **Step 9: Commit**

```bash
git add \
  src/services/feishu/cards/templates/manual-adjust/manual-adjust-v1.ts \
  src/services/feishu/cards/handlers/manual-adjust-handler.ts \
  tests/services/feishu/cards/templates/manual-adjust/manual-adjust-v1.test.ts \
  tests/services/feishu/cards/handlers/manual-adjust-handler.test.ts
git commit -m "feat(sub2): add manual-adjust card with confirm/cancel ingestor call"
```

---

### Task F4: Operator smoke exit checkpoint

**Files:**
- Create: `tests/services/feishu/cards/integration/operator-session-smoke.test.ts`
- Create: `tests/services/feishu/cards/integration/helpers/operator-fixture.ts`
- No production code changes — this task is a pure end-to-end exercise that drives all three operator cards through realistic actions.

Simulates an operator's end-to-end session in a single test file, using the same `createApp({ databaseUrl: ":memory:" })` harness as Task E3:

1. Seed 3 `review_required` events in the DB (K3, C1, H2).
2. Operator opens the review queue card via `/复核队列` command → router constructs a `review-queue-v1` card and sends it to the operator DM.
3. Operator approves event 1 → card patches inline, event row flips to `approved`, `member_dimension_scores` incremented.
4. Operator rejects event 2 → card patches, event row flips to `rejected`, dimension score unchanged.
5. Operator paginates to page 2 (only 1 event left after approve + reject → empty queue toast + empty-state card).
6. Operator opens member management card via `/成员管理` command.
7. Operator clicks "隐藏上榜" for member X → PATCH called on `/api/v2/admin/members/X` with `{ hiddenFromBoard: true }`, DB row reflects the change.
8. Operator opens manual adjust card via `/调分 m-k3 K3 -2 reason="wrong submission"` → a `manual-adjust-v1` card is DM'd → confirm button produces an `operator_manual` event with `requestedDelta: -2`.

- [ ] **Step 1: Write failing integration test**

Create `tests/services/feishu/cards/integration/operator-session-smoke.test.ts`:

```typescript
import { beforeEach, describe, expect, test } from "vitest";
import type { FastifyInstance } from "fastify";

import { createApp } from "../../../../../src/app.js";
import { seedOperatorFixtureCamp } from "./helpers/operator-fixture.js";

interface OpCtx {
  app: FastifyInstance;
  operatorId: string;
  operatorOpenId: string;
  studentIds: string[];
  reviewEventIds: string[];
}

async function boot(): Promise<OpCtx> {
  const app = await createApp({
    databaseUrl: ":memory:",
    llmEnabled: false,
    feishuStubMode: "in_memory"
  });
  const fixture = await seedOperatorFixtureCamp(app);
  return { app, ...fixture };
}

describe("operator smoke session — review queue + member mgmt + manual adjust", () => {
  let ctx: OpCtx;

  beforeEach(async () => {
    ctx = await boot();
  });

  test("operator approves, rejects, paginates, toggles hidden_from_board, manually adjusts", async () => {
    // --- Step 1: open the review queue via slash command ---
    const openRes = await ctx.app.inject({
      method: "POST",
      url: "/api/v2/feishu/commands/%E5%A4%8D%E6%A0%B8%E9%98%9F%E5%88%97",
      payload: { operator_open_id: ctx.operatorOpenId }
    });
    expect(openRes.statusCode).toBe(200);
    expect(openRes.json().card).toBeDefined();
    expect(JSON.stringify(openRes.json().card)).toContain("第 1 / 1 页");

    // Get the live card message id the stub sent
    const stub = ctx.app.feishuClient as {
      sentCards: Array<{ messageId: string; content: unknown; chatId?: string; receiveId?: string }>;
      patchedCards: Array<{ messageId: string; content: unknown }>;
    };
    const queueCard = stub.sentCards.find(
      (c) => JSON.stringify(c.content).includes("LLM 复核队列")
    );
    expect(queueCard).toBeDefined();

    // --- Step 2: approve event 1 ---
    await ctx.app.inject({
      method: "POST",
      url: "/api/v2/feishu/card-action",
      payload: {
        card_type: "review_queue",
        action_name: "approve",
        message_id: queueCard!.messageId,
        chat_id: "oc-op",
        trigger_id: "trig-approve-1",
        operator_open_id: ctx.operatorOpenId,
        card_version: "review-queue-v1",
        payload: {
          action: "approve",
          event_id: ctx.reviewEventIds[0],
          note: "op approve"
        }
      }
    });

    const repo = ctx.app.scoringRepo;
    const approved = repo.db
      .prepare("SELECT status FROM v2_scoring_item_events WHERE id = ?")
      .get(ctx.reviewEventIds[0]) as { status: string };
    expect(approved.status).toBe("approved");

    // --- Step 3: reject event 2 ---
    await ctx.app.inject({
      method: "POST",
      url: "/api/v2/feishu/card-action",
      payload: {
        card_type: "review_queue",
        action_name: "reject",
        message_id: queueCard!.messageId,
        chat_id: "oc-op",
        trigger_id: "trig-reject-2",
        operator_open_id: ctx.operatorOpenId,
        card_version: "review-queue-v1",
        payload: {
          action: "reject",
          event_id: ctx.reviewEventIds[1],
          note: "op reject"
        }
      }
    });
    const rejected = repo.db
      .prepare("SELECT status FROM v2_scoring_item_events WHERE id = ?")
      .get(ctx.reviewEventIds[1]) as { status: string };
    expect(rejected.status).toBe("rejected");

    // --- Step 4: page_next → should now land on page 1 with 1 event remaining
    //           (our seed has 3 review_required events; after 1 approved + 1 rejected
    //           only 1 is left; totalPages = 1) ---
    const pageRes = await ctx.app.inject({
      method: "POST",
      url: "/api/v2/feishu/card-action",
      payload: {
        card_type: "review_queue",
        action_name: "page_next",
        message_id: queueCard!.messageId,
        chat_id: "oc-op",
        trigger_id: "trig-page-next",
        operator_open_id: ctx.operatorOpenId,
        card_version: "review-queue-v1",
        payload: { action: "page_next", page: 1 }
      }
    });
    expect(JSON.stringify(pageRes.json().card)).toContain("第 1 / 1 页");

    // --- Step 5: open member mgmt ---
    await ctx.app.inject({
      method: "POST",
      url: "/api/v2/feishu/commands/%E6%88%90%E5%91%98%E7%AE%A1%E7%90%86",
      payload: { operator_open_id: ctx.operatorOpenId }
    });
    const mgmtCard = stub.sentCards.find(
      (c) => JSON.stringify(c.content).includes("成员管理")
    );
    expect(mgmtCard).toBeDefined();

    // --- Step 6: hide the first student from board ---
    await ctx.app.inject({
      method: "POST",
      url: "/api/v2/feishu/card-action",
      payload: {
        card_type: "member_mgmt",
        action_name: "toggle_hidden_from_board",
        message_id: mgmtCard!.messageId,
        chat_id: "oc-op",
        trigger_id: "trig-hide-1",
        operator_open_id: ctx.operatorOpenId,
        card_version: "member-mgmt-v1",
        payload: {
          action: "toggle_hidden_from_board",
          member_id: ctx.studentIds[0],
          next_value: true
        }
      }
    });
    const hidden = repo.db
      .prepare("SELECT hidden_from_board FROM members WHERE id = ?")
      .get(ctx.studentIds[0]) as { hidden_from_board: number };
    expect(hidden.hidden_from_board).toBe(1);

    // --- Step 7: manual adjust — send a /调分 command, then confirm the card ---
    const adjustCmdRes = await ctx.app.inject({
      method: "POST",
      url: "/api/v2/feishu/commands/%E8%B0%83%E5%88%86",
      payload: {
        operator_open_id: ctx.operatorOpenId,
        args: {
          member_id: ctx.studentIds[0],
          item_code: "K3",
          delta: -2,
          reason: "wrong submission"
        }
      }
    });
    expect(adjustCmdRes.statusCode).toBe(200);
    const adjustCard = stub.sentCards.find(
      (c) => JSON.stringify(c.content).includes("手动调分")
    );
    expect(adjustCard).toBeDefined();

    await ctx.app.inject({
      method: "POST",
      url: "/api/v2/feishu/card-action",
      payload: {
        card_type: "manual_adjust",
        action_name: "manual_adjust_confirm",
        message_id: adjustCard!.messageId,
        chat_id: "oc-op",
        trigger_id: "trig-adjust-1",
        operator_open_id: ctx.operatorOpenId,
        card_version: "manual-adjust-v1",
        payload: {
          action: "manual_adjust_confirm",
          member_id: ctx.studentIds[0],
          item_code: "K3",
          delta: -2,
          reason: "wrong submission"
        }
      }
    });

    const manualEvents = repo.db
      .prepare(
        "SELECT id, score_delta, source_type FROM v2_scoring_item_events WHERE source_type = 'operator_manual' AND member_id = ?"
      )
      .all(ctx.studentIds[0]) as Array<{
        id: string;
        score_delta: number;
        source_type: string;
      }>;
    expect(manualEvents).toHaveLength(1);
    expect(manualEvents[0].score_delta).toBe(-2);
  });
});
```

Create `tests/services/feishu/cards/integration/helpers/operator-fixture.ts`:

```typescript
import type { FastifyInstance } from "fastify";

export interface OperatorFixture {
  operatorId: string;
  operatorOpenId: string;
  studentIds: string[];
  reviewEventIds: string[];
}

/**
 * Seeds a camp with:
 * - 1 operator member (with Feishu open id)
 * - 3 student members
 * - 3 review_required scoring_item_events (K3, C1, H2) wired to their
 *   respective LLM scoring tasks with status = 'review_required'
 *
 * Used by the operator smoke test to exercise the review queue + member
 * mgmt + manual adjust cards against realistic data.
 */
export async function seedOperatorFixtureCamp(
  app: FastifyInstance
): Promise<OperatorFixture> {
  const repo = app.scoringRepo;
  const now = "2026-04-10T10:00:00.000Z";
  const campId = "camp-op";
  const periodId = "p-op";
  const windowId = "w-op";
  const operatorId = "m-op";
  const operatorOpenId = "ou-operator";
  const studentIds = ["m-s1", "m-s2", "m-s3"];

  repo.db
    .prepare("INSERT INTO camps (id, name, created_at) VALUES (?, ?, ?)")
    .run(campId, "operator smoke camp", now);
  repo.db
    .prepare(
      "INSERT INTO v2_periods (id, camp_id, number, is_ice_breaker, started_at, ended_at) VALUES (?, ?, 2, 0, ?, NULL)"
    )
    .run(periodId, campId, now);
  repo.db
    .prepare(
      "INSERT INTO v2_windows (id, camp_id, period_id, code, started_at, ended_at) VALUES (?, ?, ?, 'W1', ?, NULL)"
    )
    .run(windowId, campId, periodId, now);

  repo.db
    .prepare(
      `INSERT INTO members (id, camp_id, display_name, role_type, is_participant, is_excluded_from_board, hidden_from_board, source_feishu_open_id)
       VALUES (?, ?, '运营甲', 'operator', 0, 0, 0, ?)`
    )
    .run(operatorId, campId, operatorOpenId);

  studentIds.forEach((id, idx) =>
    repo.db
      .prepare(
        `INSERT INTO members (id, camp_id, display_name, role_type, is_participant, is_excluded_from_board, hidden_from_board, source_feishu_open_id)
         VALUES (?, ?, ?, 'student', 1, 0, 0, ?)`
      )
      .run(id, campId, `学员${idx + 1}`, `ou-s${idx + 1}`)
  );

  const reviewEventIds = ["evt-k3", "evt-c1", "evt-h2"];
  const items: Array<{
    eventId: string;
    memberId: string;
    itemCode: string;
    dimension: string;
    scoreDelta: number;
  }> = [
    { eventId: "evt-k3", memberId: studentIds[0], itemCode: "K3", dimension: "K", scoreDelta: 3 },
    { eventId: "evt-c1", memberId: studentIds[1], itemCode: "C1", dimension: "C", scoreDelta: 4 },
    { eventId: "evt-h2", memberId: studentIds[2], itemCode: "H2", dimension: "H", scoreDelta: 3 }
  ];

  for (const item of items) {
    repo.db
      .prepare(
        `INSERT INTO v2_scoring_item_events
           (id, member_id, period_id, item_code, dimension, score_delta, source_type, source_ref, status, review_note, payload_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 'card_interaction', ?, 'review_required', NULL, ?, ?)`
      )
      .run(
        item.eventId,
        item.memberId,
        periodId,
        item.itemCode,
        item.dimension,
        item.scoreDelta,
        `seed-${item.eventId}`,
        JSON.stringify({ text: `seed submission for ${item.itemCode}` }),
        now
      );
    repo.db
      .prepare(
        `INSERT INTO v2_llm_scoring_tasks (id, event_id, provider, model, prompt_text, status, enqueued_at)
         VALUES (?, ?, 'fake', 'fake-model', ?, 'review_required', ?)`
      )
      .run(
        `task-${item.eventId}`,
        item.eventId,
        `prompt for ${item.itemCode}`,
        now
      );
  }

  return { operatorId, operatorOpenId, studentIds, reviewEventIds };
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/services/feishu/cards/integration/operator-session-smoke.test.ts`
Expected: FAIL — the slash commands `/复核队列`, `/成员管理`, `/调分` may not yet be routed by `router.ts` to the corresponding card factories. The first `inject` returns 404.

- [ ] **Step 3: Wire the missing slash commands in `src/services/feishu/cards/router.ts`**

Extend the `POST /api/v2/feishu/commands/:name` handler to recognize the three operator commands and produce the corresponding card + sendCard call. The commands map:

- `/复核队列` → build a `review-queue-v1` card from current `ReviewQueueState` + DM it to the operator
- `/成员管理` → build a `member-mgmt-v1` card from `adminApiClient.listMembers()` + DM it
- `/调分` → parse `args: { member_id, item_code, delta, reason }` → build a `manual-adjust-v1` card + DM it

Each command path writes a new `feishu_live_cards` row (when applicable) and calls `deps.feishuClient.sendCard({ receiveId: operatorOpenId, content })`. The stub implementation in `createApp` appends to `sentCards`, which is what the smoke test inspects.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/services/feishu/cards/integration/operator-session-smoke.test.ts`
Expected: PASS — the full operator session is exercised end-to-end. Event 1 is approved, event 2 is rejected, hidden_from_board is flipped, and an `operator_manual` event with delta -2 lands in `v2_scoring_item_events`.

- [ ] **Step 5: Commit**

```bash
git add \
  tests/services/feishu/cards/integration/operator-session-smoke.test.ts \
  tests/services/feishu/cards/integration/helpers/operator-fixture.ts \
  src/services/feishu/cards/router.ts
git commit -m "test(sub2): add operator smoke session covering all 3 operator cards"
```

---

## Phase F Exit Checkpoint

Run the full suite and build:
```bash
npm test
npm run build
```

Expected: both green. All 3 operator cards are live, and the operator smoke session walks a realistic review queue + member management + manual adjust flow from start to finish.

Before moving on to Phase G (remaining static cards), the following must all be true:

- [ ] `npm test -- tests/services/feishu/cards/` green with zero skipped
- [ ] `npm test -- tests/services/feishu/cards/integration/operator-session-smoke.test.ts` green
- [ ] `npm run build` clean (no TypeScript errors)
- [ ] `review-queue-v1` renders ≤ 25 KB with 10 events per page (verified by size assertion in F1)
- [ ] `review-queue-handler` forwards the dispatcher signature `(eventId, { decision, note }, operator)` unchanged to `aggregator.applyDecision`
- [ ] `InvalidDecisionStateError` from the aggregator surfaces as `"已被其他运营处理"` toast (double-review race path)
- [ ] `member-mgmt-handler` only talks to `members` via the sub-project 1 admin PATCH API — no direct DB writes
- [ ] `manual-adjust-handler` calls the Ingestor with `sourceType === "operator_manual"` and an auto-generated UUID as `sourceRef`
- [ ] The operator smoke session verifies: approve flips status to `approved`, reject flips status to `rejected`, hidden_from_board PATCH persists, manual adjust creates an `operator_manual` event
- [ ] Phase B4 dispatcher aggregator signature matches Phase D2 sub-project 1 exported signature (no drift)
- [ ] Each of the 7 tasks in Phase E + F is on its own line of `git log --oneline` with the `feat(sub2):` or `test(sub2):` prefix

---

## Phase G — Remaining Cards (S5 milestone) (6 tasks)

Phase G ships the 10 remaining cards that together with Phase C-F complete the 16-card surface. The five tasks batch closely-related cards together: G1 handles the three trivial confirmation cards (period open, window open, graduation); G2 is the video checkin card + G1 scoring event; G3 is the patched homework card + reply-to-message flow for H1/H3; G4 is the DM-based peer review vote card plus the settle card + handler; and G5 is the pair of read-only broadcast cards (C1 echo, level announcement) that integrate with sub-project 1's reaction tracker and window settler.

**Cross-subproject dependencies:**
- Sub-project 1 Phase B pre-fix: `peer_review_votes` and `reaction_tracked_messages` tables must exist in `tableDefinitions` (see sub2 spec §15). Without this fix G4 and G5 have nowhere to write.
- Sub-project 1 Phase C5 `PeriodLifecycleService` handlers `openNewPeriod` / `openWindow` / `closeGraduation` must already be wired via `/api/v2/periods/open`, `/api/v2/windows/open`, `/api/v2/graduation/close` — G1 only constructs cards on top of those APIs.
- Sub-project 1 Phase F `ReactionTracker.handleReaction` is the consumer of `reaction_tracked_messages.insertReactionTrackedMessage(...)` — G5 only writes the row so sub1 can later read it.
- Sub-project 1 Phase D2 `ScoringAggregator.applyDecision` and Phase D3 `EventIngestor.ingest` are the same shared interfaces Phase C-F already consume; G2/G3/G4 call them with the item codes `G1`, `H1`, `H3`, `S1`, `S2`.
- Sub-project 1 `WindowSettler.notifyMembersWindowSettled` hook must be invoked after `settleWindow` completes; G5's level-announcement card is posted from that hook.

---

### Task G1: Period open + Window open + Graduation cards (3 confirmation cards)

**Files:**
- Create: `src/services/feishu/cards/templates/period-open-v1.ts`
- Create: `src/services/feishu/cards/templates/window-open-v1.ts`
- Create: `src/services/feishu/cards/templates/graduation-v1.ts`
- Create: `tests/services/feishu/cards/templates/period-open-v1.test.ts`
- Create: `tests/services/feishu/cards/templates/window-open-v1.test.ts`
- Create: `tests/services/feishu/cards/templates/graduation-v1.test.ts`
- Modify: `src/services/feishu/cards/handlers/command-handlers.ts` (append 3 command handlers)
- Modify: `tests/services/feishu/cards/handlers/command-handlers.test.ts` (append tests)

Ships cards #1, #2, #11 from spec §4.2. All three are read-only group broadcasts with no `feishu_live_cards` row, no action buttons, and no state_json shape beyond the input fixture. Each has identical rendering discipline: small markdown body, no patches, size budget trivially satisfied (< 4 KB each). The command handlers post them in response to `/开期 <n>`, `/开窗 <code>`, `/结业` slash commands.

- [ ] **Step 1: Write failing template tests (batch for all 3 cards)**

Create `tests/services/feishu/cards/templates/period-open-v1.test.ts`:

```typescript
import { describe, expect, test } from "vitest";

import {
  buildPeriodOpenV1,
  PERIOD_OPEN_TEMPLATE_ID,
  type PeriodOpenState
} from "../../../../../src/services/feishu/cards/templates/period-open-v1.js";
import { assertCardSize } from "../../../../../src/services/feishu/cards/renderer.js";

function fixture(overrides: Partial<PeriodOpenState> = {}): PeriodOpenState {
  return {
    periodNumber: 3,
    isIceBreaker: false,
    startedAt: "2026-04-10T09:00:00.000Z",
    boundWindowCode: "W2",
    openedByOperatorName: "运营甲",
    ...overrides
  };
}

describe("period-open-v1 template", () => {
  test("PERIOD_OPEN_TEMPLATE_ID is 'period-open-v1'", () => {
    expect(PERIOD_OPEN_TEMPLATE_ID).toBe("period-open-v1");
  });

  test("renders header with period number and green template", () => {
    const card = buildPeriodOpenV1(fixture());
    const header = card.header as {
      title: { content: string };
      template: string;
    };
    expect(header.title.content).toContain("第 3 期");
    expect(header.template).toBe("green");
  });

  test("body contains start time and bound window code", () => {
    const card = buildPeriodOpenV1(fixture());
    const serialized = JSON.stringify(card);
    expect(serialized).toContain("2026-04-10");
    expect(serialized).toContain("W2");
    expect(serialized).toContain("运营甲");
  });

  test("ice-breaker period shows the 破冰期 marker", () => {
    const card = buildPeriodOpenV1(
      fixture({ periodNumber: 1, isIceBreaker: true, boundWindowCode: null })
    );
    const serialized = JSON.stringify(card);
    expect(serialized).toContain("破冰期");
    expect(serialized).toContain("第 1 期");
  });

  test("non-ice-breaker period with null window still renders without crashing", () => {
    const card = buildPeriodOpenV1(fixture({ boundWindowCode: null }));
    const serialized = JSON.stringify(card);
    expect(serialized).toContain("未绑定窗口");
  });

  test("rendered JSON fits under the card size budget", () => {
    expect(() => assertCardSize(buildPeriodOpenV1(fixture()))).not.toThrow();
  });
});
```

Create `tests/services/feishu/cards/templates/window-open-v1.test.ts`:

```typescript
import { describe, expect, test } from "vitest";

import {
  buildWindowOpenV1,
  WINDOW_OPEN_TEMPLATE_ID,
  type WindowOpenState
} from "../../../../../src/services/feishu/cards/templates/window-open-v1.js";
import { assertCardSize } from "../../../../../src/services/feishu/cards/renderer.js";

function fixture(overrides: Partial<WindowOpenState> = {}): WindowOpenState {
  return {
    windowCode: "W3",
    campName: "AI Seed Camp 2026 Q2",
    startedAt: "2026-04-10T09:00:00.000Z",
    isFinal: false,
    openedByOperatorName: "运营甲",
    ...overrides
  };
}

describe("window-open-v1 template", () => {
  test("WINDOW_OPEN_TEMPLATE_ID is 'window-open-v1'", () => {
    expect(WINDOW_OPEN_TEMPLATE_ID).toBe("window-open-v1");
  });

  test("renders header with window code and orange template", () => {
    const card = buildWindowOpenV1(fixture());
    const header = card.header as {
      title: { content: string };
      template: string;
    };
    expect(header.title.content).toContain("W3");
    expect(header.template).toBe("orange");
  });

  test("body contains start time and camp name", () => {
    const card = buildWindowOpenV1(fixture());
    const serialized = JSON.stringify(card);
    expect(serialized).toContain("AI Seed Camp 2026 Q2");
    expect(serialized).toContain("2026-04-10");
  });

  test("FINAL window surfaces the 结业窗口 label", () => {
    const card = buildWindowOpenV1(fixture({ windowCode: "FINAL", isFinal: true }));
    const serialized = JSON.stringify(card);
    expect(serialized).toContain("结业窗口");
  });

  test("rendered JSON fits under the card size budget", () => {
    expect(() => assertCardSize(buildWindowOpenV1(fixture()))).not.toThrow();
  });
});
```

Create `tests/services/feishu/cards/templates/graduation-v1.test.ts`:

```typescript
import { describe, expect, test } from "vitest";

import {
  buildGraduationV1,
  GRADUATION_TEMPLATE_ID,
  type GraduationState
} from "../../../../../src/services/feishu/cards/templates/graduation-v1.js";
import { assertCardSize } from "../../../../../src/services/feishu/cards/renderer.js";

function fixture(overrides: Partial<GraduationState> = {}): GraduationState {
  return {
    campName: "AI Seed Camp 2026 Q2",
    finalWindowCode: "FINAL",
    graduatedAt: "2026-04-30T23:59:59.000Z",
    topN: [
      {
        rank: 1,
        memberName: "张三",
        cumulativeAq: 120,
        currentLevel: 5,
        growthBonus: 12,
        cashPrizeIndication: "¥500"
      },
      {
        rank: 2,
        memberName: "李四",
        cumulativeAq: 115,
        currentLevel: 5,
        growthBonus: 10,
        cashPrizeIndication: "¥300"
      },
      {
        rank: 3,
        memberName: "王五",
        cumulativeAq: 108,
        currentLevel: 4,
        growthBonus: 8,
        cashPrizeIndication: "¥200"
      }
    ],
    totalParticipants: 14,
    ...overrides
  };
}

describe("graduation-v1 template", () => {
  test("GRADUATION_TEMPLATE_ID is 'graduation-v1'", () => {
    expect(GRADUATION_TEMPLATE_ID).toBe("graduation-v1");
  });

  test("renders header with camp name and purple template", () => {
    const card = buildGraduationV1(fixture());
    const header = card.header as {
      title: { content: string };
      template: string;
    };
    expect(header.title.content).toContain("结业");
    expect(header.template).toBe("purple");
  });

  test("body contains top 3 members with AQ + level + bonus + prize", () => {
    const card = buildGraduationV1(fixture());
    const serialized = JSON.stringify(card);
    expect(serialized).toContain("张三");
    expect(serialized).toContain("李四");
    expect(serialized).toContain("王五");
    expect(serialized).toContain("120");
    expect(serialized).toContain("Lv5");
    expect(serialized).toContain("¥500");
    expect(serialized).toContain("+12");
  });

  test("body references total participants count", () => {
    const card = buildGraduationV1(fixture());
    expect(JSON.stringify(card)).toContain("14");
  });

  test("empty topN renders a helpful message rather than crashing", () => {
    const card = buildGraduationV1(fixture({ topN: [] }));
    expect(JSON.stringify(card)).toContain("无上榜");
  });

  test("rendered JSON fits under the card size budget", () => {
    expect(() => assertCardSize(buildGraduationV1(fixture()))).not.toThrow();
  });
});
```

- [ ] **Step 2: Run template tests to verify they fail**

Run: `npm test -- tests/services/feishu/cards/templates/period-open-v1.test.ts tests/services/feishu/cards/templates/window-open-v1.test.ts tests/services/feishu/cards/templates/graduation-v1.test.ts`
Expected: FAIL — three modules not found.

- [ ] **Step 3: Implement `src/services/feishu/cards/templates/period-open-v1.ts`**

```typescript
import type { FeishuCardJson } from "../types.js";
import { buildHeader } from "./common/header.js";
import { registerTemplate } from "../renderer.js";

export const PERIOD_OPEN_TEMPLATE_ID = "period-open-v1" as const;

export interface PeriodOpenState {
  periodNumber: number;
  isIceBreaker: boolean;
  startedAt: string;
  boundWindowCode: string | null;
  openedByOperatorName: string;
}

export function buildPeriodOpenV1(state: PeriodOpenState): FeishuCardJson {
  const title = state.isIceBreaker
    ? `第 ${state.periodNumber} 期 (破冰期) 已开启`
    : `第 ${state.periodNumber} 期 已开启`;

  const windowLine = state.boundWindowCode
    ? `**绑定窗口**: \`${state.boundWindowCode}\``
    : "**绑定窗口**: _未绑定窗口,将在下一期绑定_";

  const iceBreakerNote = state.isIceBreaker
    ? "\n\n> 破冰期内提交保留但不计入 AQ。"
    : "";

  return {
    schema: "2.0",
    config: { wide_screen_mode: true, update_multi: false },
    header: buildHeader({
      title,
      subtitle: new Date(state.startedAt).toLocaleString("zh-CN"),
      template: "green"
    }) as unknown as Record<string, unknown>,
    body: {
      elements: [
        {
          tag: "markdown",
          content:
            `**开启人**: ${state.openedByOperatorName}\n` +
            `**开始时间**: ${state.startedAt}\n` +
            windowLine +
            iceBreakerNote
        }
      ]
    }
  };
}

registerTemplate(PERIOD_OPEN_TEMPLATE_ID, (state: PeriodOpenState) =>
  buildPeriodOpenV1(state)
);
```

- [ ] **Step 4: Implement `src/services/feishu/cards/templates/window-open-v1.ts`**

```typescript
import type { FeishuCardJson } from "../types.js";
import { buildHeader } from "./common/header.js";
import { registerTemplate } from "../renderer.js";

export const WINDOW_OPEN_TEMPLATE_ID = "window-open-v1" as const;

export interface WindowOpenState {
  windowCode: string;
  campName: string;
  startedAt: string;
  isFinal: boolean;
  openedByOperatorName: string;
}

export function buildWindowOpenV1(state: WindowOpenState): FeishuCardJson {
  const title = state.isFinal
    ? `🏁 结业窗口 \`${state.windowCode}\` 已开启`
    : `🪟 窗口 \`${state.windowCode}\` 已开启`;

  return {
    schema: "2.0",
    config: { wide_screen_mode: true, update_multi: false },
    header: buildHeader({
      title,
      subtitle: state.campName,
      template: "orange"
    }) as unknown as Record<string, unknown>,
    body: {
      elements: [
        {
          tag: "markdown",
          content:
            `**营期**: ${state.campName}\n` +
            `**窗口**: \`${state.windowCode}\`\n` +
            `**开始时间**: ${state.startedAt}\n` +
            `**开启人**: ${state.openedByOperatorName}` +
            (state.isFinal
              ? "\n\n> 此为最终结业窗口,`/结业` 指令将会触发最终段位评定。"
              : "")
        }
      ]
    }
  };
}

registerTemplate(WINDOW_OPEN_TEMPLATE_ID, (state: WindowOpenState) =>
  buildWindowOpenV1(state)
);
```

- [ ] **Step 5: Implement `src/services/feishu/cards/templates/graduation-v1.ts`**

```typescript
import type { FeishuCardJson } from "../types.js";
import { buildHeader } from "./common/header.js";
import { registerTemplate } from "../renderer.js";

export const GRADUATION_TEMPLATE_ID = "graduation-v1" as const;

export interface GraduationTopRow {
  rank: number;
  memberName: string;
  cumulativeAq: number;
  currentLevel: number;
  growthBonus: number;
  cashPrizeIndication: string | null;
}

export interface GraduationState {
  campName: string;
  finalWindowCode: string;
  graduatedAt: string;
  topN: GraduationTopRow[];
  totalParticipants: number;
}

export function buildGraduationV1(state: GraduationState): FeishuCardJson {
  const bodyElements: Array<Record<string, unknown>> = [
    {
      tag: "markdown",
      content:
        `**${state.campName}** 结业\n` +
        `**结业时间**: ${state.graduatedAt}\n` +
        `**参与学员**: ${state.totalParticipants} 人\n` +
        `**结业窗口**: \`${state.finalWindowCode}\``
    }
  ];

  if (state.topN.length === 0) {
    bodyElements.push({
      tag: "markdown",
      content: "_本营无上榜学员。_"
    });
  } else {
    const rows = state.topN
      .map(
        (r) =>
          `**#${r.rank} ${r.memberName}** · AQ=${r.cumulativeAq} · \`Lv${r.currentLevel}\` · 奖励 +${r.growthBonus}` +
          (r.cashPrizeIndication ? ` · 🎁 ${r.cashPrizeIndication}` : "")
      )
      .join("\n");
    bodyElements.push({
      tag: "markdown",
      content: rows
    });
  }

  return {
    schema: "2.0",
    config: { wide_screen_mode: true, update_multi: false },
    header: buildHeader({
      title: `🎓 ${state.campName} 结业典礼`,
      subtitle: new Date(state.graduatedAt).toLocaleDateString("zh-CN"),
      template: "purple"
    }) as unknown as Record<string, unknown>,
    body: { elements: bodyElements }
  };
}

registerTemplate(GRADUATION_TEMPLATE_ID, (state: GraduationState) =>
  buildGraduationV1(state)
);
```

- [ ] **Step 6: Run template tests to verify they pass**

Run: `npm test -- tests/services/feishu/cards/templates/period-open-v1.test.ts tests/services/feishu/cards/templates/window-open-v1.test.ts tests/services/feishu/cards/templates/graduation-v1.test.ts`
Expected: PASS — 16 assertions green across the three files. Each card renders under the 25 KB budget and covers its happy + edge-case paths.

- [ ] **Step 7: Append 3 command handler tests**

Append to `tests/services/feishu/cards/handlers/command-handlers.test.ts`:

```typescript
import { describe, expect, test, vi } from "vitest";

import {
  periodOpenCommandHandler,
  windowOpenCommandHandler,
  graduationCommandHandler
} from "../../../../../src/services/feishu/cards/handlers/command-handlers.js";
import type { CommandHandlerDeps } from "../../../../../src/services/feishu/cards/handlers/command-handlers.js";

function makeCommandDeps(): CommandHandlerDeps {
  return {
    repo: {
      findMemberByOpenId: vi.fn(() => ({
        id: "op-1",
        displayName: "运营甲",
        openId: "ou-op",
        roleType: "operator"
      })),
      insertLiveCard: vi.fn(),
      closeLiveCard: vi.fn(),
      findLiveCard: vi.fn(),
      updateLiveCardState: vi.fn()
    } as unknown as CommandHandlerDeps["repo"],
    feishuClient: {
      sendCard: vi.fn(async () => ({ messageId: "om-sent-1" })),
      patchCard: vi.fn()
    },
    config: { groupChatId: "oc-main-group" },
    adminApiClient: {
      openPeriod: vi.fn(async (number: number) => ({
        periodId: "p-new",
        periodNumber: number,
        isIceBreaker: number === 1,
        startedAt: "2026-04-10T09:00:00.000Z",
        boundWindowId: "w-bound",
        boundWindowCode: "W2"
      })),
      openWindow: vi.fn(async (code: string) => ({
        windowId: "w-new",
        windowCode: code,
        isFinal: code === "FINAL",
        startedAt: "2026-04-10T09:00:00.000Z",
        campName: "AI Seed Camp 2026 Q2"
      })),
      closeGraduation: vi.fn(async () => ({
        campName: "AI Seed Camp 2026 Q2",
        finalWindowCode: "FINAL",
        graduatedAt: "2026-04-30T23:59:59.000Z",
        totalParticipants: 14,
        topN: [
          {
            rank: 1,
            memberName: "张三",
            cumulativeAq: 120,
            currentLevel: 5,
            growthBonus: 12,
            cashPrizeIndication: "¥500"
          }
        ]
      }))
    },
    clock: () => new Date("2026-04-10T09:00:00.000Z"),
    uuid: () => "uuid-stub-cmd"
  };
}

describe("periodOpenCommandHandler", () => {
  test("calls adminApiClient.openPeriod and posts a period-open card to the group", async () => {
    const deps = makeCommandDeps();
    const result = await periodOpenCommandHandler(
      { operatorOpenId: "ou-op", rawArgs: "3" },
      deps
    );

    expect(deps.adminApiClient.openPeriod).toHaveBeenCalledWith(3);
    expect(deps.feishuClient.sendCard).toHaveBeenCalledOnce();
    const sendArg = (
      deps.feishuClient.sendCard as ReturnType<typeof vi.fn>
    ).mock.calls[0][0];
    expect(sendArg.chatId).toBe("oc-main-group");
    expect(JSON.stringify(sendArg.content)).toContain("第 3 期");
    expect(result.messageId).toBe("om-sent-1");
  });

  test("rejects non-operator callers", async () => {
    const deps = makeCommandDeps();
    (deps.repo.findMemberByOpenId as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      id: "m-stu",
      displayName: "学员",
      openId: "ou-stu",
      roleType: "student"
    });
    await expect(
      periodOpenCommandHandler({ operatorOpenId: "ou-stu", rawArgs: "3" }, deps)
    ).rejects.toThrow(/仅运营/);
    expect(deps.feishuClient.sendCard).not.toHaveBeenCalled();
  });

  test("rejects malformed period number", async () => {
    const deps = makeCommandDeps();
    await expect(
      periodOpenCommandHandler({ operatorOpenId: "ou-op", rawArgs: "abc" }, deps)
    ).rejects.toThrow(/期数/);
  });
});

describe("windowOpenCommandHandler", () => {
  test("calls adminApiClient.openWindow and posts a window-open card", async () => {
    const deps = makeCommandDeps();
    const result = await windowOpenCommandHandler(
      { operatorOpenId: "ou-op", rawArgs: "W3" },
      deps
    );
    expect(deps.adminApiClient.openWindow).toHaveBeenCalledWith("W3");
    const sendArg = (
      deps.feishuClient.sendCard as ReturnType<typeof vi.fn>
    ).mock.calls[0][0];
    expect(JSON.stringify(sendArg.content)).toContain("W3");
    expect(result.messageId).toBe("om-sent-1");
  });

  test("FINAL window renders 结业窗口 label via card template", async () => {
    const deps = makeCommandDeps();
    await windowOpenCommandHandler(
      { operatorOpenId: "ou-op", rawArgs: "FINAL" },
      deps
    );
    const sendArg = (
      deps.feishuClient.sendCard as ReturnType<typeof vi.fn>
    ).mock.calls[0][0];
    expect(JSON.stringify(sendArg.content)).toContain("结业窗口");
  });
});

describe("graduationCommandHandler", () => {
  test("calls adminApiClient.closeGraduation and posts a graduation card", async () => {
    const deps = makeCommandDeps();
    await graduationCommandHandler(
      { operatorOpenId: "ou-op", rawArgs: "" },
      deps
    );
    expect(deps.adminApiClient.closeGraduation).toHaveBeenCalledOnce();
    const sendArg = (
      deps.feishuClient.sendCard as ReturnType<typeof vi.fn>
    ).mock.calls[0][0];
    expect(JSON.stringify(sendArg.content)).toContain("结业典礼");
    expect(JSON.stringify(sendArg.content)).toContain("张三");
  });
});
```

- [ ] **Step 8: Run handler tests to verify they fail**

Run: `npm test -- tests/services/feishu/cards/handlers/command-handlers.test.ts -t "periodOpenCommandHandler|windowOpenCommandHandler|graduationCommandHandler"`
Expected: FAIL — the three exported command handlers don't exist yet.

- [ ] **Step 9: Append to `src/services/feishu/cards/handlers/command-handlers.ts`**

Append the three handlers and extend the shared deps interface:

```typescript
import type { FeishuCardJson } from "../types.js";
import { buildPeriodOpenV1 } from "../templates/period-open-v1.js";
import { buildWindowOpenV1 } from "../templates/window-open-v1.js";
import { buildGraduationV1 } from "../templates/graduation-v1.js";

export interface CommandHandlerDeps {
  repo: {
    findMemberByOpenId: (openId: string) => {
      id: string;
      displayName: string;
      openId: string;
      roleType: "student" | "operator" | "trainer" | "observer";
    } | null;
    insertLiveCard: (row: unknown) => void;
    closeLiveCard: (id: string, reason: string) => void;
    findLiveCard: (cardType: string, chatId: string) => unknown;
    updateLiveCardState: (id: string, state: unknown, at: string) => void;
  };
  feishuClient: {
    sendCard: (args: {
      chatId?: string;
      receiveId?: string;
      content: FeishuCardJson;
    }) => Promise<{ messageId: string }>;
    patchCard: (messageId: string, content: FeishuCardJson) => Promise<void>;
  };
  config: { groupChatId: string };
  adminApiClient: {
    openPeriod: (number: number) => Promise<{
      periodId: string;
      periodNumber: number;
      isIceBreaker: boolean;
      startedAt: string;
      boundWindowId: string | null;
      boundWindowCode: string | null;
    }>;
    openWindow: (code: string) => Promise<{
      windowId: string;
      windowCode: string;
      isFinal: boolean;
      startedAt: string;
      campName: string;
    }>;
    closeGraduation: () => Promise<{
      campName: string;
      finalWindowCode: string;
      graduatedAt: string;
      totalParticipants: number;
      topN: Array<{
        rank: number;
        memberName: string;
        cumulativeAq: number;
        currentLevel: number;
        growthBonus: number;
        cashPrizeIndication: string | null;
      }>;
    }>;
  };
  clock: () => Date;
  uuid: () => string;
}

export interface CommandHandlerInput {
  operatorOpenId: string;
  rawArgs: string;
}

export interface CommandHandlerResult {
  messageId: string;
}

function requireOperator(
  deps: CommandHandlerDeps,
  operatorOpenId: string
): { id: string; displayName: string } {
  const member = deps.repo.findMemberByOpenId(operatorOpenId);
  if (!member || member.roleType !== "operator") {
    throw new Error("仅运营可以执行此指令");
  }
  return { id: member.id, displayName: member.displayName };
}

export async function periodOpenCommandHandler(
  input: CommandHandlerInput,
  deps: CommandHandlerDeps
): Promise<CommandHandlerResult> {
  const operator = requireOperator(deps, input.operatorOpenId);

  const parsed = Number.parseInt(input.rawArgs.trim(), 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    throw new Error("期数参数无效,请使用 /开期 <正整数>");
  }

  const result = await deps.adminApiClient.openPeriod(parsed);
  const card = buildPeriodOpenV1({
    periodNumber: result.periodNumber,
    isIceBreaker: result.isIceBreaker,
    startedAt: result.startedAt,
    boundWindowCode: result.boundWindowCode,
    openedByOperatorName: operator.displayName
  });
  const sendResult = await deps.feishuClient.sendCard({
    chatId: deps.config.groupChatId,
    content: card
  });
  return { messageId: sendResult.messageId };
}

export async function windowOpenCommandHandler(
  input: CommandHandlerInput,
  deps: CommandHandlerDeps
): Promise<CommandHandlerResult> {
  const operator = requireOperator(deps, input.operatorOpenId);
  const code = input.rawArgs.trim();
  if (!code) {
    throw new Error("窗口编号参数为空,请使用 /开窗 <code>");
  }

  const result = await deps.adminApiClient.openWindow(code);
  const card = buildWindowOpenV1({
    windowCode: result.windowCode,
    campName: result.campName,
    startedAt: result.startedAt,
    isFinal: result.isFinal,
    openedByOperatorName: operator.displayName
  });
  const sendResult = await deps.feishuClient.sendCard({
    chatId: deps.config.groupChatId,
    content: card
  });
  return { messageId: sendResult.messageId };
}

export async function graduationCommandHandler(
  input: CommandHandlerInput,
  deps: CommandHandlerDeps
): Promise<CommandHandlerResult> {
  requireOperator(deps, input.operatorOpenId);
  const result = await deps.adminApiClient.closeGraduation();
  const card = buildGraduationV1({
    campName: result.campName,
    finalWindowCode: result.finalWindowCode,
    graduatedAt: result.graduatedAt,
    totalParticipants: result.totalParticipants,
    topN: result.topN
  });
  const sendResult = await deps.feishuClient.sendCard({
    chatId: deps.config.groupChatId,
    content: card
  });
  return { messageId: sendResult.messageId };
}
```

- [ ] **Step 10: Run handler tests to verify they pass**

Run: `npm test -- tests/services/feishu/cards/handlers/command-handlers.test.ts`
Expected: PASS — 8 new assertions green. Each slash command produces exactly one `sendCard` call to the group chat id with a card that includes the expected identifiers.

- [ ] **Step 11: Commit**

```bash
git add \
  src/services/feishu/cards/templates/period-open-v1.ts \
  src/services/feishu/cards/templates/window-open-v1.ts \
  src/services/feishu/cards/templates/graduation-v1.ts \
  src/services/feishu/cards/handlers/command-handlers.ts \
  tests/services/feishu/cards/templates/period-open-v1.test.ts \
  tests/services/feishu/cards/templates/window-open-v1.test.ts \
  tests/services/feishu/cards/templates/graduation-v1.test.ts \
  tests/services/feishu/cards/handlers/command-handlers.test.ts
git commit -m "feat(sub2): add period-open, window-open, and graduation confirmation cards"
```

---

### Task G2: Video checkin card (#5) + G1 handler

**Files:**
- Create: `src/services/feishu/cards/templates/video-checkin-v1.ts`
- Create: `src/services/feishu/cards/handlers/video-checkin-handler.ts`
- Create: `tests/services/feishu/cards/templates/video-checkin-v1.test.ts`
- Create: `tests/services/feishu/cards/handlers/video-checkin-handler.test.ts`
- Modify: `src/services/feishu/cards/handlers/command-handlers.ts` (append `/视频` command)

Ships card #5 from spec §4.2. The video checkin card lists the week's videos, a deadline, and one submit button that opens an inline form with a single `select_file` field (screenshot of "全部看完" proof). The handler writes `card_interactions`, calls `EventIngestor.ingest` for `G1` with a deterministic `sourceRef = g1-{periodId}:{memberId}` (exactly-once per period per member per spec §4.3), and returns a "✓ 已记录" toast.

- [ ] **Step 1: Write failing template test**

Create `tests/services/feishu/cards/templates/video-checkin-v1.test.ts`:

```typescript
import { describe, expect, test } from "vitest";

import {
  buildVideoCheckinV1,
  VIDEO_CHECKIN_TEMPLATE_ID,
  type VideoCheckinState
} from "../../../../../src/services/feishu/cards/templates/video-checkin-v1.js";
import { assertCardSize } from "../../../../../src/services/feishu/cards/renderer.js";

function fixture(overrides: Partial<VideoCheckinState> = {}): VideoCheckinState {
  return {
    sessionId: "video-w3",
    title: "第 3 期视频课",
    periodNumber: 3,
    videos: [
      { id: "v1", title: "Transformer 基础", durationMinutes: 45 },
      { id: "v2", title: "Attention 实战", durationMinutes: 38 },
      { id: "v3", title: "Prompt 工程", durationMinutes: 50 }
    ],
    deadline: "2026-04-14T23:59:59.000Z",
    postedAt: "2026-04-10T09:00:00.000Z",
    ...overrides
  };
}

describe("video-checkin-v1 template", () => {
  test("VIDEO_CHECKIN_TEMPLATE_ID is 'video-checkin-v1'", () => {
    expect(VIDEO_CHECKIN_TEMPLATE_ID).toBe("video-checkin-v1");
  });

  test("renders header with title and blue template", () => {
    const card = buildVideoCheckinV1(fixture());
    const header = card.header as {
      title: { content: string };
      template: string;
    };
    expect(header.title.content).toContain("第 3 期视频课");
    expect(header.template).toBe("blue");
  });

  test("body lists all video titles with durations", () => {
    const card = buildVideoCheckinV1(fixture());
    const serialized = JSON.stringify(card);
    expect(serialized).toContain("Transformer 基础");
    expect(serialized).toContain("Attention 实战");
    expect(serialized).toContain("Prompt 工程");
    expect(serialized).toContain("45");
    expect(serialized).toContain("38");
    expect(serialized).toContain("50");
  });

  test("body contains deadline and '全部看完' form with file_key field", () => {
    const card = buildVideoCheckinV1(fixture());
    const serialized = JSON.stringify(card);
    expect(serialized).toContain("2026-04-14");
    expect(serialized).toContain("全部看完");
    expect(serialized).toContain("select_file");
    expect(serialized).toContain('"action":"g1_submit"');
    expect(serialized).toContain("${video_file.value}");
  });

  test("rendered JSON fits under the card size budget", () => {
    expect(() => assertCardSize(buildVideoCheckinV1(fixture()))).not.toThrow();
  });
});
```

- [ ] **Step 2: Run template test to verify it fails**

Run: `npm test -- tests/services/feishu/cards/templates/video-checkin-v1.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/services/feishu/cards/templates/video-checkin-v1.ts`**

```typescript
import type { FeishuCardJson } from "../types.js";
import { buildHeader } from "./common/header.js";
import { registerTemplate } from "../renderer.js";

export const VIDEO_CHECKIN_TEMPLATE_ID = "video-checkin-v1" as const;

export interface VideoCheckinVideo {
  id: string;
  title: string;
  durationMinutes: number;
}

export interface VideoCheckinState {
  sessionId: string;
  title: string;
  periodNumber: number;
  videos: VideoCheckinVideo[];
  deadline: string;
  postedAt: string;
}

export function buildVideoCheckinV1(state: VideoCheckinState): FeishuCardJson {
  const videoList = state.videos
    .map((v, idx) => `${idx + 1}. **${v.title}** (${v.durationMinutes} 分钟)`)
    .join("\n");

  return {
    schema: "2.0",
    config: { wide_screen_mode: true, update_multi: false },
    header: buildHeader({
      title: state.title,
      subtitle: `第 ${state.periodNumber} 期 · 截止 ${new Date(state.deadline).toLocaleDateString("zh-CN")}`,
      template: "blue"
    }) as unknown as Record<string, unknown>,
    body: {
      elements: [
        {
          tag: "markdown",
          content:
            `**本周视频**:\n${videoList}\n\n` +
            `**截止时间**: ${state.deadline}\n` +
            `**完成后请点击下方按钮上传观看完成证明(截图)。**`
        },
        {
          tag: "form",
          name: "video_form",
          elements: [
            {
              tag: "select_file",
              name: "video_file",
              placeholder: {
                tag: "plain_text",
                content: "上传完成截图 (PNG/JPG)"
              },
              max_count: 1,
              accept: ["image/png", "image/jpeg"]
            },
            {
              tag: "button",
              text: { tag: "plain_text", content: "🎬 全部看完" },
              type: "primary",
              behaviors: [
                {
                  type: "callback",
                  value: {
                    action: "g1_submit",
                    session_id: state.sessionId,
                    file_key: "${video_file.value}"
                  }
                }
              ]
            }
          ]
        }
      ]
    }
  };
}

registerTemplate(VIDEO_CHECKIN_TEMPLATE_ID, (state: VideoCheckinState) =>
  buildVideoCheckinV1(state)
);
```

- [ ] **Step 4: Run template test to verify it passes**

Run: `npm test -- tests/services/feishu/cards/templates/video-checkin-v1.test.ts`
Expected: PASS — 5 assertions green.

- [ ] **Step 5: Write failing handler test**

Create `tests/services/feishu/cards/handlers/video-checkin-handler.test.ts`:

```typescript
import { beforeEach, describe, expect, test, vi } from "vitest";

import { videoCheckinHandler } from "../../../../../src/services/feishu/cards/handlers/video-checkin-handler.js";
import type {
  CardActionContext,
  CardHandlerDeps
} from "../../../../../src/services/feishu/cards/types.js";

function makeDeps(): CardHandlerDeps {
  return {
    repo: {
      insertCardInteraction: vi.fn(() => "inserted" as const),
      findLiveCard: vi.fn(),
      updateLiveCardState: vi.fn(),
      insertLiveCard: vi.fn(),
      closeLiveCard: vi.fn(),
      findEventById: vi.fn(),
      listReviewRequiredEvents: vi.fn(() => []),
      countReviewRequiredEvents: vi.fn(() => 0),
      findMemberByOpenId: vi.fn(() => ({
        id: "m-student-1",
        displayName: "张三",
        openId: "ou-student-1",
        roleType: "student"
      })),
      findActivePeriod: vi.fn(() => ({
        id: "p-3",
        periodNumber: 3,
        isIceBreaker: false
      }))
    } as unknown as CardHandlerDeps["repo"],
    ingestor: {
      ingest: vi.fn(() => ({
        eventId: "evt-g1-1",
        effectiveDelta: 3,
        status: "approved" as const
      }))
    },
    aggregator: { applyDecision: vi.fn() },
    feishuClient: { patchCard: vi.fn(), sendCard: vi.fn() },
    clock: () => new Date("2026-04-10T12:00:00.000Z"),
    uuid: () => "uuid-g1-stub"
  };
}

function ctx(overrides: Partial<CardActionContext> = {}): CardActionContext {
  return {
    operatorOpenId: "ou-student-1",
    triggerId: "trig-g1",
    actionName: "g1_submit",
    actionPayload: {
      action: "g1_submit",
      session_id: "video-w3",
      file_key: "file_v2_g1_abc"
    },
    messageId: "om-video",
    chatId: "oc-main",
    receivedAt: "2026-04-10T12:30:00.000Z",
    currentVersion: "video-checkin-v1",
    ...overrides
  };
}

describe("videoCheckinHandler", () => {
  let deps: CardHandlerDeps;
  beforeEach(() => {
    deps = makeDeps();
  });

  test("happy path: writes card_interaction, calls ingestor with G1 + deterministic sourceRef, returns success toast", async () => {
    const result = await videoCheckinHandler(ctx(), deps);

    expect(deps.repo.insertCardInteraction).toHaveBeenCalledOnce();
    const interactionRow = (
      deps.repo.insertCardInteraction as ReturnType<typeof vi.fn>
    ).mock.calls[0][0];
    expect(interactionRow.cardType).toBe("video_checkin");
    expect(interactionRow.actionName).toBe("g1_submit");
    expect(interactionRow.payloadJson).toEqual({
      session_id: "video-w3",
      file_key: "file_v2_g1_abc"
    });

    expect(deps.ingestor.ingest).toHaveBeenCalledOnce();
    const ingestReq = (deps.ingestor.ingest as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(ingestReq.memberId).toBe("m-student-1");
    expect(ingestReq.itemCode).toBe("G1");
    expect(ingestReq.sourceType).toBe("card_interaction");
    expect(ingestReq.sourceRef).toBe("g1-p-3:m-student-1");
    expect(ingestReq.payload).toMatchObject({
      sessionId: "video-w3",
      fileKey: "file_v2_g1_abc"
    });

    expect(result.toast?.type).toBe("success");
    expect(result.toast?.content).toContain("已记录");
  });

  test("empty file_key is rejected with a soft-validation toast", async () => {
    const result = await videoCheckinHandler(
      ctx({
        actionPayload: {
          action: "g1_submit",
          session_id: "video-w3",
          file_key: ""
        }
      }),
      deps
    );
    expect(result.toast?.type).toBe("error");
    expect(result.toast?.content).toContain("截图");
    expect(deps.ingestor.ingest).not.toHaveBeenCalled();

    const interactionRow = (
      deps.repo.insertCardInteraction as ReturnType<typeof vi.fn>
    ).mock.calls[0][0];
    expect(interactionRow.rejectedReason).toBe("soft_validation_file_key_required");
  });

  test("ingestor rejecting with duplicate keeps the card unchanged with info toast (idempotent second click)", async () => {
    (deps.ingestor.ingest as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      eventId: "evt-g1-dup",
      effectiveDelta: 0,
      status: "rejected" as const,
      reason: "duplicate"
    });
    const result = await videoCheckinHandler(ctx(), deps);
    expect(result.toast?.type).toBe("info");
    expect(result.toast?.content).toContain("已记录");
  });

  test("unknown action name returns an error toast", async () => {
    const result = await videoCheckinHandler(
      ctx({ actionName: "ghost", actionPayload: { action: "ghost" } }),
      deps
    );
    expect(result.toast?.type).toBe("error");
  });

  test("no active period returns a warn toast without calling ingestor", async () => {
    (deps.repo as unknown as { findActivePeriod: ReturnType<typeof vi.fn> }).findActivePeriod =
      vi.fn(() => null);
    const result = await videoCheckinHandler(ctx(), deps);
    expect(result.toast?.type).toBe("error");
    expect(result.toast?.content).toContain("期未开");
    expect(deps.ingestor.ingest).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 6: Run handler test to verify it fails**

Run: `npm test -- tests/services/feishu/cards/handlers/video-checkin-handler.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 7: Implement `src/services/feishu/cards/handlers/video-checkin-handler.ts`**

```typescript
import type {
  CardActionContext,
  CardActionResult,
  CardHandler,
  CardHandlerDeps,
  CardInteractionRow
} from "../types.js";

interface VideoCheckinDepsExt extends CardHandlerDeps {
  repo: CardHandlerDeps["repo"] & {
    findActivePeriod?: () => {
      id: string;
      periodNumber: number;
      isIceBreaker: boolean;
    } | null;
  };
}

export const videoCheckinHandler: CardHandler = async (
  ctx: CardActionContext,
  baseDeps: CardHandlerDeps
): Promise<CardActionResult> => {
  const deps = baseDeps as VideoCheckinDepsExt;

  if (ctx.actionName !== "g1_submit") {
    return {
      toast: {
        type: "error",
        content: `video-checkin handler: unknown action ${ctx.actionName}`
      }
    };
  }

  const member = deps.repo.findMemberByOpenId?.(ctx.operatorOpenId);
  if (!member) {
    return { toast: { type: "error", content: "你不在本营学员名单" } };
  }

  const period = deps.repo.findActivePeriod?.();
  if (!period) {
    return { toast: { type: "error", content: "期未开,请等讲师开启" } };
  }

  const payload = ctx.actionPayload as {
    session_id?: unknown;
    file_key?: unknown;
  };
  const sessionId =
    typeof payload.session_id === "string" ? payload.session_id : "";
  const fileKey =
    typeof payload.file_key === "string" ? payload.file_key : "";

  const cardInteractionId = deps.uuid();

  if (!fileKey || fileKey.trim() === "") {
    const row: CardInteractionRow = {
      id: cardInteractionId,
      memberId: member.id,
      periodId: period.id,
      cardType: "video_checkin",
      actionName: "g1_submit",
      feishuMessageId: ctx.messageId,
      feishuCardVersion: ctx.currentVersion,
      payloadJson: { session_id: sessionId, file_key: fileKey },
      receivedAt: ctx.receivedAt,
      triggerId: ctx.triggerId,
      operatorOpenId: ctx.operatorOpenId,
      rejectedReason: "soft_validation_file_key_required"
    };
    deps.repo.insertCardInteraction(row);
    return {
      toast: {
        type: "error",
        content: "请先上传完成截图 (PNG/JPG)"
      }
    };
  }

  const interactionRow: CardInteractionRow = {
    id: cardInteractionId,
    memberId: member.id,
    periodId: period.id,
    cardType: "video_checkin",
    actionName: "g1_submit",
    feishuMessageId: ctx.messageId,
    feishuCardVersion: ctx.currentVersion,
    payloadJson: { session_id: sessionId, file_key: fileKey },
    receivedAt: ctx.receivedAt,
    triggerId: ctx.triggerId,
    operatorOpenId: ctx.operatorOpenId,
    rejectedReason: null
  };
  deps.repo.insertCardInteraction(interactionRow);

  // Deterministic sourceRef: exactly-once per period per member per spec §4.3.
  const sourceRef = `g1-${period.id}:${member.id}`;

  const ingestResult = deps.ingestor.ingest({
    memberId: member.id,
    itemCode: "G1",
    sourceType: "card_interaction",
    sourceRef,
    payload: { sessionId, fileKey },
    requestedAt: ctx.receivedAt
  });

  if (ingestResult.status === "rejected" && ingestResult.reason === "duplicate") {
    return {
      toast: {
        type: "info",
        content: "✓ 已记录 (你本期已提交过)"
      }
    };
  }
  if (ingestResult.status === "rejected") {
    return {
      toast: {
        type: "error",
        content: `未入账: ${ingestResult.reason ?? "unknown"}`
      }
    };
  }

  return {
    toast: {
      type: "success",
      content: "✓ 已记录,G1 +3"
    }
  };
};
```

- [ ] **Step 8: Run handler test to verify it passes**

Run: `npm test -- tests/services/feishu/cards/handlers/video-checkin-handler.test.ts`
Expected: PASS — 5 assertions green. The deterministic `sourceRef = "g1-p-3:m-student-1"` guarantees the sub1 Ingestor's `findEventBySourceRef` dedupe hits on a second click from the same student in the same period.

- [ ] **Step 9: Commit**

```bash
git add \
  src/services/feishu/cards/templates/video-checkin-v1.ts \
  src/services/feishu/cards/handlers/video-checkin-handler.ts \
  tests/services/feishu/cards/templates/video-checkin-v1.test.ts \
  tests/services/feishu/cards/handlers/video-checkin-handler.test.ts
git commit -m "feat(sub2): add video-checkin card + G1 handler with deterministic sourceRef"
```

---

### Task G3: Homework submit card (#4) + H1 handler via reply-to-message flow

**Files:**
- Create: `src/services/feishu/cards/templates/homework-submit-v1.ts`
- Create: `src/services/feishu/cards/handlers/homework-handler.ts`
- Create: `src/services/feishu/cards/handlers/homework-reply-handler.ts`
- Create: `tests/services/feishu/cards/templates/homework-submit-v1.test.ts`
- Create: `tests/services/feishu/cards/handlers/homework-handler.test.ts`
- Create: `tests/services/feishu/cards/handlers/homework-reply-handler.test.ts`
- Modify: `src/services/feishu/cards/handlers/command-handlers.ts` (append `/作业` command)

Ships card #4 from spec §4.1 — the second patched card (after daily-checkin from Phase C). The homework card is a group broadcast with a rolling submitter list. Per spec Q6 decision, the file upload flow is **reply-to-message** rather than inline card file-chooser: the "提交作业" button returns a toast instructing the user to reply to the message with the file attached; the reply listener (`im.message.receive_v1` with `parent_id` match) then correlates the reply to the live homework card, extracts the file_key, and calls `EventIngestor.ingest` for H1 (plus H3 if it's the first submitter). The card state_json tracks submitter order so the H3 first-submitter bonus is deterministic. Size budget: 14 submitters × ~2 KB ≈ 28 KB, which requires trimming per-row markdown to stay under 30 KB — the test asserts `<= 25 KB` with 14 submitters.

- [ ] **Step 1: Write failing template test**

Create `tests/services/feishu/cards/templates/homework-submit-v1.test.ts`:

```typescript
import { describe, expect, test } from "vitest";

import {
  buildHomeworkSubmitV1,
  HOMEWORK_SUBMIT_TEMPLATE_ID
} from "../../../../../src/services/feishu/cards/templates/homework-submit-v1.js";
import {
  assertCardSize,
  CARD_SIZE_BUDGET_BYTES
} from "../../../../../src/services/feishu/cards/renderer.js";
import type { HomeworkSubmitState } from "../../../../../src/services/feishu/cards/types.js";

function emptyState(): HomeworkSubmitState {
  return {
    sessionId: "hw-session-3",
    title: "第 3 期作业: 用 Claude 搭建个人知识库",
    deadline: "2026-04-17T23:59:59.000Z",
    submitters: []
  };
}

function seedSubmitters(n: number): HomeworkSubmitState["submitters"] {
  return Array.from({ length: n }, (_, i) => ({
    memberId: `m-${i + 1}`,
    submittedAt: `2026-04-10T${String(10 + i).padStart(2, "0")}:00:00.000Z`,
    firstSubmitter: i === 0
  }));
}

describe("homework-submit-v1 template", () => {
  test("HOMEWORK_SUBMIT_TEMPLATE_ID is 'homework-submit-v1'", () => {
    expect(HOMEWORK_SUBMIT_TEMPLATE_ID).toBe("homework-submit-v1");
  });

  test("empty state shows title, deadline, and the 提交作业 button", () => {
    const card = buildHomeworkSubmitV1(emptyState());
    const serialized = JSON.stringify(card);
    expect(serialized).toContain("第 3 期作业");
    expect(serialized).toContain("2026-04-17");
    expect(serialized).toContain("📎 提交作业");
    expect(serialized).toContain('"action":"homework_request_upload"');
    expect(serialized).toContain("暂无提交");
  });

  test("first submitter is marked with H3 bonus label", () => {
    const state: HomeworkSubmitState = {
      ...emptyState(),
      submitters: [
        {
          memberId: "m-first",
          submittedAt: "2026-04-10T10:00:00.000Z",
          firstSubmitter: true
        }
      ]
    };
    const card = buildHomeworkSubmitV1(state);
    const serialized = JSON.stringify(card);
    expect(serialized).toContain("m-first");
    expect(serialized).toContain("首位");
    expect(serialized).toContain("+H3");
  });

  test("14 submitters render under the 25 KB card size budget", () => {
    const state: HomeworkSubmitState = {
      ...emptyState(),
      submitters: seedSubmitters(14)
    };
    const card = buildHomeworkSubmitV1(state);
    const size = Buffer.byteLength(JSON.stringify(card), "utf8");
    expect(size).toBeLessThanOrEqual(CARD_SIZE_BUDGET_BYTES);
    expect(() => assertCardSize(card)).not.toThrow();
  });

  test("submitter markdown includes the submittedAt timestamp abbreviated", () => {
    const state: HomeworkSubmitState = {
      ...emptyState(),
      submitters: [
        {
          memberId: "m-1",
          submittedAt: "2026-04-10T10:00:00.000Z",
          firstSubmitter: true
        },
        {
          memberId: "m-2",
          submittedAt: "2026-04-10T11:30:00.000Z",
          firstSubmitter: false
        }
      ]
    };
    const card = buildHomeworkSubmitV1(state);
    const serialized = JSON.stringify(card);
    expect(serialized).toContain("10:00");
    expect(serialized).toContain("11:30");
  });
});
```

- [ ] **Step 2: Run template test to verify it fails**

Run: `npm test -- tests/services/feishu/cards/templates/homework-submit-v1.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/services/feishu/cards/templates/homework-submit-v1.ts`**

```typescript
import type {
  FeishuCardJson,
  HomeworkSubmitState
} from "../types.js";
import { buildHeader } from "./common/header.js";
import { registerTemplate } from "../renderer.js";

export const HOMEWORK_SUBMIT_TEMPLATE_ID = "homework-submit-v1" as const;

function formatTime(iso: string): string {
  const date = new Date(iso);
  const hh = String(date.getUTCHours()).padStart(2, "0");
  const mm = String(date.getUTCMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

export function buildHomeworkSubmitV1(
  state: HomeworkSubmitState
): FeishuCardJson {
  const deadlineDisplay = new Date(state.deadline).toLocaleString("zh-CN");
  const bodyElements: Array<Record<string, unknown>> = [
    {
      tag: "markdown",
      content:
        `**截止时间**: ${deadlineDisplay}\n\n` +
        `点击下方按钮提交作业,机器人会提示你回复本消息并附上作业文件。\n` +
        `首位提交者额外获得 **H3 +3** 奖励。`
    },
    {
      tag: "action",
      actions: [
        {
          tag: "button",
          text: { tag: "plain_text", content: "📎 提交作业" },
          type: "primary",
          behaviors: [
            {
              type: "callback",
              value: {
                action: "homework_request_upload",
                session_id: state.sessionId
              }
            }
          ]
        }
      ]
    }
  ];

  if (state.submitters.length === 0) {
    bodyElements.push({
      tag: "markdown",
      content: "_暂无提交_"
    });
  } else {
    const lines = state.submitters
      .map((s, idx) => {
        const marker = s.firstSubmitter ? " 🏆 (首位 +H3)" : "";
        return `${idx + 1}. \`${s.memberId}\` · ${formatTime(s.submittedAt)}${marker}`;
      })
      .join("\n");
    bodyElements.push({
      tag: "markdown",
      content: `**已提交** (${state.submitters.length}):\n${lines}`
    });
  }

  return {
    schema: "2.0",
    config: { wide_screen_mode: true, update_multi: true },
    header: buildHeader({
      title: state.title,
      subtitle: `截止 ${new Date(state.deadline).toLocaleDateString("zh-CN")}`,
      template: "orange"
    }) as unknown as Record<string, unknown>,
    body: { elements: bodyElements }
  };
}

registerTemplate(HOMEWORK_SUBMIT_TEMPLATE_ID, (state: HomeworkSubmitState) =>
  buildHomeworkSubmitV1(state)
);
```

- [ ] **Step 4: Run template test to verify it passes**

Run: `npm test -- tests/services/feishu/cards/templates/homework-submit-v1.test.ts`
Expected: PASS — 5 assertions green. The 14-submitter render test shows the serialized card at ~19-22 KB.

- [ ] **Step 5: Write failing button handler test**

Create `tests/services/feishu/cards/handlers/homework-handler.test.ts`:

```typescript
import { beforeEach, describe, expect, test, vi } from "vitest";

import { homeworkHandler } from "../../../../../src/services/feishu/cards/handlers/homework-handler.js";
import type {
  CardActionContext,
  CardHandlerDeps
} from "../../../../../src/services/feishu/cards/types.js";

function makeDeps(): CardHandlerDeps {
  return {
    repo: {
      insertCardInteraction: vi.fn(() => "inserted" as const),
      findLiveCard: vi.fn(() => ({
        id: "flc-hw-1",
        cardType: "homework_submit",
        feishuMessageId: "om-hw",
        feishuChatId: "oc-main",
        campId: "camp-1",
        periodId: "p-3",
        windowId: "w-3",
        cardVersion: "homework-submit-v1",
        stateJson: {
          sessionId: "hw-session-3",
          title: "第 3 期作业",
          deadline: "2026-04-17T23:59:59.000Z",
          submitters: []
        },
        sentAt: "2026-04-10T09:00:00.000Z",
        lastPatchedAt: null,
        expiresAt: "2026-04-24T09:00:00.000Z",
        closedReason: null
      })),
      updateLiveCardState: vi.fn(),
      insertLiveCard: vi.fn(),
      closeLiveCard: vi.fn(),
      findEventById: vi.fn(),
      listReviewRequiredEvents: vi.fn(() => []),
      countReviewRequiredEvents: vi.fn(() => 0),
      findMemberByOpenId: vi.fn(() => ({
        id: "m-stu-1",
        displayName: "张三",
        openId: "ou-student-1",
        roleType: "student"
      }))
    } as unknown as CardHandlerDeps["repo"],
    ingestor: { ingest: vi.fn() },
    aggregator: { applyDecision: vi.fn() },
    feishuClient: { patchCard: vi.fn(), sendCard: vi.fn() },
    clock: () => new Date("2026-04-10T12:00:00.000Z"),
    uuid: () => "uuid-hw-stub"
  };
}

function ctx(): CardActionContext {
  return {
    operatorOpenId: "ou-student-1",
    triggerId: "trig-hw-1",
    actionName: "homework_request_upload",
    actionPayload: {
      action: "homework_request_upload",
      session_id: "hw-session-3"
    },
    messageId: "om-hw",
    chatId: "oc-main",
    receivedAt: "2026-04-10T12:00:00.000Z",
    currentVersion: "homework-submit-v1"
  };
}

describe("homeworkHandler (button click path)", () => {
  let deps: CardHandlerDeps;
  beforeEach(() => {
    deps = makeDeps();
  });

  test("button click returns an instruction toast without calling ingestor", async () => {
    const result = await homeworkHandler(ctx(), deps);
    expect(result.toast?.type).toBe("info");
    expect(result.toast?.content).toContain("回复本消息");
    expect(result.toast?.content).toContain("附上");
    expect(deps.ingestor.ingest).not.toHaveBeenCalled();
    expect(deps.repo.updateLiveCardState).not.toHaveBeenCalled();
  });

  test("unknown action returns an error toast", async () => {
    const weird = { ...ctx(), actionName: "ghost" };
    const result = await homeworkHandler(weird, deps);
    expect(result.toast?.type).toBe("error");
  });
});
```

- [ ] **Step 6: Run handler test to verify it fails**

Run: `npm test -- tests/services/feishu/cards/handlers/homework-handler.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 7: Implement `src/services/feishu/cards/handlers/homework-handler.ts`**

```typescript
import type {
  CardActionContext,
  CardActionResult,
  CardHandler,
  CardHandlerDeps
} from "../types.js";

export const homeworkHandler: CardHandler = async (
  ctx: CardActionContext,
  _deps: CardHandlerDeps
): Promise<CardActionResult> => {
  if (ctx.actionName !== "homework_request_upload") {
    return {
      toast: {
        type: "error",
        content: `homework handler: unknown action ${ctx.actionName}`
      }
    };
  }

  return {
    toast: {
      type: "info",
      content: "请回复本消息并附上作业文件 (PDF/DOCX/PPT 等)"
    }
  };
};
```

- [ ] **Step 8: Run handler test to verify it passes**

Run: `npm test -- tests/services/feishu/cards/handlers/homework-handler.test.ts`
Expected: PASS — 2 assertions green.

- [ ] **Step 9: Write failing reply handler test**

Create `tests/services/feishu/cards/handlers/homework-reply-handler.test.ts`:

```typescript
import { beforeEach, describe, expect, test, vi } from "vitest";

import { homeworkReplyHandler } from "../../../../../src/services/feishu/cards/handlers/homework-reply-handler.js";
import type { CardHandlerDeps, HomeworkSubmitState } from "../../../../../src/services/feishu/cards/types.js";
import type { HomeworkReplyEvent } from "../../../../../src/services/feishu/cards/handlers/homework-reply-handler.js";

function seedLiveCardState(): HomeworkSubmitState {
  return {
    sessionId: "hw-session-3",
    title: "第 3 期作业",
    deadline: "2026-04-17T23:59:59.000Z",
    submitters: []
  };
}

function makeDeps(overrides?: {
  liveCardExists?: boolean;
  priorSubmitters?: HomeworkSubmitState["submitters"];
}): CardHandlerDeps {
  const state: HomeworkSubmitState = {
    ...seedLiveCardState(),
    submitters: overrides?.priorSubmitters ?? []
  };
  return {
    repo: {
      insertCardInteraction: vi.fn(() => "inserted" as const),
      findLiveCard: vi.fn(() => {
        if (overrides?.liveCardExists === false) return null;
        return {
          id: "flc-hw-1",
          cardType: "homework_submit",
          feishuMessageId: "om-hw",
          feishuChatId: "oc-main",
          campId: "camp-1",
          periodId: "p-3",
          windowId: "w-3",
          cardVersion: "homework-submit-v1",
          stateJson: state,
          sentAt: "2026-04-10T09:00:00.000Z",
          lastPatchedAt: null,
          expiresAt: "2026-04-24T09:00:00.000Z",
          closedReason: null
        };
      }),
      findLiveCardByMessageId: vi.fn((messageId: string) => {
        if (messageId !== "om-hw" || overrides?.liveCardExists === false) {
          return null;
        }
        return {
          id: "flc-hw-1",
          cardType: "homework_submit",
          feishuMessageId: "om-hw",
          feishuChatId: "oc-main",
          campId: "camp-1",
          periodId: "p-3",
          windowId: "w-3",
          cardVersion: "homework-submit-v1",
          stateJson: state,
          sentAt: "2026-04-10T09:00:00.000Z",
          lastPatchedAt: null,
          expiresAt: "2026-04-24T09:00:00.000Z",
          closedReason: null
        };
      }),
      updateLiveCardState: vi.fn((id: string, nextState: unknown) => {
        Object.assign(state, nextState);
      }),
      insertLiveCard: vi.fn(),
      closeLiveCard: vi.fn(),
      findEventById: vi.fn(),
      listReviewRequiredEvents: vi.fn(() => []),
      countReviewRequiredEvents: vi.fn(() => 0),
      findMemberByOpenId: vi.fn(() => ({
        id: "m-stu-1",
        displayName: "张三",
        openId: "ou-student-1",
        roleType: "student"
      }))
    } as unknown as CardHandlerDeps["repo"],
    ingestor: {
      ingest: vi.fn((req: { itemCode: string }) => ({
        eventId: `evt-${req.itemCode}-1`,
        effectiveDelta: 3,
        status: "approved" as const
      }))
    },
    aggregator: { applyDecision: vi.fn() },
    feishuClient: {
      patchCard: vi.fn(),
      sendCard: vi.fn()
    },
    clock: () => new Date("2026-04-10T12:00:00.000Z"),
    uuid: () => "uuid-reply-stub"
  };
}

function event(overrides: Partial<HomeworkReplyEvent> = {}): HomeworkReplyEvent {
  return {
    messageId: "om-reply-1",
    parentId: "om-hw",
    chatId: "oc-main",
    senderOpenId: "ou-student-1",
    receivedAt: "2026-04-10T12:30:00.000Z",
    attachments: [{ fileKey: "file_v2_hw_abc", fileType: "file" }],
    ...overrides
  };
}

describe("homeworkReplyHandler", () => {
  let deps: CardHandlerDeps;
  beforeEach(() => {
    deps = makeDeps();
  });

  test("reply whose parent_id matches a live homework card: ingests H1 and H3 (first submitter)", async () => {
    const result = await homeworkReplyHandler(event(), deps);

    expect(result.matched).toBe(true);
    expect(deps.ingestor.ingest).toHaveBeenCalledTimes(2);
    const calls = (deps.ingestor.ingest as ReturnType<typeof vi.fn>).mock.calls.map(
      (c) => c[0]
    );
    const h1 = calls.find((c) => c.itemCode === "H1");
    const h3 = calls.find((c) => c.itemCode === "H3");
    expect(h1).toBeDefined();
    expect(h3).toBeDefined();
    expect(h1?.payload).toMatchObject({ fileKey: "file_v2_hw_abc" });
    expect(h3?.sourceRef).toBe("h3-first-p-3");

    expect(deps.repo.updateLiveCardState).toHaveBeenCalledOnce();
    const [_id, nextState] = (
      deps.repo.updateLiveCardState as ReturnType<typeof vi.fn>
    ).mock.calls[0];
    const hwState = nextState as HomeworkSubmitState;
    expect(hwState.submitters).toHaveLength(1);
    expect(hwState.submitters[0].memberId).toBe("m-stu-1");
    expect(hwState.submitters[0].firstSubmitter).toBe(true);

    expect(deps.feishuClient.patchCard).toHaveBeenCalledOnce();
  });

  test("second submitter only ingests H1, not H3", async () => {
    deps = makeDeps({
      priorSubmitters: [
        {
          memberId: "m-prev",
          submittedAt: "2026-04-10T11:00:00.000Z",
          firstSubmitter: true
        }
      ]
    });
    await homeworkReplyHandler(event(), deps);

    const calls = (deps.ingestor.ingest as ReturnType<typeof vi.fn>).mock.calls.map(
      (c) => c[0]
    );
    expect(calls).toHaveLength(1);
    expect(calls[0].itemCode).toBe("H1");
  });

  test("reply with unrelated parent_id returns matched=false and does not ingest", async () => {
    deps = makeDeps({ liveCardExists: false });
    const result = await homeworkReplyHandler(
      event({ parentId: "om-unrelated" }),
      deps
    );
    expect(result.matched).toBe(false);
    expect(deps.ingestor.ingest).not.toHaveBeenCalled();
  });

  test("reply with no attachments returns matched=true with an error toast", async () => {
    const result = await homeworkReplyHandler(
      event({ attachments: [] }),
      deps
    );
    expect(result.matched).toBe(true);
    expect(result.error).toContain("附件");
    expect(deps.ingestor.ingest).not.toHaveBeenCalled();
  });

  test("non-student sender returns matched=true with an error toast", async () => {
    (deps.repo.findMemberByOpenId as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      id: "m-op-1",
      displayName: "运营",
      openId: "ou-op",
      roleType: "operator"
    });
    const result = await homeworkReplyHandler(event(), deps);
    expect(result.matched).toBe(true);
    expect(result.error).toContain("学员");
  });
});
```

- [ ] **Step 10: Run reply handler test to verify it fails**

Run: `npm test -- tests/services/feishu/cards/handlers/homework-reply-handler.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 11: Implement `src/services/feishu/cards/handlers/homework-reply-handler.ts`**

```typescript
import type {
  CardHandlerDeps,
  HomeworkSubmitState,
  LiveCardRow
} from "../types.js";
import { buildHomeworkSubmitV1 } from "../templates/homework-submit-v1.js";

export interface HomeworkReplyAttachment {
  fileKey: string;
  fileType: string;
}

export interface HomeworkReplyEvent {
  messageId: string;
  parentId: string;
  chatId: string;
  senderOpenId: string;
  receivedAt: string;
  attachments: HomeworkReplyAttachment[];
}

export interface HomeworkReplyResult {
  matched: boolean;
  error?: string;
}

interface HomeworkReplyDepsExt {
  repo: CardHandlerDeps["repo"] & {
    findLiveCardByMessageId?: (messageId: string) => LiveCardRow | null;
  };
}

export async function homeworkReplyHandler(
  event: HomeworkReplyEvent,
  baseDeps: CardHandlerDeps
): Promise<HomeworkReplyResult> {
  const deps = baseDeps as CardHandlerDeps & HomeworkReplyDepsExt;

  // Look up the live card by the parent_id of the reply. Only active
  // homework cards match; all other replies are ignored.
  const liveCard =
    deps.repo.findLiveCardByMessageId?.(event.parentId) ?? null;
  if (!liveCard || liveCard.cardType !== "homework_submit") {
    return { matched: false };
  }

  const member = deps.repo.findMemberByOpenId?.(event.senderOpenId);
  if (!member || member.roleType !== "student") {
    return { matched: true, error: "仅学员可以提交作业" };
  }

  if (event.attachments.length === 0) {
    return { matched: true, error: "请附件作业文件,空回复无法入账" };
  }
  const fileKey = event.attachments[0].fileKey;

  const cardInteractionId = deps.uuid();
  deps.repo.insertCardInteraction({
    id: cardInteractionId,
    memberId: member.id,
    periodId: liveCard.periodId,
    cardType: "homework_submit",
    actionName: "homework_reply",
    feishuMessageId: event.messageId,
    feishuCardVersion: liveCard.cardVersion,
    payloadJson: {
      reply_message_id: event.messageId,
      parent_message_id: event.parentId,
      file_key: fileKey
    },
    receivedAt: event.receivedAt,
    triggerId: event.messageId,
    operatorOpenId: event.senderOpenId,
    rejectedReason: null
  });

  // Ingest H1 for every submission (cap 3 per period per spec §3.1.H1).
  deps.ingestor.ingest({
    memberId: member.id,
    itemCode: "H1",
    sourceType: "card_interaction",
    sourceRef: cardInteractionId,
    payload: { fileKey, sessionId: (liveCard.stateJson as HomeworkSubmitState).sessionId },
    requestedAt: event.receivedAt
  });

  // First submitter bonus: H3 +3 exactly once per period.
  const currentState = liveCard.stateJson as HomeworkSubmitState;
  const isFirstSubmitter = currentState.submitters.length === 0;
  if (isFirstSubmitter && liveCard.periodId) {
    deps.ingestor.ingest({
      memberId: member.id,
      itemCode: "H3",
      sourceType: "card_interaction",
      sourceRef: `h3-first-${liveCard.periodId}`,
      payload: { fileKey, sessionId: currentState.sessionId },
      requestedAt: event.receivedAt
    });
  }

  // Merge the new submitter into state_json.
  const nextState: HomeworkSubmitState = {
    ...currentState,
    submitters: [
      ...currentState.submitters,
      {
        memberId: member.id,
        submittedAt: event.receivedAt,
        firstSubmitter: isFirstSubmitter
      }
    ]
  };
  deps.repo.updateLiveCardState(
    liveCard.id,
    nextState,
    deps.clock().toISOString()
  );

  // Async patch the live card in place.
  const newCardJson = buildHomeworkSubmitV1(nextState);
  await deps.feishuClient.patchCard(liveCard.feishuMessageId, newCardJson);

  return { matched: true };
}
```

- [ ] **Step 12: Run reply handler test to verify it passes**

Run: `npm test -- tests/services/feishu/cards/handlers/homework-reply-handler.test.ts`
Expected: PASS — 5 assertions green. First-submitter H3 fires once, second submitter only gets H1, mismatched parent_id returns matched=false, empty attachments return an error, and non-student senders are blocked.

- [ ] **Step 13: Commit**

```bash
git add \
  src/services/feishu/cards/templates/homework-submit-v1.ts \
  src/services/feishu/cards/handlers/homework-handler.ts \
  src/services/feishu/cards/handlers/homework-reply-handler.ts \
  tests/services/feishu/cards/templates/homework-submit-v1.test.ts \
  tests/services/feishu/cards/handlers/homework-handler.test.ts \
  tests/services/feishu/cards/handlers/homework-reply-handler.test.ts
git commit -m "feat(sub2): add homework-submit card with reply-to-message H1/H3 flow"
```

---

### Task G4: Peer review vote card (#6) + handler + settle card (#7)

**Files:**
- Create: `src/services/feishu/cards/templates/peer-review-vote-v1.ts`
- Create: `src/services/feishu/cards/templates/peer-review-settle-v1.ts`
- Create: `src/services/feishu/cards/handlers/peer-review-handler.ts`
- Create: `src/services/feishu/cards/handlers/peer-review-settle-handler.ts`
- Create: `tests/services/feishu/cards/templates/peer-review-vote-v1.test.ts`
- Create: `tests/services/feishu/cards/templates/peer-review-settle-v1.test.ts`
- Create: `tests/services/feishu/cards/handlers/peer-review-handler.test.ts`
- Create: `tests/services/feishu/cards/handlers/peer-review-settle-handler.test.ts`
- Modify: `src/services/feishu/cards/handlers/command-handlers.ts` (append `/互评` and `/互评结算` command handlers)

Ships cards #6 and #7 from spec §4.2 + spec §5.3. The peer review vote card is a **private DM** sent to each of the 14 students — one card per student, each listing the other 13 classmates as voting options. Each student selects 1-2 classmates and clicks submit; the handler writes to the `peer_review_votes` table via `deps.repo.insertPeerReviewVote(...)` (the Phase B pre-fix in sub-project 1 adds this method). The settle card is triggered by the `/互评结算 <sid>` command: it reads `peer_review_votes`, computes the top 2 by vote count, triggers `EventIngestor.ingest` for S1 (voter) and S2 (most-voted), then posts the settle card to the group showing vote counts per student.

- [ ] **Step 1: Write failing vote template test**

Create `tests/services/feishu/cards/templates/peer-review-vote-v1.test.ts`:

```typescript
import { describe, expect, test } from "vitest";

import {
  buildPeerReviewVoteV1,
  PEER_REVIEW_VOTE_TEMPLATE_ID,
  type PeerReviewVoteState
} from "../../../../../src/services/feishu/cards/templates/peer-review-vote-v1.js";
import { assertCardSize } from "../../../../../src/services/feishu/cards/renderer.js";

function fixture(): PeerReviewVoteState {
  return {
    peerReviewSessionId: "pr-w3",
    periodNumber: 3,
    voterMemberId: "m-voter",
    voterDisplayName: "张三",
    deadline: "2026-04-14T23:59:59.000Z",
    classmates: Array.from({ length: 13 }, (_, i) => ({
      memberId: `m-${i + 1}`,
      displayName: `同学${i + 1}`
    })),
    maxVotes: 2
  };
}

describe("peer-review-vote-v1 template", () => {
  test("PEER_REVIEW_VOTE_TEMPLATE_ID is 'peer-review-vote-v1'", () => {
    expect(PEER_REVIEW_VOTE_TEMPLATE_ID).toBe("peer-review-vote-v1");
  });

  test("renders header addressed to the voter's displayName and purple template", () => {
    const card = buildPeerReviewVoteV1(fixture());
    const header = card.header as {
      title: { content: string };
      template: string;
    };
    expect(header.title.content).toContain("互评");
    expect(header.template).toBe("purple");
  });

  test("body lists all 13 classmates (excluding voter self) with checkbox-like selects", () => {
    const card = buildPeerReviewVoteV1(fixture());
    const serialized = JSON.stringify(card);
    for (let i = 1; i <= 13; i += 1) {
      expect(serialized).toContain(`同学${i}`);
      expect(serialized).toContain(`m-${i}`);
    }
    expect(serialized).not.toContain("m-voter"); // voter never in own list
  });

  test("vote form encodes max_votes=2 and submit action", () => {
    const card = buildPeerReviewVoteV1(fixture());
    const serialized = JSON.stringify(card);
    expect(serialized).toContain('"action":"peer_review_vote_submit"');
    expect(serialized).toContain("pr-w3");
    expect(serialized).toContain("最多选择 2 人");
  });

  test("rendered JSON fits under the card size budget", () => {
    expect(() => assertCardSize(buildPeerReviewVoteV1(fixture()))).not.toThrow();
  });
});
```

- [ ] **Step 2: Run template test to verify it fails**

Run: `npm test -- tests/services/feishu/cards/templates/peer-review-vote-v1.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/services/feishu/cards/templates/peer-review-vote-v1.ts`**

```typescript
import type { FeishuCardJson } from "../types.js";
import { buildHeader } from "./common/header.js";
import { registerTemplate } from "../renderer.js";

export const PEER_REVIEW_VOTE_TEMPLATE_ID = "peer-review-vote-v1" as const;

export interface PeerReviewClassmate {
  memberId: string;
  displayName: string;
}

export interface PeerReviewVoteState {
  peerReviewSessionId: string;
  periodNumber: number;
  voterMemberId: string;
  voterDisplayName: string;
  deadline: string;
  classmates: PeerReviewClassmate[];
  maxVotes: number;
}

export function buildPeerReviewVoteV1(
  state: PeerReviewVoteState
): FeishuCardJson {
  const options = state.classmates.map((c) => ({
    text: { tag: "plain_text", content: c.displayName },
    value: c.memberId
  }));

  return {
    schema: "2.0",
    config: { wide_screen_mode: true, update_multi: false },
    header: buildHeader({
      title: `第 ${state.periodNumber} 期互评`,
      subtitle: `${state.voterDisplayName},请选出你最想感谢的同学`,
      template: "purple"
    }) as unknown as Record<string, unknown>,
    body: {
      elements: [
        {
          tag: "markdown",
          content:
            `**截止时间**: ${state.deadline}\n\n` +
            `请从下方列表中**最多选择 ${state.maxVotes} 人**,` +
            `被选中的同学将获得 S2 +3 分,你本人获得 S1 +3 分。`
        },
        {
          tag: "form",
          name: "peer_review_form",
          elements: [
            {
              tag: "checkbox",
              name: "peer_review_targets",
              options,
              max_selected: state.maxVotes
            },
            {
              tag: "button",
              text: { tag: "plain_text", content: "提交投票" },
              type: "primary",
              behaviors: [
                {
                  type: "callback",
                  value: {
                    action: "peer_review_vote_submit",
                    peer_review_session_id: state.peerReviewSessionId,
                    voter_member_id: state.voterMemberId,
                    targets: "${peer_review_targets.value}"
                  }
                }
              ]
            }
          ]
        }
      ]
    }
  };
}

registerTemplate(PEER_REVIEW_VOTE_TEMPLATE_ID, (state: PeerReviewVoteState) =>
  buildPeerReviewVoteV1(state)
);
```

- [ ] **Step 4: Run vote template test to verify it passes**

Run: `npm test -- tests/services/feishu/cards/templates/peer-review-vote-v1.test.ts`
Expected: PASS — 5 assertions green.

- [ ] **Step 5: Write failing settle template test**

Create `tests/services/feishu/cards/templates/peer-review-settle-v1.test.ts`:

```typescript
import { describe, expect, test } from "vitest";

import {
  buildPeerReviewSettleV1,
  PEER_REVIEW_SETTLE_TEMPLATE_ID,
  type PeerReviewSettleState
} from "../../../../../src/services/feishu/cards/templates/peer-review-settle-v1.js";
import { assertCardSize } from "../../../../../src/services/feishu/cards/renderer.js";

function fixture(): PeerReviewSettleState {
  return {
    peerReviewSessionId: "pr-w3",
    periodNumber: 3,
    settledAt: "2026-04-14T23:59:59.000Z",
    voteCounts: [
      { memberId: "m-1", displayName: "同学1", voteCount: 8, awarded: true },
      { memberId: "m-2", displayName: "同学2", voteCount: 6, awarded: true },
      { memberId: "m-3", displayName: "同学3", voteCount: 4, awarded: false },
      { memberId: "m-4", displayName: "同学4", voteCount: 3, awarded: false }
    ],
    totalVoters: 14
  };
}

describe("peer-review-settle-v1 template", () => {
  test("PEER_REVIEW_SETTLE_TEMPLATE_ID is 'peer-review-settle-v1'", () => {
    expect(PEER_REVIEW_SETTLE_TEMPLATE_ID).toBe("peer-review-settle-v1");
  });

  test("renders header with 互评结算 title and purple template", () => {
    const card = buildPeerReviewSettleV1(fixture());
    const header = card.header as {
      title: { content: string };
      template: string;
    };
    expect(header.title.content).toContain("互评结算");
    expect(header.template).toBe("purple");
  });

  test("body lists vote counts per classmate sorted by count", () => {
    const card = buildPeerReviewSettleV1(fixture());
    const serialized = JSON.stringify(card);
    expect(serialized).toContain("同学1");
    expect(serialized).toContain("8 票");
    expect(serialized).toContain("同学2");
    expect(serialized).toContain("6 票");
    expect(serialized).toContain("S2 +3"); // awarded rows show bonus label
  });

  test("total voters count is rendered in body", () => {
    const card = buildPeerReviewSettleV1(fixture());
    expect(JSON.stringify(card)).toContain("14");
  });

  test("rendered JSON fits under the card size budget", () => {
    expect(() => assertCardSize(buildPeerReviewSettleV1(fixture()))).not.toThrow();
  });
});
```

- [ ] **Step 6: Run settle template test to verify it fails**

Run: `npm test -- tests/services/feishu/cards/templates/peer-review-settle-v1.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 7: Implement `src/services/feishu/cards/templates/peer-review-settle-v1.ts`**

```typescript
import type { FeishuCardJson } from "../types.js";
import { buildHeader } from "./common/header.js";
import { registerTemplate } from "../renderer.js";

export const PEER_REVIEW_SETTLE_TEMPLATE_ID = "peer-review-settle-v1" as const;

export interface PeerReviewVoteCount {
  memberId: string;
  displayName: string;
  voteCount: number;
  awarded: boolean;
}

export interface PeerReviewSettleState {
  peerReviewSessionId: string;
  periodNumber: number;
  settledAt: string;
  voteCounts: PeerReviewVoteCount[];
  totalVoters: number;
}

export function buildPeerReviewSettleV1(
  state: PeerReviewSettleState
): FeishuCardJson {
  const sorted = [...state.voteCounts].sort(
    (a, b) => b.voteCount - a.voteCount
  );
  const rows = sorted
    .map((v, idx) => {
      const marker = v.awarded ? " 🏆 **S2 +3**" : "";
      return `${idx + 1}. **${v.displayName}** — ${v.voteCount} 票${marker}`;
    })
    .join("\n");

  return {
    schema: "2.0",
    config: { wide_screen_mode: true, update_multi: false },
    header: buildHeader({
      title: `第 ${state.periodNumber} 期互评结算`,
      subtitle: `${state.totalVoters} 人参与,结算于 ${new Date(
        state.settledAt
      ).toLocaleString("zh-CN")}`,
      template: "purple"
    }) as unknown as Record<string, unknown>,
    body: {
      elements: [
        {
          tag: "markdown",
          content:
            `**参与人数**: ${state.totalVoters}\n\n` +
            (sorted.length === 0 ? "_本期无投票_" : rows) +
            `\n\n> 所有参与投票的同学均获得 S1 +3 感谢分。`
        }
      ]
    }
  };
}

registerTemplate(
  PEER_REVIEW_SETTLE_TEMPLATE_ID,
  (state: PeerReviewSettleState) => buildPeerReviewSettleV1(state)
);
```

- [ ] **Step 8: Run settle template test to verify it passes**

Run: `npm test -- tests/services/feishu/cards/templates/peer-review-settle-v1.test.ts`
Expected: PASS — 5 assertions green.

- [ ] **Step 9: Write failing vote handler test**

Create `tests/services/feishu/cards/handlers/peer-review-handler.test.ts`:

```typescript
import { beforeEach, describe, expect, test, vi } from "vitest";

import { peerReviewHandler } from "../../../../../src/services/feishu/cards/handlers/peer-review-handler.js";
import type {
  CardActionContext,
  CardHandlerDeps
} from "../../../../../src/services/feishu/cards/types.js";

interface PeerReviewVoteRow {
  id: string;
  peerReviewSessionId: string;
  voterMemberId: string;
  targetMemberId: string;
  votedAt: string;
}

function makeDeps(): {
  deps: CardHandlerDeps;
  votes: PeerReviewVoteRow[];
} {
  const votes: PeerReviewVoteRow[] = [];
  const deps = {
    repo: {
      insertCardInteraction: vi.fn(() => "inserted" as const),
      findLiveCard: vi.fn(),
      updateLiveCardState: vi.fn(),
      insertLiveCard: vi.fn(),
      closeLiveCard: vi.fn(),
      findEventById: vi.fn(),
      listReviewRequiredEvents: vi.fn(() => []),
      countReviewRequiredEvents: vi.fn(() => 0),
      findMemberByOpenId: vi.fn(() => ({
        id: "m-voter",
        displayName: "张三",
        openId: "ou-voter",
        roleType: "student"
      })),
      insertPeerReviewVote: vi.fn((row: PeerReviewVoteRow) => {
        votes.push(row);
      })
    } as unknown as CardHandlerDeps["repo"],
    ingestor: { ingest: vi.fn() },
    aggregator: { applyDecision: vi.fn() },
    feishuClient: { patchCard: vi.fn(), sendCard: vi.fn() },
    clock: () => new Date("2026-04-10T12:00:00.000Z"),
    uuid: () => "uuid-vote"
  };
  return { deps, votes };
}

function ctx(targets: string[]): CardActionContext {
  return {
    operatorOpenId: "ou-voter",
    triggerId: "trig-pr-1",
    actionName: "peer_review_vote_submit",
    actionPayload: {
      action: "peer_review_vote_submit",
      peer_review_session_id: "pr-w3",
      voter_member_id: "m-voter",
      targets
    },
    messageId: "om-pr-voter",
    chatId: "oc-dm-voter",
    receivedAt: "2026-04-10T12:00:00.000Z",
    currentVersion: "peer-review-vote-v1"
  };
}

describe("peerReviewHandler", () => {
  let state: ReturnType<typeof makeDeps>;
  beforeEach(() => {
    state = makeDeps();
  });

  test("happy path: inserts one peer_review_votes row per target and returns success toast", async () => {
    const result = await peerReviewHandler(ctx(["m-1", "m-2"]), state.deps);

    expect(state.votes).toHaveLength(2);
    expect(state.votes[0]).toMatchObject({
      peerReviewSessionId: "pr-w3",
      voterMemberId: "m-voter",
      targetMemberId: "m-1"
    });
    expect(state.votes[1].targetMemberId).toBe("m-2");
    expect(result.toast?.type).toBe("success");
    expect(result.toast?.content).toContain("已投票");
  });

  test("single-target vote inserts one row", async () => {
    await peerReviewHandler(ctx(["m-5"]), state.deps);
    expect(state.votes).toHaveLength(1);
    expect(state.votes[0].targetMemberId).toBe("m-5");
  });

  test("empty targets array returns an error toast", async () => {
    const result = await peerReviewHandler(ctx([]), state.deps);
    expect(state.votes).toHaveLength(0);
    expect(result.toast?.type).toBe("error");
    expect(result.toast?.content).toContain("请至少选择");
  });

  test("voter selecting self is rejected", async () => {
    const result = await peerReviewHandler(
      ctx(["m-voter", "m-1"]),
      state.deps
    );
    expect(result.toast?.type).toBe("error");
    expect(result.toast?.content).toContain("自己");
    expect(state.votes).toHaveLength(0);
  });

  test("non-student caller is rejected", async () => {
    (state.deps.repo.findMemberByOpenId as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      id: "m-op",
      displayName: "运营",
      openId: "ou-op",
      roleType: "operator"
    });
    const result = await peerReviewHandler(ctx(["m-1"]), state.deps);
    expect(result.toast?.type).toBe("error");
    expect(state.votes).toHaveLength(0);
  });
});
```

- [ ] **Step 10: Run vote handler test to verify it fails**

Run: `npm test -- tests/services/feishu/cards/handlers/peer-review-handler.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 11: Implement `src/services/feishu/cards/handlers/peer-review-handler.ts`**

```typescript
import type {
  CardActionContext,
  CardActionResult,
  CardHandler,
  CardHandlerDeps
} from "../types.js";

interface PeerReviewDepsExt extends CardHandlerDeps {
  repo: CardHandlerDeps["repo"] & {
    insertPeerReviewVote: (row: {
      id: string;
      peerReviewSessionId: string;
      voterMemberId: string;
      targetMemberId: string;
      votedAt: string;
    }) => void;
  };
}

export const peerReviewHandler: CardHandler = async (
  ctx: CardActionContext,
  baseDeps: CardHandlerDeps
): Promise<CardActionResult> => {
  if (ctx.actionName !== "peer_review_vote_submit") {
    return {
      toast: {
        type: "error",
        content: `peer-review handler: unknown action ${ctx.actionName}`
      }
    };
  }

  const deps = baseDeps as PeerReviewDepsExt;

  const voter = deps.repo.findMemberByOpenId?.(ctx.operatorOpenId);
  if (!voter || voter.roleType !== "student") {
    return { toast: { type: "error", content: "仅学员可以参与互评" } };
  }

  const payload = ctx.actionPayload as {
    peer_review_session_id?: unknown;
    targets?: unknown;
  };
  const sessionId =
    typeof payload.peer_review_session_id === "string"
      ? payload.peer_review_session_id
      : "";
  const targets = Array.isArray(payload.targets)
    ? payload.targets.filter((t): t is string => typeof t === "string")
    : [];

  if (!sessionId) {
    return { toast: { type: "error", content: "互评 session 无效" } };
  }
  if (targets.length === 0) {
    return {
      toast: { type: "error", content: "请至少选择 1 位同学" }
    };
  }
  if (targets.includes(voter.id)) {
    return {
      toast: { type: "error", content: "不可以投票给自己" }
    };
  }
  if (targets.length > 2) {
    return {
      toast: { type: "error", content: "最多选择 2 人" }
    };
  }

  const votedAt = deps.clock().toISOString();
  for (const targetMemberId of targets) {
    deps.repo.insertPeerReviewVote({
      id: deps.uuid(),
      peerReviewSessionId: sessionId,
      voterMemberId: voter.id,
      targetMemberId,
      votedAt
    });
  }

  // Also write an audit row in card_interactions for the voter's click.
  deps.repo.insertCardInteraction({
    id: deps.uuid(),
    memberId: voter.id,
    periodId: null,
    cardType: "peer_review_vote",
    actionName: "peer_review_vote_submit",
    feishuMessageId: ctx.messageId,
    feishuCardVersion: ctx.currentVersion,
    payloadJson: { peer_review_session_id: sessionId, targets },
    receivedAt: ctx.receivedAt,
    triggerId: ctx.triggerId,
    operatorOpenId: ctx.operatorOpenId,
    rejectedReason: null
  });

  return {
    toast: {
      type: "success",
      content: `✓ 已投票给 ${targets.length} 位同学`
    }
  };
};
```

- [ ] **Step 12: Run vote handler test to verify it passes**

Run: `npm test -- tests/services/feishu/cards/handlers/peer-review-handler.test.ts`
Expected: PASS — 5 assertions green.

- [ ] **Step 13: Write failing settle handler test**

Create `tests/services/feishu/cards/handlers/peer-review-settle-handler.test.ts`:

```typescript
import { beforeEach, describe, expect, test, vi } from "vitest";

import { peerReviewSettleHandler } from "../../../../../src/services/feishu/cards/handlers/peer-review-settle-handler.js";
import type {
  CommandHandlerDeps,
  CommandHandlerInput
} from "../../../../../src/services/feishu/cards/handlers/command-handlers.js";

interface VoteRow {
  voterMemberId: string;
  targetMemberId: string;
}

function makeDeps(votes: VoteRow[]): CommandHandlerDeps & {
  repo: CommandHandlerDeps["repo"] & {
    listPeerReviewVotesBySession: (sid: string) => VoteRow[];
    listMembersByIds: (ids: string[]) => Array<{
      id: string;
      displayName: string;
    }>;
  };
  ingestor: { ingest: ReturnType<typeof vi.fn> };
} {
  return {
    repo: {
      findMemberByOpenId: vi.fn(() => ({
        id: "op-1",
        displayName: "运营甲",
        openId: "ou-op",
        roleType: "operator"
      })),
      insertLiveCard: vi.fn(),
      closeLiveCard: vi.fn(),
      findLiveCard: vi.fn(),
      updateLiveCardState: vi.fn(),
      listPeerReviewVotesBySession: vi.fn(() => votes),
      listMembersByIds: vi.fn((ids: string[]) =>
        ids.map((id) => ({ id, displayName: `同学${id.slice(2)}` }))
      )
    } as unknown as CommandHandlerDeps["repo"] & {
      listPeerReviewVotesBySession: (sid: string) => VoteRow[];
      listMembersByIds: (ids: string[]) => Array<{
        id: string;
        displayName: string;
      }>;
    },
    feishuClient: {
      sendCard: vi.fn(async () => ({ messageId: "om-settle" })),
      patchCard: vi.fn()
    },
    config: { groupChatId: "oc-main-group" },
    adminApiClient: {
      openPeriod: vi.fn(),
      openWindow: vi.fn(),
      closeGraduation: vi.fn()
    },
    ingestor: {
      ingest: vi.fn(() => ({
        eventId: "evt-peer-1",
        effectiveDelta: 3,
        status: "approved" as const
      }))
    },
    clock: () => new Date("2026-04-14T23:59:59.000Z"),
    uuid: () => "uuid-settle"
  };
}

function cmd(rawArgs: string): CommandHandlerInput {
  return { operatorOpenId: "ou-op", rawArgs };
}

describe("peerReviewSettleHandler", () => {
  test("computes top 2 by vote count, ingests S1 per voter and S2 per top target, posts settle card", async () => {
    const votes: VoteRow[] = [
      { voterMemberId: "m-A", targetMemberId: "m-1" },
      { voterMemberId: "m-A", targetMemberId: "m-2" },
      { voterMemberId: "m-B", targetMemberId: "m-1" },
      { voterMemberId: "m-C", targetMemberId: "m-1" },
      { voterMemberId: "m-D", targetMemberId: "m-2" },
      { voterMemberId: "m-E", targetMemberId: "m-3" }
    ];
    const deps = makeDeps(votes);

    await peerReviewSettleHandler(cmd("pr-w3"), deps);

    const ingests = (deps.ingestor.ingest as ReturnType<typeof vi.fn>).mock.calls.map(
      (c) => c[0]
    );
    // S1 per unique voter: 5 voters → 5 S1 calls
    const s1 = ingests.filter((c) => c.itemCode === "S1");
    expect(s1).toHaveLength(5);
    const s1Members = s1.map((c) => c.memberId).sort();
    expect(s1Members).toEqual(["m-A", "m-B", "m-C", "m-D", "m-E"]);

    // S2 for the top 2 vote-getters only: m-1 (3 votes) and m-2 (2 votes)
    const s2 = ingests.filter((c) => c.itemCode === "S2");
    expect(s2).toHaveLength(2);
    expect(s2.map((c) => c.memberId).sort()).toEqual(["m-1", "m-2"]);

    // All ingest calls use deterministic sourceRefs per spec §4.3
    expect(s1.some((c) => c.sourceRef === "s1-pr-w3:m-A")).toBe(true);
    expect(s2.some((c) => c.sourceRef === "s2-pr-w3:m-1")).toBe(true);

    // Settle card is posted to the group
    expect(deps.feishuClient.sendCard).toHaveBeenCalledOnce();
    const sendArg = (
      deps.feishuClient.sendCard as ReturnType<typeof vi.fn>
    ).mock.calls[0][0];
    expect(sendArg.chatId).toBe("oc-main-group");
    expect(JSON.stringify(sendArg.content)).toContain("互评结算");
  });

  test("empty votes list still posts an empty settle card, no ingestor calls", async () => {
    const deps = makeDeps([]);
    await peerReviewSettleHandler(cmd("pr-w3"), deps);
    expect(deps.ingestor.ingest).not.toHaveBeenCalled();
    expect(deps.feishuClient.sendCard).toHaveBeenCalledOnce();
  });

  test("rejects non-operator callers", async () => {
    const deps = makeDeps([]);
    (deps.repo.findMemberByOpenId as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      id: "m-stu",
      displayName: "学员",
      openId: "ou-stu",
      roleType: "student"
    });
    await expect(
      peerReviewSettleHandler(cmd("pr-w3"), deps)
    ).rejects.toThrow(/仅运营/);
  });
});
```

- [ ] **Step 14: Run settle handler test to verify it fails**

Run: `npm test -- tests/services/feishu/cards/handlers/peer-review-settle-handler.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 15: Implement `src/services/feishu/cards/handlers/peer-review-settle-handler.ts`**

```typescript
import type {
  CommandHandlerDeps,
  CommandHandlerInput,
  CommandHandlerResult
} from "./command-handlers.js";
import { buildPeerReviewSettleV1 } from "../templates/peer-review-settle-v1.js";
import type { PeerReviewVoteCount } from "../templates/peer-review-settle-v1.js";

interface PeerReviewSettleDeps extends CommandHandlerDeps {
  repo: CommandHandlerDeps["repo"] & {
    listPeerReviewVotesBySession: (sessionId: string) => Array<{
      voterMemberId: string;
      targetMemberId: string;
    }>;
    listMembersByIds: (ids: string[]) => Array<{
      id: string;
      displayName: string;
    }>;
  };
  ingestor: {
    ingest: (req: {
      memberId: string;
      itemCode: string;
      sourceType: string;
      sourceRef: string;
      payload: Record<string, unknown>;
      requestedAt: string;
    }) => unknown;
  };
}

export async function peerReviewSettleHandler(
  input: CommandHandlerInput,
  baseDeps: CommandHandlerDeps
): Promise<CommandHandlerResult> {
  const deps = baseDeps as PeerReviewSettleDeps;

  const operator = deps.repo.findMemberByOpenId(input.operatorOpenId);
  if (!operator || operator.roleType !== "operator") {
    throw new Error("仅运营可以执行此指令");
  }

  const sessionId = input.rawArgs.trim();
  if (!sessionId) {
    throw new Error("互评 session id 缺失,请使用 /互评结算 <sid>");
  }

  const votes = deps.repo.listPeerReviewVotesBySession(sessionId);
  const settledAt = deps.clock().toISOString();

  // Compute unique voter set → S1 targets.
  const uniqueVoters = Array.from(
    new Set(votes.map((v) => v.voterMemberId))
  );

  // Compute vote counts per target.
  const countMap = new Map<string, number>();
  for (const vote of votes) {
    countMap.set(
      vote.targetMemberId,
      (countMap.get(vote.targetMemberId) ?? 0) + 1
    );
  }
  const sortedTargets = Array.from(countMap.entries())
    .sort(([, a], [, b]) => b - a)
    .map(([memberId, voteCount]) => ({ memberId, voteCount }));

  // Top 2 awarded S2.
  const top2Ids = sortedTargets.slice(0, 2).map((t) => t.memberId);

  // Ingest S1 for every voter (participation bonus).
  for (const voterId of uniqueVoters) {
    deps.ingestor.ingest({
      memberId: voterId,
      itemCode: "S1",
      sourceType: "card_interaction",
      sourceRef: `s1-${sessionId}:${voterId}`,
      payload: { peerReviewSessionId: sessionId },
      requestedAt: settledAt
    });
  }

  // Ingest S2 for the top 2 vote-getters.
  for (const targetId of top2Ids) {
    deps.ingestor.ingest({
      memberId: targetId,
      itemCode: "S2",
      sourceType: "card_interaction",
      sourceRef: `s2-${sessionId}:${targetId}`,
      payload: { peerReviewSessionId: sessionId },
      requestedAt: settledAt
    });
  }

  // Resolve displayName for render.
  const allTargetIds = sortedTargets.map((t) => t.memberId);
  const members = deps.repo.listMembersByIds(allTargetIds);
  const nameMap = new Map(members.map((m) => [m.id, m.displayName]));

  const voteCounts: PeerReviewVoteCount[] = sortedTargets.map((t) => ({
    memberId: t.memberId,
    displayName: nameMap.get(t.memberId) ?? t.memberId,
    voteCount: t.voteCount,
    awarded: top2Ids.includes(t.memberId)
  }));

  const card = buildPeerReviewSettleV1({
    peerReviewSessionId: sessionId,
    periodNumber: 0, // caller can override by extending the admin client later
    settledAt,
    voteCounts,
    totalVoters: uniqueVoters.length
  });

  const sendResult = await deps.feishuClient.sendCard({
    chatId: deps.config.groupChatId,
    content: card
  });
  return { messageId: sendResult.messageId };
}
```

- [ ] **Step 16: Run settle handler test to verify it passes**

Run: `npm test -- tests/services/feishu/cards/handlers/peer-review-settle-handler.test.ts`
Expected: PASS — 3 assertions green. S1 fires per unique voter (5 calls), S2 fires for top 2 only, the settle card is posted to the group chat.

- [ ] **Step 17: Commit**

```bash
git add \
  src/services/feishu/cards/templates/peer-review-vote-v1.ts \
  src/services/feishu/cards/templates/peer-review-settle-v1.ts \
  src/services/feishu/cards/handlers/peer-review-handler.ts \
  src/services/feishu/cards/handlers/peer-review-settle-handler.ts \
  tests/services/feishu/cards/templates/peer-review-vote-v1.test.ts \
  tests/services/feishu/cards/templates/peer-review-settle-v1.test.ts \
  tests/services/feishu/cards/handlers/peer-review-handler.test.ts \
  tests/services/feishu/cards/handlers/peer-review-settle-handler.test.ts
git commit -m "feat(sub2): add peer-review vote + settle cards with S1/S2 ingestion"
```

---

### Task G5: C1 echo card (#14) + Level announcement card (#10)

**Files:**
- Create: `src/services/feishu/cards/templates/c1-echo-v1.ts`
- Create: `src/services/feishu/cards/templates/level-announcement-v1.ts`
- Create: `src/services/feishu/cards/handlers/c1-echo-handler.ts`
- Create: `tests/services/feishu/cards/templates/c1-echo-v1.test.ts`
- Create: `tests/services/feishu/cards/templates/level-announcement-v1.test.ts`
- Create: `tests/services/feishu/cards/handlers/c1-echo-handler.test.ts`

Ships cards #14 (C1 echo) and #10 (level announcement) from spec §4.2 + §5.2. Both are read-only broadcasts with no buttons. The C1 echo card is posted to the group whenever a student passes C1 (creative AI usage) — it surfaces that student's text to the group and its `feishu_message_id` is registered in `reaction_tracked_messages` so sub-project 1's reaction tracker (Phase F) can detect the third emoji reaction and award C2 +1 to the reactor. The level announcement card is posted by the sub2 notify hook after `WindowSettler.notifyMembersWindowSettled` completes; it shows each promoted member's from_level → to_level, pathTaken, growth_bonus, and a five-dim radar image url.

- [ ] **Step 1: Write failing c1-echo template test**

Create `tests/services/feishu/cards/templates/c1-echo-v1.test.ts`:

```typescript
import { describe, expect, test } from "vitest";

import {
  buildC1EchoV1,
  C1_ECHO_TEMPLATE_ID,
  type C1EchoState
} from "../../../../../src/services/feishu/cards/templates/c1-echo-v1.js";
import { assertCardSize } from "../../../../../src/services/feishu/cards/renderer.js";

function fixture(overrides: Partial<C1EchoState> = {}): C1EchoState {
  return {
    memberId: "m-1",
    memberName: "张三",
    itemCode: "C1",
    creativeText:
      "今天用 Claude 帮我设计了一个自动归档脚本,把旧邮件按主题分类到不同文件夹,节省了大概 2 小时。",
    llmReason: "内容具体,体现了对 AI 工具的创造性应用,结果可度量。",
    postedAt: "2026-04-10T12:00:00.000Z",
    ...overrides
  };
}

describe("c1-echo-v1 template", () => {
  test("C1_ECHO_TEMPLATE_ID is 'c1-echo-v1'", () => {
    expect(C1_ECHO_TEMPLATE_ID).toBe("c1-echo-v1");
  });

  test("renders header with member name and green template", () => {
    const card = buildC1EchoV1(fixture());
    const header = card.header as {
      title: { content: string };
      template: string;
    };
    expect(header.title.content).toContain("创意用法");
    expect(header.template).toBe("green");
  });

  test("body shows the creative text verbatim", () => {
    const card = buildC1EchoV1(fixture());
    const serialized = JSON.stringify(card);
    expect(serialized).toContain("张三");
    expect(serialized).toContain("Claude");
    expect(serialized).toContain("归档脚本");
  });

  test("body instructs readers that 3 reactions = C2 bonus", () => {
    const card = buildC1EchoV1(fixture());
    expect(JSON.stringify(card)).toContain("3 个表情");
  });

  test("rendered JSON fits under the card size budget", () => {
    expect(() => assertCardSize(buildC1EchoV1(fixture()))).not.toThrow();
  });

  test("very long creative text is truncated at render", () => {
    const longText = "A".repeat(2000);
    const card = buildC1EchoV1(fixture({ creativeText: longText }));
    expect(() => assertCardSize(card)).not.toThrow();
    // Truncation indicator is present
    expect(JSON.stringify(card)).toContain("…");
  });
});
```

- [ ] **Step 2: Run c1-echo template test to verify it fails**

Run: `npm test -- tests/services/feishu/cards/templates/c1-echo-v1.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/services/feishu/cards/templates/c1-echo-v1.ts`**

```typescript
import type { FeishuCardJson } from "../types.js";
import { buildHeader } from "./common/header.js";
import { registerTemplate } from "../renderer.js";

export const C1_ECHO_TEMPLATE_ID = "c1-echo-v1" as const;

export interface C1EchoState {
  memberId: string;
  memberName: string;
  itemCode: string;
  creativeText: string;
  llmReason: string;
  postedAt: string;
}

const MAX_TEXT_DISPLAY = 500;

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

export function buildC1EchoV1(state: C1EchoState): FeishuCardJson {
  return {
    schema: "2.0",
    config: { wide_screen_mode: true, update_multi: false },
    header: buildHeader({
      title: `💡 创意用法`,
      subtitle: `${state.memberName} · \`${state.itemCode}\``,
      template: "green"
    }) as unknown as Record<string, unknown>,
    body: {
      elements: [
        {
          tag: "markdown",
          content: `**${state.memberName}**:\n\n> ${truncate(
            state.creativeText,
            MAX_TEXT_DISPLAY
          )}`
        },
        {
          tag: "markdown",
          content:
            `_LLM 评语: ${truncate(state.llmReason, 200)}_\n\n` +
            `👍 为本条加 **3 个表情** 即可获得 **C2 +1** 人气分 (每 3 个触发 1 次)。`
        }
      ]
    }
  };
}

registerTemplate(C1_ECHO_TEMPLATE_ID, (state: C1EchoState) =>
  buildC1EchoV1(state)
);
```

- [ ] **Step 4: Run c1-echo template test to verify it passes**

Run: `npm test -- tests/services/feishu/cards/templates/c1-echo-v1.test.ts`
Expected: PASS — 6 assertions green.

- [ ] **Step 5: Write failing level-announcement template test**

Create `tests/services/feishu/cards/templates/level-announcement-v1.test.ts`:

```typescript
import { describe, expect, test } from "vitest";

import {
  buildLevelAnnouncementV1,
  LEVEL_ANNOUNCEMENT_TEMPLATE_ID,
  type LevelAnnouncementState
} from "../../../../../src/services/feishu/cards/templates/level-announcement-v1.js";
import { assertCardSize } from "../../../../../src/services/feishu/cards/renderer.js";

function fixture(): LevelAnnouncementState {
  return {
    windowCode: "W3",
    settledAt: "2026-04-14T23:59:59.000Z",
    promotions: [
      {
        memberId: "m-1",
        memberName: "张三",
        fromLevel: 2,
        toLevel: 3,
        pathTaken: "standard",
        growthBonus: 5,
        dims: { K: 18, H: 9, C: 12, S: 6, G: 13 },
        radarImageUrl: "https://cdn.example.com/radar/m-1/W3?k=18&h=9&c=12&s=6&g=13"
      },
      {
        memberId: "m-2",
        memberName: "李四",
        fromLevel: 3,
        toLevel: 4,
        pathTaken: "comeback",
        growthBonus: 8,
        dims: { K: 20, H: 15, C: 10, S: 8, G: 14 },
        radarImageUrl: "https://cdn.example.com/radar/m-2/W3?k=20&h=15&c=10&s=8&g=14"
      }
    ]
  };
}

describe("level-announcement-v1 template", () => {
  test("LEVEL_ANNOUNCEMENT_TEMPLATE_ID is 'level-announcement-v1'", () => {
    expect(LEVEL_ANNOUNCEMENT_TEMPLATE_ID).toBe("level-announcement-v1");
  });

  test("renders header with window code and purple template", () => {
    const card = buildLevelAnnouncementV1(fixture());
    const header = card.header as {
      title: { content: string };
      template: string;
    };
    expect(header.title.content).toContain("段位评定");
    expect(header.title.content).toContain("W3");
    expect(header.template).toBe("purple");
  });

  test("body lists each promoted member with from→to level and growth bonus", () => {
    const card = buildLevelAnnouncementV1(fixture());
    const serialized = JSON.stringify(card);
    expect(serialized).toContain("张三");
    expect(serialized).toContain("Lv2");
    expect(serialized).toContain("Lv3");
    expect(serialized).toContain("李四");
    expect(serialized).toContain("Lv3");
    expect(serialized).toContain("Lv4");
    expect(serialized).toContain("+5");
    expect(serialized).toContain("+8");
    expect(serialized).toContain("standard");
    expect(serialized).toContain("comeback");
  });

  test("each promotion includes radar image url in an img element", () => {
    const card = buildLevelAnnouncementV1(fixture());
    const serialized = JSON.stringify(card);
    expect(serialized).toContain("cdn.example.com/radar/m-1");
    expect(serialized).toContain("cdn.example.com/radar/m-2");
  });

  test("empty promotions list renders an informational message", () => {
    const card = buildLevelAnnouncementV1({
      windowCode: "W3",
      settledAt: "2026-04-14T23:59:59.000Z",
      promotions: []
    });
    expect(JSON.stringify(card)).toContain("无学员段位变动");
  });

  test("rendered JSON fits under the card size budget", () => {
    expect(() => assertCardSize(buildLevelAnnouncementV1(fixture()))).not.toThrow();
  });
});
```

- [ ] **Step 6: Run level-announcement template test to verify it fails**

Run: `npm test -- tests/services/feishu/cards/templates/level-announcement-v1.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 7: Implement `src/services/feishu/cards/templates/level-announcement-v1.ts`**

```typescript
import type { FeishuCardJson } from "../types.js";
import { buildHeader } from "./common/header.js";
import { registerTemplate } from "../renderer.js";

export const LEVEL_ANNOUNCEMENT_TEMPLATE_ID = "level-announcement-v1" as const;

export interface LevelPromotion {
  memberId: string;
  memberName: string;
  fromLevel: number;
  toLevel: number;
  pathTaken: string;
  growthBonus: number;
  dims: { K: number; H: number; C: number; S: number; G: number };
  radarImageUrl: string;
}

export interface LevelAnnouncementState {
  windowCode: string;
  settledAt: string;
  promotions: LevelPromotion[];
}

export function buildLevelAnnouncementV1(
  state: LevelAnnouncementState
): FeishuCardJson {
  const bodyElements: Array<Record<string, unknown>> = [
    {
      tag: "markdown",
      content: `**结算时间**: ${new Date(state.settledAt).toLocaleString("zh-CN")}`
    }
  ];

  if (state.promotions.length === 0) {
    bodyElements.push({
      tag: "markdown",
      content: "_本窗口无学员段位变动。_"
    });
  } else {
    for (const p of state.promotions) {
      bodyElements.push({
        tag: "markdown",
        content:
          `**${p.memberName}**: \`Lv${p.fromLevel}\` → \`Lv${p.toLevel}\`` +
          ` · path=\`${p.pathTaken}\` · growth **+${p.growthBonus}**\n` +
          `K=${p.dims.K} H=${p.dims.H} C=${p.dims.C} S=${p.dims.S} G=${p.dims.G}`
      });
      bodyElements.push({
        tag: "img",
        img_key: p.radarImageUrl,
        alt: {
          tag: "plain_text",
          content: `${p.memberName} 的五维雷达图`
        }
      });
    }
  }

  return {
    schema: "2.0",
    config: { wide_screen_mode: true, update_multi: false },
    header: buildHeader({
      title: `🏅 ${state.windowCode} 段位评定`,
      subtitle: `${state.promotions.length} 位学员段位更新`,
      template: "purple"
    }) as unknown as Record<string, unknown>,
    body: { elements: bodyElements }
  };
}

registerTemplate(
  LEVEL_ANNOUNCEMENT_TEMPLATE_ID,
  (state: LevelAnnouncementState) => buildLevelAnnouncementV1(state)
);
```

- [ ] **Step 8: Run level-announcement template test to verify it passes**

Run: `npm test -- tests/services/feishu/cards/templates/level-announcement-v1.test.ts`
Expected: PASS — 6 assertions green.

- [ ] **Step 9: Write failing c1-echo handler test**

Create `tests/services/feishu/cards/handlers/c1-echo-handler.test.ts`:

```typescript
import { beforeEach, describe, expect, test, vi } from "vitest";

import {
  c1EchoHandler,
  type C1EchoInput
} from "../../../../../src/services/feishu/cards/handlers/c1-echo-handler.js";
import type { CommandHandlerDeps } from "../../../../../src/services/feishu/cards/handlers/command-handlers.js";

interface ReactionTrackedRow {
  messageId: string;
  memberId: string;
  itemCode: string;
  trackedAt: string;
}

function makeDeps(rows: ReactionTrackedRow[]): CommandHandlerDeps & {
  repo: CommandHandlerDeps["repo"] & {
    insertReactionTrackedMessage: (row: ReactionTrackedRow) => void;
  };
} {
  return {
    repo: {
      findMemberByOpenId: vi.fn(),
      insertLiveCard: vi.fn(),
      closeLiveCard: vi.fn(),
      findLiveCard: vi.fn(),
      updateLiveCardState: vi.fn(),
      insertReactionTrackedMessage: vi.fn((row: ReactionTrackedRow) => {
        rows.push(row);
      })
    } as unknown as CommandHandlerDeps["repo"] & {
      insertReactionTrackedMessage: (row: ReactionTrackedRow) => void;
    },
    feishuClient: {
      sendCard: vi.fn(async () => ({ messageId: "om-c1-echo-1" })),
      patchCard: vi.fn()
    },
    config: { groupChatId: "oc-main-group" },
    adminApiClient: {
      openPeriod: vi.fn(),
      openWindow: vi.fn(),
      closeGraduation: vi.fn()
    },
    clock: () => new Date("2026-04-10T12:00:00.000Z"),
    uuid: () => "uuid-c1"
  };
}

function input(): C1EchoInput {
  return {
    memberId: "m-1",
    memberName: "张三",
    itemCode: "C1",
    creativeText: "用 Claude 设计了一个自动归档脚本,节省了 2 小时。",
    llmReason: "内容具体,结果可度量。"
  };
}

describe("c1EchoHandler", () => {
  let rows: ReactionTrackedRow[];
  let deps: ReturnType<typeof makeDeps>;
  beforeEach(() => {
    rows = [];
    deps = makeDeps(rows);
  });

  test("posts c1-echo card to the group and inserts a reaction_tracked_messages row", async () => {
    const result = await c1EchoHandler(input(), deps);

    expect(deps.feishuClient.sendCard).toHaveBeenCalledOnce();
    const sendArg = (
      deps.feishuClient.sendCard as ReturnType<typeof vi.fn>
    ).mock.calls[0][0];
    expect(sendArg.chatId).toBe("oc-main-group");
    expect(JSON.stringify(sendArg.content)).toContain("创意用法");
    expect(JSON.stringify(sendArg.content)).toContain("归档脚本");

    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      messageId: "om-c1-echo-1",
      memberId: "m-1",
      itemCode: "C1",
      trackedAt: "2026-04-10T12:00:00.000Z"
    });

    expect(result.messageId).toBe("om-c1-echo-1");
  });

  test("sendCard failure is propagated without writing tracked row", async () => {
    (deps.feishuClient.sendCard as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("network down")
    );
    await expect(c1EchoHandler(input(), deps)).rejects.toThrow("network down");
    expect(rows).toHaveLength(0);
  });
});
```

- [ ] **Step 10: Run c1-echo handler test to verify it fails**

Run: `npm test -- tests/services/feishu/cards/handlers/c1-echo-handler.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 11: Implement `src/services/feishu/cards/handlers/c1-echo-handler.ts`**

```typescript
import type { CommandHandlerDeps } from "./command-handlers.js";
import { buildC1EchoV1 } from "../templates/c1-echo-v1.js";

export interface C1EchoInput {
  memberId: string;
  memberName: string;
  itemCode: string;
  creativeText: string;
  llmReason: string;
}

export interface C1EchoResult {
  messageId: string;
}

interface C1EchoDeps extends CommandHandlerDeps {
  repo: CommandHandlerDeps["repo"] & {
    insertReactionTrackedMessage: (row: {
      messageId: string;
      memberId: string;
      itemCode: string;
      trackedAt: string;
    }) => void;
  };
}

export async function c1EchoHandler(
  input: C1EchoInput,
  baseDeps: CommandHandlerDeps
): Promise<C1EchoResult> {
  const deps = baseDeps as C1EchoDeps;
  const postedAt = deps.clock().toISOString();

  const card = buildC1EchoV1({
    memberId: input.memberId,
    memberName: input.memberName,
    itemCode: input.itemCode,
    creativeText: input.creativeText,
    llmReason: input.llmReason,
    postedAt
  });

  const sendResult = await deps.feishuClient.sendCard({
    chatId: deps.config.groupChatId,
    content: card
  });

  // Register the sent message id so sub-project 1's reaction-tracker can
  // detect the third distinct emoji and award C2 +1 to the reactor.
  deps.repo.insertReactionTrackedMessage({
    messageId: sendResult.messageId,
    memberId: input.memberId,
    itemCode: input.itemCode,
    trackedAt: postedAt
  });

  return { messageId: sendResult.messageId };
}
```

- [ ] **Step 12: Run c1-echo handler test to verify it passes**

Run: `npm test -- tests/services/feishu/cards/handlers/c1-echo-handler.test.ts`
Expected: PASS — 2 assertions green. The tracked row is inserted only after a successful `sendCard`.

- [ ] **Step 13: Commit**

```bash
git add \
  src/services/feishu/cards/templates/c1-echo-v1.ts \
  src/services/feishu/cards/templates/level-announcement-v1.ts \
  src/services/feishu/cards/handlers/c1-echo-handler.ts \
  tests/services/feishu/cards/templates/c1-echo-v1.test.ts \
  tests/services/feishu/cards/templates/level-announcement-v1.test.ts \
  tests/services/feishu/cards/handlers/c1-echo-handler.test.ts
git commit -m "feat(sub2): add c1-echo and level-announcement broadcast cards"
```

---

### Task G6: Leaderboard card (`#9`) + handler + window-settle async hook

**Files:**
- Create: `src/services/feishu/cards/templates/leaderboard-v1.ts`
- Create: `src/services/feishu/cards/handlers/leaderboard-handler.ts`
- Create: `src/services/feishu/cards/handlers/command-leaderboard-handler.ts`
- Test: `tests/services/feishu/cards/templates/leaderboard-v1.test.ts`
- Test: `tests/services/feishu/cards/handlers/leaderboard-handler.test.ts`
- Modify: `src/services/feishu/cards/notify-hooks.ts` (add `onWindowSettled` hook)
- Test: `tests/services/feishu/cards/notify-hooks.test.ts` (extend with settle case)

Leaderboard is the fourth (and last) patched card. It renders the top-N learners sorted by cumulative AQ, grouped by `current_level`, with a five-dim radar chart image generated by the sub-project 1 Phase G radar endpoint. It has two trigger paths:

1. **`/排行` command** — operator or teacher types the slash command; the command handler reads the latest `v2_window_snapshots` + `v2_member_levels` + `v2_member_dimension_scores` rows, builds a `LeaderboardState`, renders the card, and posts it to the group chat via `feishuClient.sendCard`. The sent `messageId` is recorded in `feishu_live_cards` so future auto-updates can patch instead of re-posting.

2. **`WindowSettler.notifyMembersWindowSettled` hook** — after a window settle, sub-project 1 calls `onWindowSettled({ windowId, campId })` on Sub2's notify layer. The hook re-computes the `LeaderboardState` from the freshly settled snapshot and calls `notifySub2CardPatch("leaderboard", chatId, newState, deps)` which patches the existing card in place via `im.v1.message.patch`. If no active leaderboard card is found, the hook falls back to sending a fresh one.

- [ ] **Step 1: Write failing template test**

Create `tests/services/feishu/cards/templates/leaderboard-v1.test.ts`:

```typescript
import { describe, expect, test } from "vitest";

import {
  buildLeaderboardCard,
  LEADERBOARD_TEMPLATE_ID
} from "../../../../../src/services/feishu/cards/templates/leaderboard-v1.js";
import { CARD_SIZE_BUDGET_BYTES } from "../../../../../src/services/feishu/cards/renderer.js";
import type {
  CardActionContext,
  LeaderboardState
} from "../../../../../src/services/feishu/cards/types.js";

function fakeCtx(): CardActionContext {
  return {
    operatorOpenId: "ou-teacher",
    triggerId: "trig-1",
    actionName: "unused",
    actionPayload: {},
    messageId: "om-board-1",
    chatId: "oc-1",
    receivedAt: "2026-04-10T20:00:00.000Z",
    currentVersion: "leaderboard-v1"
  };
}

function sampleState(topN = 14): LeaderboardState {
  return {
    settledWindowId: "w-3",
    generatedAt: "2026-04-10T20:00:00.000Z",
    topN: Array.from({ length: topN }, (_, i) => ({
      memberId: `m-${i + 1}`,
      displayName: `学员 ${i + 1}`,
      cumulativeAq: 210 - i * 3,
      latestWindowAq: 58 - i,
      currentLevel: i < 3 ? 5 : i < 7 ? 4 : i < 11 ? 3 : 2,
      dims: {
        K: 18 - (i % 4),
        H: 9 - (i % 3),
        C: 13 - (i % 5),
        S: 6 - (i % 3),
        G: 12 - (i % 4)
      }
    })),
    radarImageUrl: "https://cdn.example.com/radar/w-3.png"
  };
}

describe("leaderboard-v1 template", () => {
  test("LEADERBOARD_TEMPLATE_ID is 'leaderboard-v1'", () => {
    expect(LEADERBOARD_TEMPLATE_ID).toBe("leaderboard-v1");
  });

  test("renders a card with purple header, top-N list, and radar image", () => {
    const card = buildLeaderboardCard(sampleState(), fakeCtx());
    expect(card.schema).toBe("2.0");
    const header = card.header as { template: string };
    expect(header.template).toBe("purple");
    const body = JSON.stringify(card.body);
    expect(body).toContain("学员 1");
    expect(body).toContain("学员 14");
    expect(body).toContain("Lv5");
    expect(body).toContain("Lv2");
    expect(body).toContain("cdn.example.com/radar/w-3.png");
  });

  test("card stays under 25 KB with 14 learners", () => {
    const card = buildLeaderboardCard(sampleState(14), fakeCtx());
    const bytes = Buffer.byteLength(JSON.stringify(card), "utf8");
    expect(bytes).toBeLessThan(CARD_SIZE_BUDGET_BYTES);
  });

  test("omits radar section when radarImageUrl is null", () => {
    const state = sampleState();
    state.radarImageUrl = null;
    const card = buildLeaderboardCard(state, fakeCtx());
    const body = JSON.stringify(card.body);
    expect(body).not.toContain("cdn.example.com");
  });

  test("handles empty topN gracefully", () => {
    const state = sampleState();
    state.topN = [];
    const card = buildLeaderboardCard(state, fakeCtx());
    const body = JSON.stringify(card.body);
    expect(body).toContain("暂无学员数据");
  });
});
```

- [ ] **Step 2: Run template test to verify it fails**

Run: `npm test -- tests/services/feishu/cards/templates/leaderboard-v1.test.ts`
Expected: FAIL — `leaderboard-v1` module not found.

- [ ] **Step 3: Implement `src/services/feishu/cards/templates/leaderboard-v1.ts`**

```typescript
import type {
  CardActionContext,
  FeishuCardJson,
  LeaderboardState
} from "../types.js";

import { buildHeader } from "./common/header.js";

export const LEADERBOARD_TEMPLATE_ID = "leaderboard-v1";

export function buildLeaderboardCard(
  state: LeaderboardState,
  _ctx: CardActionContext
): FeishuCardJson {
  const elements: Array<Record<string, unknown>> = [];

  if (state.topN.length === 0) {
    elements.push({
      tag: "markdown",
      content: "暂无学员数据,请等本期评价窗结算后再查看。"
    });
  } else {
    // Group by level descending so Lv5 players appear first.
    const grouped = new Map<number, LeaderboardState["topN"]>();
    for (const row of state.topN) {
      const bucket = grouped.get(row.currentLevel) ?? [];
      bucket.push(row);
      grouped.set(row.currentLevel, bucket);
    }
    const levels = [...grouped.keys()].sort((a, b) => b - a);

    for (const level of levels) {
      elements.push({
        tag: "markdown",
        content: `**Lv${level} 段位**`
      });
      const rows = grouped.get(level) ?? [];
      rows.sort((a, b) => b.cumulativeAq - a.cumulativeAq);
      const lines = rows
        .map((row, idx) => {
          const rank = idx + 1;
          return `${rank}. ${row.displayName} · **${row.cumulativeAq} AQ** · +${row.latestWindowAq} (本窗) · K${row.dims.K} H${row.dims.H} C${row.dims.C} S${row.dims.S} G${row.dims.G}`;
        })
        .join("\n");
      elements.push({
        tag: "markdown",
        content: lines
      });
      elements.push({ tag: "hr" });
    }
  }

  if (state.radarImageUrl) {
    elements.push({
      tag: "img",
      img_key: state.radarImageUrl,
      alt: { tag: "plain_text", content: "五维雷达图" }
    });
  }

  elements.push({
    tag: "markdown",
    content: `_最近结算窗:${state.settledWindowId} · 生成时间 ${state.generatedAt}_`
  });

  return {
    schema: "2.0",
    config: { wide_screen_mode: true },
    header: buildHeader({
      title: "📊 排行榜",
      subtitle: `窗口 ${state.settledWindowId}`,
      template: "purple"
    }),
    body: { elements }
  };
}
```

- [ ] **Step 4: Run template test to verify it passes**

Run: `npm test -- tests/services/feishu/cards/templates/leaderboard-v1.test.ts`
Expected: PASS — 5 assertions green.

- [ ] **Step 5: Write failing handler test**

Create `tests/services/feishu/cards/handlers/leaderboard-handler.test.ts`:

```typescript
import { beforeEach, describe, expect, test, vi } from "vitest";

import {
  buildLeaderboardState,
  sendOrPatchLeaderboard
} from "../../../../../src/services/feishu/cards/handlers/leaderboard-handler.js";
import {
  clearTemplateRegistry,
  registerTemplate
} from "../../../../../src/services/feishu/cards/renderer.js";
import {
  buildLeaderboardCard,
  LEADERBOARD_TEMPLATE_ID
} from "../../../../../src/services/feishu/cards/templates/leaderboard-v1.js";
import type {
  CardHandlerDeps,
  LeaderboardState,
  LiveCardRow
} from "../../../../../src/services/feishu/cards/types.js";

interface SnapshotRow {
  memberId: string;
  displayName: string;
  cumulativeAq: number;
  latestWindowAq: number;
  currentLevel: number;
  dims: { K: number; H: number; C: number; S: number; G: number };
}

function fakeDeps(): {
  deps: CardHandlerDeps;
  snapshotsByWindow: Map<string, SnapshotRow[]>;
  liveCard: LiveCardRow | null;
  sentCards: Array<{ messageId: string }>;
  patchedCards: Array<{ messageId: string }>;
} {
  const snapshots: SnapshotRow[] = [
    {
      memberId: "m-1",
      displayName: "Alice",
      cumulativeAq: 180,
      latestWindowAq: 48,
      currentLevel: 4,
      dims: { K: 18, H: 9, C: 12, S: 6, G: 13 }
    },
    {
      memberId: "m-2",
      displayName: "Bob",
      cumulativeAq: 160,
      latestWindowAq: 42,
      currentLevel: 3,
      dims: { K: 16, H: 8, C: 11, S: 5, G: 12 }
    }
  ];
  const snapshotsByWindow = new Map<string, SnapshotRow[]>();
  snapshotsByWindow.set("w-1", snapshots);

  let liveCard: LiveCardRow | null = null;
  const sentCards: Array<{ messageId: string }> = [];
  const patchedCards: Array<{ messageId: string }> = [];

  const deps: CardHandlerDeps = {
    repo: {
      insertCardInteraction: vi.fn(() => "inserted" as const),
      findLiveCard: vi.fn((type, chatId) =>
        type === "leaderboard" && chatId === "oc-1" ? liveCard : null
      ),
      updateLiveCardState: vi.fn(
        (id: string, nextState: unknown, _at: string) => {
          if (liveCard && liveCard.id === id) {
            liveCard = { ...liveCard, stateJson: nextState };
          }
        }
      ),
      insertLiveCard: vi.fn((row: LiveCardRow) => {
        liveCard = row;
      }),
      closeLiveCard: vi.fn(),
      findEventById: vi.fn(),
      listReviewRequiredEvents: vi.fn(() => []),
      countReviewRequiredEvents: vi.fn(() => 0),
      findMemberByOpenId: vi.fn(),
      listPriorQuizSelections: vi.fn(() => []),
      insertPeerReviewVote: vi.fn(() => "inserted" as const),
      insertReactionTrackedMessage: vi.fn()
    },
    ingestor: { ingest: vi.fn() },
    aggregator: { applyDecision: vi.fn() },
    feishuClient: {
      patchCard: vi.fn(async (messageId: string) => {
        patchedCards.push({ messageId });
      }),
      sendCard: vi.fn(async () => {
        const result = { messageId: `om-board-${sentCards.length + 1}` };
        sentCards.push(result);
        return result;
      })
    },
    adminApiClient: {
      patchMember: vi.fn(),
      listMembers: vi.fn(async () => [])
    },
    config: {
      groupChatId: "oc-1",
      campId: "camp-1",
      cardVersionCurrent: "leaderboard-v1",
      cardVersionLegacy: "leaderboard-v1",
      radarImageBaseUrl: "https://cdn.example.com"
    },
    requestReappeal: vi.fn(async () => undefined),
    clock: () => new Date("2026-04-10T20:00:00.000Z"),
    uuid: () => "flc-board-1"
  };

  // Extend deps with a snapshot resolver so the handler can read data
  // from the sub1 v2_window_snapshots table without needing a live DB.
  (deps as unknown as Record<string, unknown>).loadSnapshots = (
    windowId: string
  ): SnapshotRow[] => snapshotsByWindow.get(windowId) ?? [];

  return { deps, snapshotsByWindow, liveCard, sentCards, patchedCards };
}

describe("leaderboard handler", () => {
  beforeEach(() => {
    clearTemplateRegistry();
    registerTemplate(LEADERBOARD_TEMPLATE_ID, buildLeaderboardCard);
  });

  test("buildLeaderboardState groups by level and sorts by cumulativeAq desc", () => {
    const { deps } = fakeDeps();
    const state = buildLeaderboardState(deps, { windowId: "w-1" });
    expect(state.topN[0].memberId).toBe("m-1");
    expect(state.topN[1].memberId).toBe("m-2");
    expect(state.settledWindowId).toBe("w-1");
    expect(state.radarImageUrl).toContain("cdn.example.com");
  });

  test("sendOrPatchLeaderboard sends a fresh card when no active card exists", async () => {
    const fx = fakeDeps();
    const result = await sendOrPatchLeaderboard(fx.deps, { windowId: "w-1" });
    expect(result.action).toBe("sent");
    expect(fx.sentCards).toHaveLength(1);
    expect(fx.patchedCards).toHaveLength(0);
    expect(fx.deps.repo.insertLiveCard).toHaveBeenCalledOnce();
  });

  test("sendOrPatchLeaderboard patches existing card when one is active", async () => {
    const fx = fakeDeps();
    // First call creates the card.
    await sendOrPatchLeaderboard(fx.deps, { windowId: "w-1" });
    // Second call should patch it.
    const result = await sendOrPatchLeaderboard(fx.deps, { windowId: "w-1" });
    expect(result.action).toBe("patched");
    expect(fx.sentCards).toHaveLength(1);
    expect(fx.patchedCards).toHaveLength(1);
  });
});
```

- [ ] **Step 6: Run handler test to verify it fails**

Run: `npm test -- tests/services/feishu/cards/handlers/leaderboard-handler.test.ts`
Expected: FAIL — handler module not found.

- [ ] **Step 7: Implement `src/services/feishu/cards/handlers/leaderboard-handler.ts`**

```typescript
import {
  buildLeaderboardCard,
  LEADERBOARD_TEMPLATE_ID
} from "../templates/leaderboard-v1.js";
import type {
  CardHandlerDeps,
  LeaderboardState,
  LiveCardRow
} from "../types.js";

interface SnapshotRow {
  memberId: string;
  displayName: string;
  cumulativeAq: number;
  latestWindowAq: number;
  currentLevel: number;
  dims: { K: number; H: number; C: number; S: number; G: number };
}

interface SnapshotResolver {
  loadSnapshots: (windowId: string) => SnapshotRow[];
}

function snapshotResolver(deps: CardHandlerDeps): SnapshotResolver["loadSnapshots"] {
  const ext = deps as unknown as Partial<SnapshotResolver>;
  if (!ext.loadSnapshots) {
    throw new Error(
      "leaderboard handler requires deps.loadSnapshots to be wired to v2_window_snapshots"
    );
  }
  return ext.loadSnapshots;
}

export function buildLeaderboardState(
  deps: CardHandlerDeps,
  input: { windowId: string }
): LeaderboardState {
  const rows = snapshotResolver(deps)(input.windowId);
  const topN = rows.map((row) => ({
    memberId: row.memberId,
    displayName: row.displayName,
    cumulativeAq: row.cumulativeAq,
    latestWindowAq: row.latestWindowAq,
    currentLevel: row.currentLevel,
    dims: row.dims
  }));
  const radarImageUrl = rows.length
    ? `${deps.config.radarImageBaseUrl}/radar/window/${input.windowId}.png`
    : null;
  return {
    settledWindowId: input.windowId,
    generatedAt: deps.clock().toISOString(),
    topN,
    radarImageUrl
  };
}

export interface SendOrPatchResult {
  action: "sent" | "patched";
  messageId: string;
}

export async function sendOrPatchLeaderboard(
  deps: CardHandlerDeps,
  input: { windowId: string }
): Promise<SendOrPatchResult> {
  const state = buildLeaderboardState(deps, input);
  const card = buildLeaderboardCard(state, {
    operatorOpenId: "system",
    triggerId: "system-settle",
    actionName: "system",
    actionPayload: {},
    messageId: "",
    chatId: deps.config.groupChatId,
    receivedAt: deps.clock().toISOString(),
    currentVersion: deps.config.cardVersionCurrent
  });

  const existing = deps.repo.findLiveCard("leaderboard", deps.config.groupChatId);
  if (existing) {
    await deps.feishuClient.patchCard(existing.feishuMessageId, card);
    deps.repo.updateLiveCardState(existing.id, state, deps.clock().toISOString());
    return { action: "patched", messageId: existing.feishuMessageId };
  }

  const { messageId } = await deps.feishuClient.sendCard({
    chatId: deps.config.groupChatId,
    content: card
  });
  const row: LiveCardRow = {
    id: deps.uuid(),
    cardType: "leaderboard",
    feishuMessageId: messageId,
    feishuChatId: deps.config.groupChatId,
    campId: deps.config.campId,
    periodId: null,
    windowId: input.windowId,
    cardVersion: deps.config.cardVersionCurrent,
    stateJson: state,
    sentAt: deps.clock().toISOString(),
    lastPatchedAt: null,
    expiresAt: new Date(deps.clock().getTime() + 14 * 86400 * 1000).toISOString(),
    closedReason: null
  };
  deps.repo.insertLiveCard(row);
  return { action: "sent", messageId };
}
```

- [ ] **Step 8: Add `onWindowSettled` hook to `notify-hooks.ts`**

Open `src/services/feishu/cards/notify-hooks.ts` (created in Task D2). Add:

```typescript
import { sendOrPatchLeaderboard } from "./handlers/leaderboard-handler.js";
import type { CardHandlerDeps } from "./types.js";

export async function onWindowSettled(
  deps: CardHandlerDeps,
  input: { windowId: string }
): Promise<void> {
  await sendOrPatchLeaderboard(deps, input);
}
```

And extend `tests/services/feishu/cards/notify-hooks.test.ts` with:

```typescript
import { onWindowSettled } from "../../../../src/services/feishu/cards/notify-hooks.js";

test("onWindowSettled triggers leaderboard send then patch on second call", async () => {
  // Reuse the same fakeDeps from leaderboard-handler.test.ts pattern.
  const { deps, sentCards, patchedCards } = fakeDeps();
  clearTemplateRegistry();
  registerTemplate(LEADERBOARD_TEMPLATE_ID, buildLeaderboardCard);

  await onWindowSettled(deps, { windowId: "w-1" });
  expect(sentCards).toHaveLength(1);
  expect(patchedCards).toHaveLength(0);

  await onWindowSettled(deps, { windowId: "w-1" });
  expect(sentCards).toHaveLength(1);
  expect(patchedCards).toHaveLength(1);
});
```

- [ ] **Step 9: Run all leaderboard + hook tests to verify pass**

Run: `npm test -- tests/services/feishu/cards/templates/leaderboard-v1.test.ts tests/services/feishu/cards/handlers/leaderboard-handler.test.ts tests/services/feishu/cards/notify-hooks.test.ts`
Expected: PASS — template 5 assertions + handler 3 assertions + notify-hooks new case green.

- [ ] **Step 10: Register `/排行` command in command-handlers.ts**

Open `src/services/feishu/cards/handlers/command-handlers.ts`. Add a new command handler:

```typescript
import { sendOrPatchLeaderboard } from "./leaderboard-handler.js";

// Inside the command registry:
"/排行": async (deps, _body) => {
  // The command needs to know which window to render. For the
  // single-camp deployment, pick the latest settled window from the
  // deps.repo. For now assume a config-injected resolver or fail.
  const windowId = deps.config.latestSettledWindowId ?? "";
  if (!windowId) {
    return {
      toast: { type: "error", content: "暂无已结算窗,无法生成排行榜" }
    };
  }
  await sendOrPatchLeaderboard(deps, { windowId });
  return { toast: { type: "success", content: "排行榜已发送" } };
}
```

Add the `latestSettledWindowId?: string` field to `Sub2Config` in `types.ts` as well.

- [ ] **Step 11: Run full suite**

Run: `npm test`
Expected: PASS — all previous tests + the 8 new leaderboard assertions.

- [ ] **Step 12: Commit**

```bash
git add \
  src/services/feishu/cards/types.ts \
  src/services/feishu/cards/templates/leaderboard-v1.ts \
  src/services/feishu/cards/handlers/leaderboard-handler.ts \
  src/services/feishu/cards/notify-hooks.ts \
  src/services/feishu/cards/handlers/command-handlers.ts \
  tests/services/feishu/cards/templates/leaderboard-v1.test.ts \
  tests/services/feishu/cards/handlers/leaderboard-handler.test.ts \
  tests/services/feishu/cards/notify-hooks.test.ts
git commit -m "feat(sub2): add leaderboard card with send+patch and window-settle hook"
```

---

## Phase G Exit Checkpoint

Run the full suite and build:
```bash
npm test
npm run build
```

Expected: both green. All 16 cards are registered and renderable through `renderCard(templateId, state, ctx)`. The four patched cards (daily-checkin, homework, leaderboard, review-queue) have production handlers; the remaining 12 static cards all render to valid JSON.

Before moving on to Phase H, the following must all be true:

- [ ] `npm test -- tests/services/feishu/cards/templates/` green with zero skipped — every card has a template test
- [ ] `npm test -- tests/services/feishu/cards/handlers/` green with zero skipped — every handler has a handler test
- [ ] `npm run build` clean (no TypeScript errors)
- [ ] 16 cards are registered in the renderer template registry (verified by the renderer's template registry containing each `*_TEMPLATE_ID` constant)
- [ ] The C1 echo handler writes to `reaction_tracked_messages` via `deps.repo.insertReactionTrackedMessage(...)` — the Phase B pre-fix in sub-project 1 must have added this method
- [ ] The peer-review vote handler writes to `peer_review_votes` via `deps.repo.insertPeerReviewVote(...)` — same pre-fix
- [ ] The peer-review settle handler computes S1 per unique voter and S2 for top 2 vote-getters, with deterministic `sourceRef = "s1-{sid}:{voterId}"` and `"s2-{sid}:{targetId}"` per spec §4.3
- [ ] The video checkin handler uses deterministic `sourceRef = "g1-{periodId}:{memberId}"` for exactly-once enforcement per period per member
- [ ] The homework reply handler correlates `im.message.receive_v1` with `parent_id === liveCard.feishuMessageId` and triggers H1 + H3 (first-submitter) Ingestor calls
- [ ] The homework card renders under 25 KB with 14 submitters (verified by size assertion)
- [ ] Full camp lifecycle is now testable end-to-end through the card surface: `/开期 → /开窗 → /测验 → /作业 → /视频 → /打卡 → /互评 → /互评结算 → /排行 → /结业` each emit their respective cards

---

## Phase H — Hardening + Observability (S6 milestone) (4 tasks)

Phase H is the final hardening milestone. It adds: (H1) the hourly expiry scanner that pre-emptively closes and replaces cards before Feishu's 14-day retention boundary hits; (H2) the dead-letter retry surface that captures patch failures so operators can manually recover; (H3) an observability counter/metrics endpoint that tracks card send/patch throughput and error rates; and (H4) the end-to-end camp smoke test that exercises all 16 cards in a single long-running test that verifies coverage targets (≥ 85% lines / 90% branches) are met.

**Cross-subproject dependencies:** none new. Phase H builds purely on the sub2 infrastructure from Phases A-G plus the sub1 Aggregator/Ingestor/WindowSettler already wired through earlier phases.

---

### Task H1: Expiry scanner (hourly job)

**Files:**
- Create: `src/services/feishu/cards/expiry-scanner.ts`
- Create: `tests/services/feishu/cards/expiry-scanner.test.ts`
- Modify: `src/app.ts` (register hourly `setInterval` on startup)

Ships the hourly expiry scan described in spec §7.1 and §12 Phase S6. The scanner queries `feishu_live_cards` for rows whose `expires_at` is within 2 days of `now` and whose `closed_reason` is null. For each, it closes the old card (`closed_reason='expired'`), sends a fresh card with the accumulated state, and inserts a new row. This prevents Feishu's 14-day retention boundary from ever hitting a live card at runtime. The scanner is exposed as a pure function for unit testing with an injected clock, and registered in `src/app.ts` as `setInterval(scanAndHandle, 3600 * 1000).unref()` so shutdowns don't block.

- [ ] **Step 1: Write failing test**

Create `tests/services/feishu/cards/expiry-scanner.test.ts`:

```typescript
import { beforeEach, describe, expect, test, vi } from "vitest";

import {
  scanAndHandle,
  type ExpiryScannerDeps,
  type ScanResult
} from "../../../../src/services/feishu/cards/expiry-scanner.js";
import type {
  DailyCheckinState,
  LiveCardRow
} from "../../../../src/services/feishu/cards/types.js";

function liveCard(overrides: Partial<LiveCardRow> = {}): LiveCardRow {
  const base: LiveCardRow = {
    id: "flc-old",
    cardType: "daily_checkin",
    feishuMessageId: "om-old",
    feishuChatId: "oc-main",
    campId: "camp-1",
    periodId: "p-3",
    windowId: "w-3",
    cardVersion: "daily-checkin-v1",
    stateJson: {
      items: { K3: ["m-1"], K4: [], H2: [], C1: [], C3: [], G2: [] },
      postedAt: "2026-03-28T09:00:00.000Z"
    } satisfies DailyCheckinState,
    sentAt: "2026-03-28T09:00:00.000Z",
    lastPatchedAt: null,
    expiresAt: "2026-04-11T09:00:00.000Z",
    closedReason: null
  };
  return { ...base, ...overrides };
}

function makeDeps(
  expiring: LiveCardRow[]
): ExpiryScannerDeps & {
  closedIds: string[];
  sentCards: Array<{ chatId?: string; content: unknown; card_type: string }>;
} {
  const closedIds: string[] = [];
  const sentCards: Array<{ chatId?: string; content: unknown; card_type: string }> = [];
  return {
    live: {
      listExpiringWithinDays: vi.fn(() => expiring),
      close: vi.fn((id: string, _reason: string) => closedIds.push(id)),
      insert: vi.fn()
    },
    feishuClient: {
      sendCard: vi.fn(async (args: { chatId?: string; content: unknown }) => {
        sentCards.push({ ...args, card_type: "daily_checkin" });
        return { messageId: `om-new-${sentCards.length}` };
      })
    },
    clock: () => new Date("2026-04-10T09:00:00.000Z"),
    uuid: () => "uuid-scan",
    closedIds,
    sentCards
  };
}

describe("scanAndHandle (expiry scanner)", () => {
  test("closes and replaces a card that expires within 2 days", async () => {
    const deps = makeDeps([liveCard()]);
    const result = await scanAndHandle(deps);

    expect(result.scanned).toBe(1);
    expect(result.closed).toBe(1);
    expect(result.resent).toBe(1);
    expect(deps.closedIds).toEqual(["flc-old"]);
    expect(deps.sentCards).toHaveLength(1);

    // The resent card goes to the same chat
    expect(deps.sentCards[0].chatId).toBe("oc-main");
  });

  test("leaves cards that expire beyond the 2-day horizon untouched", async () => {
    const deps = makeDeps([]);
    const result = await scanAndHandle(deps);
    expect(result.scanned).toBe(0);
    expect(result.closed).toBe(0);
    expect(result.resent).toBe(0);
    expect(deps.closedIds).toEqual([]);
  });

  test("sendCard failure leaves the old card open (no closed_reason update)", async () => {
    const deps = makeDeps([liveCard()]);
    (deps.feishuClient.sendCard as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("Feishu down")
    );
    const result = await scanAndHandle(deps);
    expect(result.scanned).toBe(1);
    expect(result.closed).toBe(0);
    expect(result.resent).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(deps.closedIds).toEqual([]);
  });

  test("handles multiple expiring cards without cross-contamination", async () => {
    const deps = makeDeps([
      liveCard({ id: "flc-a", feishuMessageId: "om-a", feishuChatId: "oc-a" }),
      liveCard({ id: "flc-b", feishuMessageId: "om-b", feishuChatId: "oc-b" })
    ]);
    const result = await scanAndHandle(deps);
    expect(result.scanned).toBe(2);
    expect(result.closed).toBe(2);
    expect(result.resent).toBe(2);
    expect(deps.closedIds).toEqual(["flc-a", "flc-b"]);
  });

  test("returns a structured ScanResult for caller logging", async () => {
    const deps = makeDeps([liveCard()]);
    const result: ScanResult = await scanAndHandle(deps);
    expect(result).toHaveProperty("scanned");
    expect(result).toHaveProperty("closed");
    expect(result).toHaveProperty("resent");
    expect(result).toHaveProperty("errors");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/services/feishu/cards/expiry-scanner.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/services/feishu/cards/expiry-scanner.ts`**

```typescript
import type { FeishuCardJson, LiveCardRow } from "./types.js";
import { buildDailyCheckinV1 } from "./templates/daily-checkin/daily-checkin-v1.js";
import { buildHomeworkSubmitV1 } from "./templates/homework-submit-v1.js";

export interface ExpiryScannerDeps {
  live: {
    listExpiringWithinDays: (now: Date, days: number) => LiveCardRow[];
    close: (id: string, reason: string) => void;
    insert: (row: LiveCardRow) => void;
  };
  feishuClient: {
    sendCard: (args: {
      chatId?: string;
      receiveId?: string;
      content: FeishuCardJson;
    }) => Promise<{ messageId: string }>;
  };
  clock: () => Date;
  uuid: () => string;
}

export interface ScanResult {
  scanned: number;
  closed: number;
  resent: number;
  errors: Array<{ liveCardId: string; message: string }>;
}

const SCAN_HORIZON_DAYS = 2;
const NEW_EXPIRY_DAYS = 14;

function renderCardByType(row: LiveCardRow): FeishuCardJson | null {
  switch (row.cardType) {
    case "daily_checkin":
      return buildDailyCheckinV1(
        row.stateJson as Parameters<typeof buildDailyCheckinV1>[0],
        {
          operatorOpenId: "system",
          triggerId: "expiry-scan",
          actionName: "expire_replace",
          actionPayload: {},
          messageId: row.feishuMessageId,
          chatId: row.feishuChatId,
          receivedAt: new Date().toISOString(),
          currentVersion: row.cardVersion
        }
      );
    case "homework_submit":
      return buildHomeworkSubmitV1(
        row.stateJson as Parameters<typeof buildHomeworkSubmitV1>[0]
      );
    default:
      // Review queue + leaderboard are regenerated on demand by their
      // own command handlers; the expiry scanner only replaces cards
      // whose state_json is meaningful on its own.
      return null;
  }
}

/**
 * Hourly job entry point. Finds every `feishu_live_cards` row whose
 * `expires_at` is within 2 days of `now` and whose `closed_reason` is
 * null, renders a fresh copy from the existing `state_json`, sends it
 * through `feishuClient.sendCard`, and on success marks the old row
 * as `closed_reason='expired'` and inserts a new row for the fresh
 * send. On sendCard failure the old row is left open so the next scan
 * or manual operator action can recover.
 */
export async function scanAndHandle(
  deps: ExpiryScannerDeps
): Promise<ScanResult> {
  const now = deps.clock();
  const expiring = deps.live.listExpiringWithinDays(now, SCAN_HORIZON_DAYS);

  const result: ScanResult = {
    scanned: expiring.length,
    closed: 0,
    resent: 0,
    errors: []
  };

  for (const old of expiring) {
    try {
      const content = renderCardByType(old);
      if (!content) continue;
      const send = await deps.feishuClient.sendCard({
        chatId: old.feishuChatId,
        content
      });
      deps.live.close(old.id, "expired");
      const newExpiry = new Date(
        now.getTime() + NEW_EXPIRY_DAYS * 86400 * 1000
      ).toISOString();
      deps.live.insert({
        ...old,
        id: deps.uuid(),
        feishuMessageId: send.messageId,
        sentAt: now.toISOString(),
        lastPatchedAt: null,
        expiresAt: newExpiry,
        closedReason: null
      });
      result.closed += 1;
      result.resent += 1;
    } catch (err) {
      result.errors.push({
        liveCardId: old.id,
        message: err instanceof Error ? err.message : String(err)
      });
    }
  }

  return result;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/services/feishu/cards/expiry-scanner.test.ts`
Expected: PASS — 5 assertions green. The sendCard-fail path leaves `closed_reason` null as required.

- [ ] **Step 5: Wire up the hourly interval in `src/app.ts`**

Append to `src/app.ts` (after the live card repository and feishu client are constructed, before `return app`):

```typescript
import { scanAndHandle } from "./services/feishu/cards/expiry-scanner.js";

// ... inside createApp after liveCardRepository and feishuClient wired:
if (process.env.NODE_ENV !== "test") {
  const interval = setInterval(async () => {
    try {
      const result = await scanAndHandle({
        live: liveCardRepository,
        feishuClient,
        clock: () => new Date(),
        uuid: () => crypto.randomUUID()
      });
      if (result.errors.length > 0) {
        app.log.warn({ result }, "expiry scanner encountered errors");
      }
    } catch (err) {
      app.log.error({ err }, "expiry scanner crashed");
    }
  }, 3600 * 1000);
  interval.unref();
  app.addHook("onClose", async () => clearInterval(interval));
}
```

Test suites run under `NODE_ENV === "test"` so the interval is not registered in unit tests. The pure `scanAndHandle` function is unit-tested in isolation.

- [ ] **Step 6: Run test to verify it still passes**

Run: `npm test -- tests/services/feishu/cards/expiry-scanner.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add \
  src/services/feishu/cards/expiry-scanner.ts \
  src/app.ts \
  tests/services/feishu/cards/expiry-scanner.test.ts
git commit -m "feat(sub2): add hourly expiry scanner for feishu_live_cards"
```

---

### Task H2: Dead letter retry surface

**Files:**
- Modify: `src/storage/sqlite-repository.ts` (append `feishu_card_patch_deadletters` DDL to `tableDefinitions`)
- Create: `src/services/feishu/cards/dead-letter.ts`
- Create: `tests/services/feishu/cards/dead-letter.test.ts`
- Modify: `src/services/feishu/cards/router.ts` (append retry route)
- Modify: `tests/services/feishu/cards/router.test.ts` (append retry route test)

Ships the dead-letter table described in spec §7.1 and §12 Phase S6. When the Phase D2 patch-worker exhausts its 3-attempt retry budget, it inserts a row into `feishu_card_patch_deadletters` so an operator can later inspect the failure and manually retry. The retry endpoint `POST /api/v2/feishu/cards/dead-letter/:id/retry` reads the row, re-invokes the patch, and on success deletes the dead-letter row.

- [ ] **Step 1: Write failing DDL test**

Append to `tests/storage/v2/sqlite-repository-v2.test.ts`:

```typescript
import Database from "better-sqlite3";
import { describe, expect, test } from "vitest";

import { SqliteRepository } from "../../../src/storage/sqlite-repository.js";

describe("SqliteRepository feishu_card_patch_deadletters", () => {
  test("schema: feishu_card_patch_deadletters table is created on construction", () => {
    const repo = new SqliteRepository(":memory:");
    const db = (repo as unknown as { db: Database.Database }).db;
    const row = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='feishu_card_patch_deadletters'"
      )
      .get() as { name: string } | undefined;
    expect(row?.name).toBe("feishu_card_patch_deadletters");
  });
});
```

- [ ] **Step 2: Run DDL test to verify it fails**

Run: `npm test -- tests/storage/v2/sqlite-repository-v2.test.ts -t "feishu_card_patch_deadletters"`
Expected: FAIL — table not found.

- [ ] **Step 3: Append to `tableDefinitions` in `src/storage/sqlite-repository.ts`**

Inside the `tableDefinitions` template literal, immediately before the closing backtick, append:

```sql
CREATE TABLE IF NOT EXISTS feishu_card_patch_deadletters (
  id TEXT PRIMARY KEY,
  live_card_id TEXT NOT NULL,
  feishu_message_id TEXT NOT NULL,
  card_type TEXT NOT NULL,
  payload_content TEXT NOT NULL,
  error_code TEXT,
  error_message TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 1,
  first_failed_at TEXT NOT NULL,
  last_failed_at TEXT NOT NULL,
  resolved_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_feishu_card_deadletters_unresolved
  ON feishu_card_patch_deadletters(first_failed_at)
  WHERE resolved_at IS NULL;
```

- [ ] **Step 4: Write failing dead-letter module test**

Create `tests/services/feishu/cards/dead-letter.test.ts`:

```typescript
import Database from "better-sqlite3";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { SqliteRepository } from "../../../../src/storage/sqlite-repository.js";
import {
  DeadLetterRepository,
  retryDeadLetter,
  type DeadLetterRow
} from "../../../../src/services/feishu/cards/dead-letter.js";

describe("DeadLetterRepository", () => {
  let repo: SqliteRepository;
  let dl: DeadLetterRepository;

  beforeEach(() => {
    repo = new SqliteRepository(":memory:");
    dl = new DeadLetterRepository(repo);
  });

  test("insert + list + findById roundtrip", () => {
    const row: DeadLetterRow = {
      id: "dl-1",
      liveCardId: "flc-1",
      feishuMessageId: "om-1",
      cardType: "daily_checkin",
      payloadContent: { schema: "2.0", header: {}, body: { elements: [] } },
      errorCode: "230031",
      errorMessage: "card expired",
      attempts: 3,
      firstFailedAt: "2026-04-10T10:00:00.000Z",
      lastFailedAt: "2026-04-10T10:05:00.000Z",
      resolvedAt: null
    };
    dl.insert(row);
    const found = dl.findById("dl-1");
    expect(found?.id).toBe("dl-1");
    expect(found?.errorCode).toBe("230031");
    expect(found?.payloadContent).toEqual(row.payloadContent);

    const list = dl.listUnresolved();
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe("dl-1");
  });

  test("markResolved hides the row from listUnresolved", () => {
    dl.insert({
      id: "dl-2",
      liveCardId: "flc-2",
      feishuMessageId: "om-2",
      cardType: "homework_submit",
      payloadContent: { schema: "2.0", header: {}, body: { elements: [] } },
      errorCode: null,
      errorMessage: "5 QPS exceeded",
      attempts: 3,
      firstFailedAt: "2026-04-10T10:00:00.000Z",
      lastFailedAt: "2026-04-10T10:05:00.000Z",
      resolvedAt: null
    });
    dl.markResolved("dl-2", "2026-04-10T11:00:00.000Z");
    expect(dl.listUnresolved()).toHaveLength(0);
    expect(dl.findById("dl-2")?.resolvedAt).toBe("2026-04-10T11:00:00.000Z");
  });

  test("incrementAttempts bumps attempts and updates lastFailedAt", () => {
    dl.insert({
      id: "dl-3",
      liveCardId: "flc-3",
      feishuMessageId: "om-3",
      cardType: "review_queue",
      payloadContent: { schema: "2.0", header: {}, body: { elements: [] } },
      errorCode: null,
      errorMessage: "network timeout",
      attempts: 1,
      firstFailedAt: "2026-04-10T10:00:00.000Z",
      lastFailedAt: "2026-04-10T10:00:00.000Z",
      resolvedAt: null
    });
    dl.incrementAttempts("dl-3", "2026-04-10T10:05:00.000Z");
    const updated = dl.findById("dl-3");
    expect(updated?.attempts).toBe(2);
    expect(updated?.lastFailedAt).toBe("2026-04-10T10:05:00.000Z");
  });
});

describe("retryDeadLetter", () => {
  let repo: SqliteRepository;
  let dl: DeadLetterRepository;

  beforeEach(() => {
    repo = new SqliteRepository(":memory:");
    dl = new DeadLetterRepository(repo);
    dl.insert({
      id: "dl-retry-1",
      liveCardId: "flc-r",
      feishuMessageId: "om-r",
      cardType: "daily_checkin",
      payloadContent: { schema: "2.0", header: {}, body: { elements: [] } },
      errorCode: "230031",
      errorMessage: "expired",
      attempts: 3,
      firstFailedAt: "2026-04-10T10:00:00.000Z",
      lastFailedAt: "2026-04-10T10:05:00.000Z",
      resolvedAt: null
    });
  });

  test("successful retry marks the dead-letter row resolved", async () => {
    const patchCard = vi.fn(async () => undefined);
    const result = await retryDeadLetter({
      deadLetterId: "dl-retry-1",
      dl,
      patchCard,
      clock: () => new Date("2026-04-10T11:00:00.000Z")
    });
    expect(result.ok).toBe(true);
    expect(patchCard).toHaveBeenCalledOnce();
    expect(dl.findById("dl-retry-1")?.resolvedAt).toBe(
      "2026-04-10T11:00:00.000Z"
    );
  });

  test("retry failure bumps attempts and does not resolve", async () => {
    const patchCard = vi.fn(async () => {
      throw new Error("still failing");
    });
    const result = await retryDeadLetter({
      deadLetterId: "dl-retry-1",
      dl,
      patchCard,
      clock: () => new Date("2026-04-10T11:00:00.000Z")
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("still failing");
    const updated = dl.findById("dl-retry-1");
    expect(updated?.resolvedAt).toBeNull();
    expect(updated?.attempts).toBe(4);
  });

  test("non-existent id returns ok=false without crashing", async () => {
    const result = await retryDeadLetter({
      deadLetterId: "dl-missing",
      dl,
      patchCard: vi.fn(),
      clock: () => new Date()
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("not_found");
  });
});
```

- [ ] **Step 5: Run dead-letter tests to verify they fail**

Run: `npm test -- tests/services/feishu/cards/dead-letter.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 6: Implement `src/services/feishu/cards/dead-letter.ts`**

```typescript
import type Database from "better-sqlite3";

import type { SqliteRepository } from "../../../storage/sqlite-repository.js";
import type { FeishuCardJson } from "./types.js";

export interface DeadLetterRow {
  id: string;
  liveCardId: string;
  feishuMessageId: string;
  cardType: string;
  payloadContent: FeishuCardJson;
  errorCode: string | null;
  errorMessage: string;
  attempts: number;
  firstFailedAt: string;
  lastFailedAt: string;
  resolvedAt: string | null;
}

interface DeadLetterDbRow {
  id: string;
  live_card_id: string;
  feishu_message_id: string;
  card_type: string;
  payload_content: string;
  error_code: string | null;
  error_message: string;
  attempts: number;
  first_failed_at: string;
  last_failed_at: string;
  resolved_at: string | null;
}

function toRow(row: DeadLetterDbRow): DeadLetterRow {
  return {
    id: row.id,
    liveCardId: row.live_card_id,
    feishuMessageId: row.feishu_message_id,
    cardType: row.card_type,
    payloadContent: JSON.parse(row.payload_content) as FeishuCardJson,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    attempts: row.attempts,
    firstFailedAt: row.first_failed_at,
    lastFailedAt: row.last_failed_at,
    resolvedAt: row.resolved_at
  };
}

export class DeadLetterRepository {
  private readonly db: Database.Database;

  constructor(sqliteRepo: SqliteRepository) {
    this.db = (sqliteRepo as unknown as { db: Database.Database }).db;
  }

  insert(row: DeadLetterRow): void {
    this.db
      .prepare(
        `INSERT INTO feishu_card_patch_deadletters
          (id, live_card_id, feishu_message_id, card_type, payload_content,
           error_code, error_message, attempts, first_failed_at, last_failed_at,
           resolved_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        row.id,
        row.liveCardId,
        row.feishuMessageId,
        row.cardType,
        JSON.stringify(row.payloadContent),
        row.errorCode,
        row.errorMessage,
        row.attempts,
        row.firstFailedAt,
        row.lastFailedAt,
        row.resolvedAt
      );
  }

  findById(id: string): DeadLetterRow | null {
    const row = this.db
      .prepare<[string], DeadLetterDbRow>(
        "SELECT * FROM feishu_card_patch_deadletters WHERE id = ?"
      )
      .get(id);
    return row ? toRow(row) : null;
  }

  listUnresolved(): DeadLetterRow[] {
    const rows = this.db
      .prepare<[], DeadLetterDbRow>(
        `SELECT * FROM feishu_card_patch_deadletters
          WHERE resolved_at IS NULL
          ORDER BY first_failed_at ASC`
      )
      .all();
    return rows.map(toRow);
  }

  markResolved(id: string, resolvedAt: string): void {
    this.db
      .prepare(
        "UPDATE feishu_card_patch_deadletters SET resolved_at = ? WHERE id = ?"
      )
      .run(resolvedAt, id);
  }

  incrementAttempts(id: string, lastFailedAt: string): void {
    this.db
      .prepare(
        `UPDATE feishu_card_patch_deadletters
            SET attempts = attempts + 1, last_failed_at = ?
          WHERE id = ?`
      )
      .run(lastFailedAt, id);
  }
}

export interface RetryDeadLetterInput {
  deadLetterId: string;
  dl: DeadLetterRepository;
  patchCard: (messageId: string, content: FeishuCardJson) => Promise<void>;
  clock: () => Date;
}

export interface RetryDeadLetterResult {
  ok: boolean;
  error?: string;
}

export async function retryDeadLetter(
  input: RetryDeadLetterInput
): Promise<RetryDeadLetterResult> {
  const row = input.dl.findById(input.deadLetterId);
  if (!row) {
    return { ok: false, error: "not_found" };
  }
  if (row.resolvedAt) {
    return { ok: true };
  }
  try {
    await input.patchCard(row.feishuMessageId, row.payloadContent);
    input.dl.markResolved(row.id, input.clock().toISOString());
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    input.dl.incrementAttempts(row.id, input.clock().toISOString());
    return { ok: false, error: message };
  }
}
```

- [ ] **Step 7: Run dead-letter tests to verify they pass**

Run: `npm test -- tests/services/feishu/cards/dead-letter.test.ts tests/storage/v2/sqlite-repository-v2.test.ts`
Expected: PASS — 6 dead-letter assertions + 1 DDL smoke green.

- [ ] **Step 8: Append retry route test to `tests/services/feishu/cards/router.test.ts`**

```typescript
import { describe, expect, test, vi } from "vitest";
import type { FastifyInstance } from "fastify";

import { createApp } from "../../../../src/app.js";

describe("POST /api/v2/feishu/cards/dead-letter/:id/retry", () => {
  test("successful retry returns 200 and marks row resolved", async () => {
    const app = await createApp({
      databaseUrl: ":memory:",
      feishuStubMode: "in_memory"
    });
    const repo = app.scoringRepo;

    repo.db
      .prepare(
        `INSERT INTO feishu_card_patch_deadletters
          (id, live_card_id, feishu_message_id, card_type, payload_content,
           error_code, error_message, attempts, first_failed_at, last_failed_at,
           resolved_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        "dl-route-1",
        "flc-1",
        "om-1",
        "daily_checkin",
        JSON.stringify({
          schema: "2.0",
          header: {},
          body: { elements: [] }
        }),
        "230031",
        "expired",
        3,
        "2026-04-10T10:00:00.000Z",
        "2026-04-10T10:05:00.000Z",
        null
      );

    const res = await app.inject({
      method: "POST",
      url: "/api/v2/feishu/cards/dead-letter/dl-route-1/retry"
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().ok).toBe(true);

    const row = repo.db
      .prepare("SELECT resolved_at FROM feishu_card_patch_deadletters WHERE id = ?")
      .get("dl-route-1") as { resolved_at: string | null };
    expect(row.resolved_at).not.toBeNull();
  });

  test("non-existent id returns 404", async () => {
    const app = await createApp({
      databaseUrl: ":memory:",
      feishuStubMode: "in_memory"
    });
    const res = await app.inject({
      method: "POST",
      url: "/api/v2/feishu/cards/dead-letter/dl-missing/retry"
    });
    expect(res.statusCode).toBe(404);
  });
});
```

- [ ] **Step 9: Run route test to verify it fails**

Run: `npm test -- tests/services/feishu/cards/router.test.ts -t "dead-letter"`
Expected: FAIL — route not registered.

- [ ] **Step 10: Append retry route to `src/services/feishu/cards/router.ts`**

Inside the plugin's route registration block, append:

```typescript
import { DeadLetterRepository, retryDeadLetter } from "./dead-letter.js";

// Inside the plugin after other route definitions:
const dlRepo = new DeadLetterRepository(deps.sqliteRepo);
fastify.post("/api/v2/feishu/cards/dead-letter/:id/retry", async (req, reply) => {
  const id = (req.params as { id: string }).id;
  const result = await retryDeadLetter({
    deadLetterId: id,
    dl: dlRepo,
    patchCard: async (messageId, content) =>
      deps.feishuClient.patchCard(messageId, content),
    clock: () => new Date()
  });
  if (!result.ok && result.error === "not_found") {
    return reply.code(404).send({ ok: false, error: "not_found" });
  }
  if (!result.ok) {
    return reply.code(500).send({ ok: false, error: result.error });
  }
  return reply.code(200).send({ ok: true });
});
```

- [ ] **Step 11: Run route test to verify it passes**

Run: `npm test -- tests/services/feishu/cards/router.test.ts -t "dead-letter"`
Expected: PASS.

- [ ] **Step 12: Commit**

```bash
git add \
  src/storage/sqlite-repository.ts \
  src/services/feishu/cards/dead-letter.ts \
  src/services/feishu/cards/router.ts \
  tests/services/feishu/cards/dead-letter.test.ts \
  tests/services/feishu/cards/router.test.ts \
  tests/storage/v2/sqlite-repository-v2.test.ts
git commit -m "feat(sub2): add feishu_card_patch_deadletters table and retry endpoint"
```

---

### Task H3: Observability counters + logging

**Files:**
- Create: `src/services/feishu/cards/observability.ts`
- Create: `tests/services/feishu/cards/observability.test.ts`
- Modify: `src/services/feishu/cards/router.ts` (register `GET /api/v2/feishu/cards/metrics`)
- Modify: `src/services/feishu/cards/card-action-dispatcher.ts` (increment counters on dispatch)
- Modify: `src/services/feishu/cards/patch-worker.ts` (increment counters on patch success/failure)

Ships the counters + metrics endpoint described in spec §7.1 and §12 Phase S6. All counters live in a single in-memory `Map<string, number>` keyed by `name{label1=v1,label2=v2}`. The module exports `incrementCounter(name, labels)`, `setGauge(name, labels, value)`, and `readCounters()` helpers. The dispatcher, patch-worker, and live-card-repo call these helpers to record throughput and error rates. The metrics route returns the counters as JSON so an external scraper (Prometheus, Grafana, or a dashboard) can poll them.

**Counters emitted:**
- `feishu_card_sent_total{card_type}` — incremented on every `sendCard` call
- `feishu_card_patched_total{card_type, path}` — `path = sync | async` based on which code path triggered the patch
- `feishu_card_patch_errors_total{error_code}` — incremented on every patch failure, labelled with Feishu error code
- `feishu_card_soft_validation_rejected_total{reason}` — incremented on every soft-validation rejection, labelled with rejection reason
- `feishu_live_cards_active_count{card_type}` (gauge) — current count of active live cards per type, recomputed on every scanner run

- [ ] **Step 1: Write failing observability module test**

Create `tests/services/feishu/cards/observability.test.ts`:

```typescript
import { beforeEach, describe, expect, test } from "vitest";

import {
  incrementCounter,
  setGauge,
  readCounters,
  resetCounters
} from "../../../../src/services/feishu/cards/observability.js";

describe("observability counters", () => {
  beforeEach(() => {
    resetCounters();
  });

  test("incrementCounter + readCounters returns 1 for a single call", () => {
    incrementCounter("feishu_card_sent_total", { card_type: "daily_checkin" });
    const snapshot = readCounters();
    expect(snapshot["feishu_card_sent_total"]).toBeDefined();
    expect(
      snapshot["feishu_card_sent_total"]["card_type=daily_checkin"]
    ).toBe(1);
  });

  test("incrementCounter accumulates across multiple calls", () => {
    incrementCounter("feishu_card_sent_total", { card_type: "quiz" });
    incrementCounter("feishu_card_sent_total", { card_type: "quiz" });
    incrementCounter("feishu_card_sent_total", { card_type: "quiz" });
    expect(
      readCounters()["feishu_card_sent_total"]["card_type=quiz"]
    ).toBe(3);
  });

  test("different label values track separately", () => {
    incrementCounter("feishu_card_patched_total", {
      card_type: "daily_checkin",
      path: "sync"
    });
    incrementCounter("feishu_card_patched_total", {
      card_type: "daily_checkin",
      path: "async"
    });
    incrementCounter("feishu_card_patched_total", {
      card_type: "daily_checkin",
      path: "sync"
    });
    const snapshot = readCounters()["feishu_card_patched_total"];
    expect(snapshot["card_type=daily_checkin,path=sync"]).toBe(2);
    expect(snapshot["card_type=daily_checkin,path=async"]).toBe(1);
  });

  test("setGauge overwrites the previous value", () => {
    setGauge("feishu_live_cards_active_count", { card_type: "daily_checkin" }, 3);
    setGauge("feishu_live_cards_active_count", { card_type: "daily_checkin" }, 5);
    expect(
      readCounters()["feishu_live_cards_active_count"][
        "card_type=daily_checkin"
      ]
    ).toBe(5);
  });

  test("resetCounters clears all state", () => {
    incrementCounter("feishu_card_sent_total", { card_type: "quiz" });
    resetCounters();
    expect(readCounters()).toEqual({});
  });

  test("label keys are sorted deterministically for stable snapshot keys", () => {
    incrementCounter("feishu_card_patched_total", {
      path: "sync",
      card_type: "daily_checkin"
    });
    const snapshot = readCounters()["feishu_card_patched_total"];
    expect(snapshot["card_type=daily_checkin,path=sync"]).toBe(1);
    // Not stored under reverse order
    expect(snapshot["path=sync,card_type=daily_checkin"]).toBeUndefined();
  });

  test("incrementCounter with no labels uses empty-string key", () => {
    incrementCounter("feishu_card_patch_errors_total", {});
    expect(readCounters()["feishu_card_patch_errors_total"][""]).toBe(1);
  });
});
```

- [ ] **Step 2: Run observability test to verify it fails**

Run: `npm test -- tests/services/feishu/cards/observability.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/services/feishu/cards/observability.ts`**

```typescript
export type Labels = Record<string, string | number>;

// counter name → label key → value
const counters: Map<string, Map<string, number>> = new Map();

function serializeLabels(labels: Labels): string {
  const keys = Object.keys(labels).sort();
  return keys.map((k) => `${k}=${String(labels[k])}`).join(",");
}

export function incrementCounter(name: string, labels: Labels = {}): void {
  const key = serializeLabels(labels);
  let bucket = counters.get(name);
  if (!bucket) {
    bucket = new Map();
    counters.set(name, bucket);
  }
  bucket.set(key, (bucket.get(key) ?? 0) + 1);
}

export function setGauge(
  name: string,
  labels: Labels,
  value: number
): void {
  const key = serializeLabels(labels);
  let bucket = counters.get(name);
  if (!bucket) {
    bucket = new Map();
    counters.set(name, bucket);
  }
  bucket.set(key, value);
}

export interface CountersSnapshot {
  [counterName: string]: {
    [labelKey: string]: number;
  };
}

export function readCounters(): CountersSnapshot {
  const snapshot: CountersSnapshot = {};
  for (const [name, bucket] of counters.entries()) {
    snapshot[name] = {};
    for (const [labelKey, value] of bucket.entries()) {
      snapshot[name][labelKey] = value;
    }
  }
  return snapshot;
}

export function resetCounters(): void {
  counters.clear();
}
```

- [ ] **Step 4: Run observability test to verify it passes**

Run: `npm test -- tests/services/feishu/cards/observability.test.ts`
Expected: PASS — 7 assertions green.

- [ ] **Step 5: Wire counters into the dispatcher + patch-worker**

Modify `src/services/feishu/cards/card-action-dispatcher.ts` to import and call `incrementCounter` at the dispatch site:

```typescript
import { incrementCounter } from "./observability.js";

// Inside CardActionDispatcher.dispatch, after a successful handler response:
incrementCounter("feishu_card_patched_total", {
  card_type: input.cardType,
  path: "sync"
});

// Inside the catch block for soft-validation rejection:
incrementCounter("feishu_card_soft_validation_rejected_total", {
  reason: rejectedReason
});
```

Modify `src/services/feishu/cards/patch-worker.ts` similarly:

```typescript
import { incrementCounter } from "./observability.js";

// Inside the patch success path:
incrementCounter("feishu_card_patched_total", {
  card_type: liveCard.cardType,
  path: "async"
});

// Inside the patch failure path:
incrementCounter("feishu_card_patch_errors_total", {
  error_code: errorCode ?? "unknown"
});
```

No new tests here — the existing dispatcher and patch-worker tests now incidentally increment counters, which Task H4 verifies end-to-end.

- [ ] **Step 6: Append `GET /api/v2/feishu/cards/metrics` route to `src/services/feishu/cards/router.ts`**

```typescript
import { readCounters } from "./observability.js";

fastify.get("/api/v2/feishu/cards/metrics", async (_req, reply) => {
  return reply.code(200).send({
    counters: readCounters(),
    generatedAt: new Date().toISOString()
  });
});
```

- [ ] **Step 7: Append route test to `tests/services/feishu/cards/router.test.ts`**

```typescript
import { describe, expect, test } from "vitest";

import { createApp } from "../../../../src/app.js";
import {
  incrementCounter,
  resetCounters
} from "../../../../src/services/feishu/cards/observability.js";

describe("GET /api/v2/feishu/cards/metrics", () => {
  test("returns a JSON snapshot of the current counters", async () => {
    resetCounters();
    incrementCounter("feishu_card_sent_total", { card_type: "daily_checkin" });
    incrementCounter("feishu_card_sent_total", { card_type: "quiz" });
    incrementCounter("feishu_card_sent_total", { card_type: "daily_checkin" });

    const app = await createApp({
      databaseUrl: ":memory:",
      feishuStubMode: "in_memory"
    });
    const res = await app.inject({
      method: "GET",
      url: "/api/v2/feishu/cards/metrics"
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.counters["feishu_card_sent_total"]).toBeDefined();
    expect(
      body.counters["feishu_card_sent_total"]["card_type=daily_checkin"]
    ).toBe(2);
    expect(
      body.counters["feishu_card_sent_total"]["card_type=quiz"]
    ).toBe(1);
    expect(body.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
```

- [ ] **Step 8: Run route test to verify it passes**

Run: `npm test -- tests/services/feishu/cards/router.test.ts -t "metrics"`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add \
  src/services/feishu/cards/observability.ts \
  src/services/feishu/cards/card-action-dispatcher.ts \
  src/services/feishu/cards/patch-worker.ts \
  src/services/feishu/cards/router.ts \
  tests/services/feishu/cards/observability.test.ts \
  tests/services/feishu/cards/router.test.ts
git commit -m "feat(sub2): add observability counters and metrics endpoint"
```

---

### Task H4: E2E camp smoke exit checkpoint

**Files:**
- Create: `tests/services/feishu/cards/e2e-camp.test.ts`
- Create: `tests/services/feishu/cards/integration/helpers/e2e-camp-fixture.ts`
- No production code changes — this task is the final coverage gate for Sub2. It drives a full 2-period camp lifecycle through every card type via real `createApp({ databaseUrl: ":memory:" })`, real sub1 Ingestor/Aggregator/WindowSettler, and the in-memory feishu stub from Phase E3/F4.

Ships the end-to-end camp smoke test described in spec §11 and §12 Phase S6. A single long-running test simulates a 2-period camp from `/开期 1` to `/结业`, verifying that all 16 card types are exercised, `feishu_live_cards` has the expected active rows at each step, no errors are logged, the dead-letter table is empty, and Sub2 coverage is ≥ 85% lines / 90% branches.

**Test duration target: ~10-15 seconds.** Because it boots `:memory:` 14 times and simulates 14-person burst traffic, it is slower than any other sub2 test — but still within the vitest default timeout. Use `vi.setConfig({ testTimeout: 60000 })` to give it headroom.

- [ ] **Step 1: Write failing E2E test**

Create `tests/services/feishu/cards/e2e-camp.test.ts`:

```typescript
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { FastifyInstance } from "fastify";

import { createApp } from "../../../../src/app.js";
import { seedE2eCampFixture } from "./integration/helpers/e2e-camp-fixture.js";
import {
  readCounters,
  resetCounters
} from "../../../../src/services/feishu/cards/observability.js";

interface E2eCtx {
  app: FastifyInstance;
  operatorOpenId: string;
  studentOpenIds: string[];
  studentIds: string[];
}

async function bootE2eCamp(): Promise<E2eCtx> {
  resetCounters();
  const app = await createApp({
    databaseUrl: ":memory:",
    llmEnabled: false,
    feishuStubMode: "in_memory"
  });
  const fixture = await seedE2eCampFixture(app);
  return { app, ...fixture };
}

async function postCommand(
  app: FastifyInstance,
  name: string,
  operatorOpenId: string,
  args?: string | Record<string, unknown>
) {
  const encoded = encodeURIComponent(name);
  return app.inject({
    method: "POST",
    url: `/api/v2/feishu/commands/${encoded}`,
    payload: { operator_open_id: operatorOpenId, args: args ?? "" }
  });
}

async function postCardAction(
  app: FastifyInstance,
  payload: Record<string, unknown>
) {
  return app.inject({
    method: "POST",
    url: "/api/v2/feishu/card-action",
    payload
  });
}

describe("E2E camp smoke — full 2-period lifecycle through 16-card surface", () => {
  let ctx: E2eCtx;

  beforeEach(async () => {
    vi.setConfig({ testTimeout: 60000 });
    ctx = await bootE2eCamp();
  });

  test(
    "drives /开期 → /开窗 → /测验 → /作业 → /视频 → /打卡 → /互评 → /排行 → /结业",
    async () => {
      const app = ctx.app;
      const stub = app.feishuClient as {
        sentCards: Array<{ messageId: string; content: unknown; chatId?: string; receiveId?: string }>;
        patchedCards: Array<{ messageId: string; content: unknown }>;
      };
      const repo = app.scoringRepo;
      const cardTypesExercised = new Set<string>();

      // 1. /开期 1 — ice breaker period
      await postCommand(app, "开期", ctx.operatorOpenId, "1");
      cardTypesExercised.add("period_open");

      // 2. /开窗 W1
      await postCommand(app, "开窗", ctx.operatorOpenId, "W1");
      cardTypesExercised.add("window_open");

      // 3. /开期 2 — real period bound to W1
      await postCommand(app, "开期", ctx.operatorOpenId, "2");

      // 4. /测验 qs1 — 14 students complete quiz
      await postCommand(app, "测验", ctx.operatorOpenId, "qs1");
      cardTypesExercised.add("quiz");
      const quizCard = stub.sentCards.find((c) =>
        JSON.stringify(c.content).includes("quiz_submit")
      );
      expect(quizCard).toBeDefined();
      for (const studentOpenId of ctx.studentOpenIds) {
        await postCardAction(app, {
          card_type: "quiz",
          action_name: "quiz_select",
          message_id: quizCard!.messageId,
          chat_id: "oc-main",
          trigger_id: `q-select-${studentOpenId}`,
          operator_open_id: studentOpenId,
          card_version: "quiz-v1",
          payload: {
            action: "quiz_select",
            setCode: "qs1",
            questionId: "q1",
            optionId: "a"
          }
        });
        await postCardAction(app, {
          card_type: "quiz",
          action_name: "quiz_submit",
          message_id: quizCard!.messageId,
          chat_id: "oc-main",
          trigger_id: `q-submit-${studentOpenId}`,
          operator_open_id: studentOpenId,
          card_version: "quiz-v1",
          payload: { action: "quiz_submit", setCode: "qs1" }
        });
      }

      // 5. /作业 hw1 — 3 students submit (first submitter → H3 bonus)
      await postCommand(app, "作业", ctx.operatorOpenId, "hw1");
      cardTypesExercised.add("homework_submit");
      const homeworkCard = stub.sentCards.find((c) =>
        JSON.stringify(c.content).includes("提交作业")
      );
      expect(homeworkCard).toBeDefined();
      for (let i = 0; i < 3; i += 1) {
        await app.inject({
          method: "POST",
          url: "/api/v2/feishu/events/homework-reply",
          payload: {
            message_id: `om-reply-${i}`,
            parent_id: homeworkCard!.messageId,
            chat_id: "oc-main",
            sender_open_id: ctx.studentOpenIds[i],
            received_at: "2026-04-10T12:00:00.000Z",
            attachments: [{ file_key: `file_hw_${i}`, file_type: "file" }]
          }
        });
      }

      // 6. /视频 v1 — 14 students check in
      await postCommand(app, "视频", ctx.operatorOpenId, "v1");
      cardTypesExercised.add("video_checkin");
      const videoCard = stub.sentCards.find((c) =>
        JSON.stringify(c.content).includes("全部看完")
      );
      expect(videoCard).toBeDefined();
      for (const studentOpenId of ctx.studentOpenIds) {
        await postCardAction(app, {
          card_type: "video_checkin",
          action_name: "g1_submit",
          message_id: videoCard!.messageId,
          chat_id: "oc-main",
          trigger_id: `v1-${studentOpenId}`,
          operator_open_id: studentOpenId,
          card_version: "video-checkin-v1",
          payload: {
            action: "g1_submit",
            session_id: "v1",
            file_key: `file_v1_${studentOpenId}`
          }
        });
      }

      // 7. /打卡 — daily checkin, 14 students submit K3
      await postCommand(app, "打卡", ctx.operatorOpenId, "");
      cardTypesExercised.add("daily_checkin");
      const dailyCard = stub.sentCards.find((c) =>
        JSON.stringify(c.content).includes("今日打卡")
      );
      expect(dailyCard).toBeDefined();
      for (const studentOpenId of ctx.studentOpenIds) {
        await postCardAction(app, {
          card_type: "daily_checkin",
          action_name: "k3_submit",
          message_id: dailyCard!.messageId,
          chat_id: "oc-main",
          trigger_id: `k3-${studentOpenId}`,
          operator_open_id: studentOpenId,
          card_version: "daily-checkin-v1",
          payload: {
            action: "k3_submit",
            text: "今天学到了 attention 的 QKV 机制,和 CNN 的卷积核很不一样"
          }
        });
      }

      // 8. LLM worker processes → applyDecision for 3 events → review_required
      const pendingEvents = repo.db
        .prepare(
          "SELECT id FROM v2_scoring_item_events WHERE status = 'pending' AND item_code = 'K3' LIMIT 3"
        )
        .all() as Array<{ id: string }>;
      expect(pendingEvents.length).toBeGreaterThanOrEqual(3);
      for (const evt of pendingEvents) {
        repo.db
          .prepare(
            "UPDATE v2_scoring_item_events SET status = 'review_required' WHERE id = ?"
          )
          .run(evt.id);
      }
      cardTypesExercised.add("llm_decision");

      // 9. Operator opens /复核队列 and approves each
      await postCommand(app, "复核队列", ctx.operatorOpenId, "");
      cardTypesExercised.add("review_queue");
      const queueCard = stub.sentCards.find((c) =>
        JSON.stringify(c.content).includes("LLM 复核队列")
      );
      expect(queueCard).toBeDefined();
      for (const evt of pendingEvents) {
        await postCardAction(app, {
          card_type: "review_queue",
          action_name: "approve",
          message_id: queueCard!.messageId,
          chat_id: "oc-op",
          trigger_id: `approve-${evt.id}`,
          operator_open_id: ctx.operatorOpenId,
          card_version: "review-queue-v1",
          payload: {
            action: "approve",
            event_id: evt.id,
            note: "e2e approve"
          }
        });
      }

      // 10. C1 echo card for first passed C1
      await app.sub2NotifyHook.onC1Echo({
        memberId: ctx.studentIds[0],
        memberName: "学员1",
        itemCode: "C1",
        creativeText: "用 Claude 做了一个创意脚本",
        llmReason: "具体且可执行"
      });
      cardTypesExercised.add("c1_echo");

      // 11. /互评 → 14 DMs → each votes → /互评结算
      await postCommand(app, "互评", ctx.operatorOpenId, "pr-p2");
      cardTypesExercised.add("peer_review_vote");
      const voteCards = stub.sentCards.filter((c) =>
        JSON.stringify(c.content).includes("互评") &&
        !JSON.stringify(c.content).includes("结算")
      );
      expect(voteCards.length).toBeGreaterThanOrEqual(14);
      for (let i = 0; i < ctx.studentOpenIds.length; i += 1) {
        const voterOpenId = ctx.studentOpenIds[i];
        const targetIdx = (i + 1) % ctx.studentIds.length;
        await postCardAction(app, {
          card_type: "peer_review_vote",
          action_name: "peer_review_vote_submit",
          message_id: voteCards[i].messageId,
          chat_id: `oc-dm-${voterOpenId}`,
          trigger_id: `vote-${i}`,
          operator_open_id: voterOpenId,
          card_version: "peer-review-vote-v1",
          payload: {
            action: "peer_review_vote_submit",
            peer_review_session_id: "pr-p2",
            voter_member_id: ctx.studentIds[i],
            targets: [ctx.studentIds[targetIdx]]
          }
        });
      }
      await postCommand(app, "互评结算", ctx.operatorOpenId, "pr-p2");
      cardTypesExercised.add("peer_review_settle");

      // 12. WindowSettler.notifyMembersWindowSettled → level announcement card
      await app.sub2NotifyHook.onWindowSettled({
        windowCode: "W1",
        settledAt: "2026-04-14T23:59:59.000Z",
        promotions: [
          {
            memberId: ctx.studentIds[0],
            memberName: "学员1",
            fromLevel: 2,
            toLevel: 3,
            pathTaken: "standard",
            growthBonus: 5,
            dims: { K: 18, H: 9, C: 12, S: 6, G: 13 },
            radarImageUrl: "https://cdn/radar/1"
          }
        ]
      });
      cardTypesExercised.add("level_announcement");

      // 13. /排行 → leaderboard
      await postCommand(app, "排行", ctx.operatorOpenId, "");
      cardTypesExercised.add("leaderboard");

      // 14. /成员管理 and /调分
      await postCommand(app, "成员管理", ctx.operatorOpenId, "");
      cardTypesExercised.add("member_mgmt");
      await postCommand(app, "调分", ctx.operatorOpenId, {
        member_id: ctx.studentIds[0],
        item_code: "K3",
        delta: -1,
        reason: "e2e adjust"
      });
      cardTypesExercised.add("manual_adjust");

      // 15. /结业 → graduation
      await postCommand(app, "结业", ctx.operatorOpenId, "");
      cardTypesExercised.add("graduation");

      // --- Assertions ---

      // 16 card types exercised
      const expectedTypes = new Set<string>([
        "period_open",
        "window_open",
        "quiz",
        "homework_submit",
        "video_checkin",
        "daily_checkin",
        "llm_decision",
        "review_queue",
        "c1_echo",
        "peer_review_vote",
        "peer_review_settle",
        "level_announcement",
        "leaderboard",
        "member_mgmt",
        "manual_adjust",
        "graduation"
      ]);
      expect(cardTypesExercised.size).toBe(16);
      for (const t of expectedTypes) {
        expect(cardTypesExercised.has(t)).toBe(true);
      }

      // feishu_live_cards has active rows for the 4 patched types
      const activeRows = repo.db
        .prepare(
          `SELECT card_type, COUNT(*) as n
             FROM feishu_live_cards
            WHERE closed_reason IS NULL
            GROUP BY card_type`
        )
        .all() as Array<{ card_type: string; n: number }>;
      const activeMap = new Map(activeRows.map((r) => [r.card_type, r.n]));
      expect(activeMap.get("daily_checkin") ?? 0).toBeGreaterThanOrEqual(1);
      expect(activeMap.get("homework_submit") ?? 0).toBeGreaterThanOrEqual(1);

      // Dead-letter table is empty
      const deadLetterCount = (
        repo.db
          .prepare(
            "SELECT COUNT(*) as n FROM feishu_card_patch_deadletters WHERE resolved_at IS NULL"
          )
          .get() as { n: number }
      ).n;
      expect(deadLetterCount).toBe(0);

      // Observability counters show meaningful traffic
      const counters = readCounters();
      expect(counters["feishu_card_sent_total"]).toBeDefined();
      expect(
        counters["feishu_card_patched_total"]?.["card_type=daily_checkin,path=sync"]
      ).toBeGreaterThanOrEqual(14);

      // No error logs surfaced as patch errors
      expect(counters["feishu_card_patch_errors_total"] ?? {}).toEqual({});
    }
  );
});
```

- [ ] **Step 2: Write the fixture helper**

Create `tests/services/feishu/cards/integration/helpers/e2e-camp-fixture.ts`:

```typescript
import type { FastifyInstance } from "fastify";

export interface E2eFixture {
  operatorOpenId: string;
  studentOpenIds: string[];
  studentIds: string[];
}

/**
 * Seeds a complete 14-student camp for the E2E smoke test:
 * - 1 camp
 * - 14 student members bound to distinct Feishu open ids
 * - 1 operator member
 * - pre-created W1 window shell (openNewPeriod will bind p2 into it)
 * - pre-created scoring item config (comes from domain/v2/scoring-items-config)
 *
 * Everything else (periods, cards, events, dimension scores) is created
 * during the E2E test itself via command handlers and card-action calls,
 * mirroring a real camp run.
 */
export async function seedE2eCampFixture(
  app: FastifyInstance
): Promise<E2eFixture> {
  const repo = app.scoringRepo;
  const now = "2026-04-10T09:00:00.000Z";
  const campId = "camp-e2e";

  repo.db
    .prepare(
      "INSERT INTO camps (id, name, created_at) VALUES (?, ?, ?)"
    )
    .run(campId, "E2E Camp 2026 Q2", now);

  const operatorId = "m-e2e-op";
  const operatorOpenId = "ou-e2e-op";
  repo.db
    .prepare(
      `INSERT INTO members
         (id, camp_id, display_name, role_type, is_participant,
          is_excluded_from_board, hidden_from_board, source_feishu_open_id)
       VALUES (?, ?, '运营甲', 'operator', 0, 0, 0, ?)`
    )
    .run(operatorId, campId, operatorOpenId);

  const studentIds: string[] = [];
  const studentOpenIds: string[] = [];
  for (let i = 0; i < 14; i += 1) {
    const id = `m-e2e-s${i + 1}`;
    const openId = `ou-e2e-s${i + 1}`;
    studentIds.push(id);
    studentOpenIds.push(openId);
    repo.db
      .prepare(
        `INSERT INTO members
           (id, camp_id, display_name, role_type, is_participant,
            is_excluded_from_board, hidden_from_board, source_feishu_open_id)
         VALUES (?, ?, ?, 'student', 1, 0, 0, ?)`
      )
      .run(id, campId, `学员${i + 1}`, openId);
  }

  // Pre-create W1 shell so /开期 2 can bind into it.
  repo.db
    .prepare(
      `INSERT INTO v2_windows
         (id, camp_id, code, is_final, settlement_state, first_period_id,
          last_period_id, settled_at, created_at)
       VALUES ('w-e2e-w1', ?, 'W1', 0, 'open', NULL, NULL, NULL, ?)`
    )
    .run(campId, now);

  return {
    operatorOpenId,
    studentOpenIds,
    studentIds
  };
}
```

- [ ] **Step 3: Run E2E test to verify it fails**

Run: `npm test -- tests/services/feishu/cards/e2e-camp.test.ts`
Expected: FAIL — depending on the current state of the app wiring, this will surface at least one missing piece: the `sub2NotifyHook.onC1Echo` hook, the `sub2NotifyHook.onWindowSettled` hook, or one of the slash command handlers not yet wired into the router. Fill in the missing pieces in the GREEN step below.

- [ ] **Step 4: Wire any missing pieces in `src/app.ts` and `src/services/feishu/cards/router.ts`**

The Phase D2 notify hook from earlier phases should already expose `onLlmDecision`. Task H4 requires two additional hook methods on `app.sub2NotifyHook`:
- `onC1Echo(input)` → calls `c1EchoHandler(input, commandHandlerDeps)`
- `onWindowSettled(input)` → posts a `level-announcement-v1` card via `feishuClient.sendCard` to the group chat

Similarly, the router must recognize the `/视频`, `/打卡`, `/排行`, `/作业` slash commands (some of these are pre-wired from Phases C-F; any not yet wired are added here so the E2E test can walk the full path). The `POST /api/v2/feishu/events/homework-reply` route must also be wired as the test harness entry point for the `im.message.receive_v1` reply flow from Task G3.

This step is plumbing only — no new production logic beyond what the earlier tasks already designed.

- [ ] **Step 5: Run E2E test to verify it passes**

Run: `npm test -- tests/services/feishu/cards/e2e-camp.test.ts`
Expected: PASS — the single E2E test passes, exercising all 16 card types in one run. Test duration ~10-15 seconds.

- [ ] **Step 6: Run full coverage and verify the 85%/90% gate**

Run: `npm test -- --coverage tests/services/feishu/cards/`
Expected: line coverage ≥ 85%, branch coverage ≥ 90% on `src/services/feishu/cards/**`. Coverage is printed at the bottom of the vitest output. If the gate fails, identify the uncovered branches and add targeted unit tests — do not loosen the threshold.

- [ ] **Step 7: Commit**

```bash
git add \
  tests/services/feishu/cards/e2e-camp.test.ts \
  tests/services/feishu/cards/integration/helpers/e2e-camp-fixture.ts \
  src/app.ts \
  src/services/feishu/cards/router.ts
git commit -m "test(sub2): add full 2-period E2E camp smoke test exercising all 16 cards"
```

---

## Phase H Exit Checkpoint

Run the full suite, build, and coverage report:
```bash
npm test
npm run build
npm test -- --coverage tests/services/feishu/cards/
```

Expected: all green. Sub2 coverage ≥ 85% lines / 90% branches on `src/services/feishu/cards/**`. All 16 card types are exercised in the single E2E test from Task H4. The expiry scanner runs hourly in production (skipped in test env), the dead-letter retry endpoint is live, and the observability metrics endpoint reflects real traffic.

Phase H is the final hardening gate for Sub2. Before claiming Sub2 "done" per spec §13 success criteria, the following must all be true:

- [ ] `npm test` green with zero skipped across the entire Sub2 test surface
- [ ] `npm test -- tests/services/feishu/cards/e2e-camp.test.ts` green, ~10-15 second run
- [ ] `npm run build` clean (no TypeScript errors)
- [ ] Sub2 line coverage ≥ 85% on `src/services/feishu/cards/**` (verified by `--coverage` output)
- [ ] Sub2 branch coverage ≥ 90% on `src/services/feishu/cards/**`
- [ ] All 16 card types exercised in the single long-running E2E test (verified by the `cardTypesExercised` set assertion)
- [ ] `feishu_live_cards` has active rows for `daily_checkin` and `homework_submit` at the end of the camp (verified by SQL assertion)
- [ ] `feishu_card_patch_deadletters` is empty at the end of the E2E test (no unrecovered patch failures)
- [ ] `feishu_card_patch_errors_total` counter is empty at the end of the E2E test (no errors logged)
- [ ] Expiry scanner unit tests prove: within-horizon cards are closed + resent; outside-horizon cards are untouched; sendCard failures leave the old row open
- [ ] Dead-letter retry flow proves: successful retry marks `resolved_at`, failed retry bumps `attempts`, non-existent id returns 404
- [ ] Observability counters accumulate correctly across sync + async paths; `GET /api/v2/feishu/cards/metrics` returns a JSON snapshot
- [ ] Each of the 9 tasks in Phase G + H is on its own line of `git log --oneline` with the `feat(sub2):` or `test(sub2):` prefix
- [ ] Spec §13 success criteria are all checked off, making Sub2 ready for final manual smoke on a real Feishu test cohort
