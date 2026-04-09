# Scoring v2 Core Domain Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the pure domain layer + LLM async worker + operator gating for the AI training camp scoring v2 system, as defined in `docs/superpowers/specs/2026-04-10-scoring-v2-core-domain-design.md`.

**Architecture:** New code lives in `src/domain/v2/`, `src/services/v2/`, `src/storage/sqlite-repository.ts` (extended with v2 methods), `src/app.ts` (extended with `/api/v2/*` routes), backed by SQLite. Event ingestor → ScoringAggregator → WindowSettler → LevelPromotionJudge pipeline with an async LlmScoringWorker for text quality evaluation. 9 new tables co-exist with legacy tables; legacy domain code is deleted in the final phase in a single cleanup commit.

**Tech Stack:** TypeScript 5.9 · Fastify 5 · better-sqlite3 12 · drizzle-orm (schema typing only; queries use raw `db.prepare()` prepared statements) · Zod 4 · vitest 3

**Spec:** `docs/superpowers/specs/2026-04-10-scoring-v2-core-domain-design.md` (commit `5f66b36`)

**Worktree:** `D:\Vibe Coding Project\AI Seed Project\.worktrees\phase-one-feishu`, branch `codex/phase-one-feishu`

**Total tasks:** 47 across 9 phases. Each task is a single focused unit; each step within a task is 2-5 minutes.

---

## Delta from Spec

Two corrections the implementation must respect (the spec was written before full code inspection):

**Delta 1 — `members` table columns already exist**

Spec §2.3 says to `ALTER TABLE members` and add 4 columns. Real state (`src/storage/sqlite-repository.ts:38-48`):

- ✅ `avatar_url TEXT NOT NULL DEFAULT ''` — already exists, reuse
- ✅ `display_name TEXT NOT NULL DEFAULT ''` — already exists, reuse as the "operator-overridable display name" (spec's `display_name_override` is this column)
- ❌ `source_feishu_open_id` — **add**, via `ensureColumn`
- ❌ `hidden_from_board` — **add**, via `ensureColumn`

**Delta 2 — Schema management style**

Spec §1.2 talks about "drizzle schema in `src/db/v2/schema.ts`". Real state: the project does **not** use drizzle query builder. Source of truth is the `tableDefinitions` raw SQL constant in `src/storage/sqlite-repository.ts` plus the `ensureColumn()` helper. Drizzle is used only for static type inference.

**This plan puts all v2 DDL into `tableDefinitions` and uses `db.prepare()` for all v2 queries**. Drizzle `src/db/v2/schema.ts` is a **parallel type-reference file**, not the migration source. Tasks A2 and B* reflect this.

---

## File Structure Map

### New files (created by this plan)

```
src/domain/v2/
├── types.ts                     # TS interfaces/unions for v2 domain
├── errors.ts                    # DomainError hierarchy (11 subclasses)
├── eligibility.ts               # isEligibleStudent single source of truth
├── scoring-items-config.ts      # 15-item config table (caps, dims, needsLlm)
├── growth-bonus.ts              # Growth weighting computation (3 edge cases)
├── rank-context.ts              # computeRankContext for promotion judge
├── promotion-judge.ts           # LevelPromotionJudge decision tree (60 paths)
├── window-settler.ts            # WindowSettler settlement flow
├── period-lifecycle.ts          # /开期 / /开窗 / /结业 handlers
├── ingestor.ts                  # EventIngestor with cap clamping + idempotency
├── aggregator.ts                # ScoringAggregator transactional status flips
├── llm-prompts.ts               # 6 LLM prompt templates (K3/K4/C1/C3/H2/G2)
└── member-sync.ts               # MemberSyncService interface + Stub impl

src/services/v2/
├── token-bucket.ts              # TokenBucket rate limiter
├── semaphore.ts                 # Semaphore concurrency primitive
├── llm-scoring-client.ts        # LlmScoringClient + Fake + OpenAiCompat impl
├── llm-scoring-worker.ts        # LlmScoringWorker background poller
└── reaction-tracker.ts          # C2 emoji count aggregator

src/db/v2/
└── schema.ts                    # drizzle type-reference schema (parallel to tableDefinitions)

tests/domain/v2/
├── eligibility.test.ts
├── scoring-items-config.test.ts
├── errors.test.ts
├── growth-bonus.test.ts
├── rank-context.test.ts
├── promotion-judge.test.ts      # 60 path table-driven
├── window-settler.test.ts
├── period-lifecycle.test.ts
├── ingestor.test.ts
├── aggregator.test.ts
├── llm-prompts.test.ts
└── member-sync.test.ts

tests/services/v2/
├── token-bucket.test.ts
├── semaphore.test.ts
├── llm-scoring-client.test.ts
├── llm-scoring-worker.test.ts
└── reaction-tracker.test.ts

tests/api/v2/
├── events.test.ts
├── periods.test.ts
├── windows.test.ts
├── graduation.test.ts
├── board.test.ts
├── admin-review-queue.test.ts
├── admin-members.test.ts
└── llm-worker-status.test.ts

tests/storage/v2/
└── sqlite-repository-v2.test.ts   # v2 repo method smoke tests
```

### Modified files

- `src/storage/sqlite-repository.ts` — extended with v2 table DDL and v2 methods
- `src/db/schema.ts` — add v2 table drizzle definitions as type reference
- `src/app.ts` — register `/api/v2/*` routes, `requireAdmin` middleware, construct v2 components
- `src/server.ts` — start LlmScoringWorker on boot, graceful stop on signal
- `src/scripts/ensure-bootstrap-data.ts` — seed W1/W2 empty windows, apply `BOOTSTRAP_OPERATOR_OPEN_IDS`
- `.env.example` — document all `LLM_*` and `BOOTSTRAP_OPERATOR_OPEN_IDS` keys

### Deleted files (Phase I, single cleanup commit)

- `src/domain/scoring.ts`
- `src/domain/warnings.ts`
- `src/domain/ranking.ts`
- `src/domain/session-windows.ts`
- `src/domain/submission-aggregation.ts`
- `src/domain/tag-parser.ts`
- `src/services/llm/llm-evaluator.ts`
- `src/services/llm/glm-file-parser.ts`
- `src/services/documents/extract-text.ts`
- `src/services/documents/file-format.ts`
- `src/services/scoring/evaluate-window.ts`
- `src/services/feishu/base-sync.ts`
- `tests/domain/scoring.test.ts`
- `tests/domain/submission-aggregation.test.ts`
- `tests/domain/session-windows.test.ts`
- `tests/services/llm/llm-evaluator.test.ts`
- `tests/services/llm/glm-file-parser.test.ts`
- `tests/services/documents/extract-text-fallback.test.ts`
- `tests/services/feishu-base-sync.test.ts`
- `tests/services/feishu-base-sync-phase-one.test.ts`
- `tests/services/scoring/evaluate-window-attempts.test.ts`
- `web/src/**` (subproject 3 owns the replacement)

---

## Phase A — Foundation (5 tasks)

Prepare directories, the typed error layer, the scoring items config, the eligibility gate, and the v2 DDL baseline. No domain logic yet.

---

### Task A1: Create v2 directory skeleton + placeholder index files

**Files:**
- Create: `src/domain/v2/.gitkeep`
- Create: `src/services/v2/.gitkeep`
- Create: `src/db/v2/.gitkeep`
- Create: `tests/domain/v2/.gitkeep`
- Create: `tests/services/v2/.gitkeep`
- Create: `tests/api/v2/.gitkeep`
- Create: `tests/storage/v2/.gitkeep`

- [ ] **Step 1: Create all directories with .gitkeep**

Run:
```bash
cd "D:/Vibe Coding Project/AI Seed Project/.worktrees/phase-one-feishu"
mkdir -p src/domain/v2 src/services/v2 src/db/v2
mkdir -p tests/domain/v2 tests/services/v2 tests/api/v2 tests/storage/v2
for d in src/domain/v2 src/services/v2 src/db/v2 tests/domain/v2 tests/services/v2 tests/api/v2 tests/storage/v2; do
  touch "$d/.gitkeep"
done
```

- [ ] **Step 2: Verify directories exist**

Run: `ls src/domain/v2 src/services/v2 src/db/v2 tests/domain/v2 tests/services/v2 tests/api/v2 tests/storage/v2`
Expected: Each directory lists `.gitkeep`.

- [ ] **Step 3: Commit**

```bash
git add src/domain/v2 src/services/v2 src/db/v2 tests/domain/v2 tests/services/v2 tests/api/v2 tests/storage/v2
git commit -m "chore: scaffold v2 scoring domain directories"
```

---

### Task A2: Add v2 table DDL to `tableDefinitions`

**Files:**
- Modify: `src/storage/sqlite-repository.ts:30-178` (`tableDefinitions` constant)

This task only adds raw SQL DDL for the 9 new tables. No TS methods yet. The `SqliteRepository` constructor runs `db.exec(tableDefinitions)` which is idempotent thanks to `CREATE TABLE IF NOT EXISTS`.

- [ ] **Step 1: Write failing smoke test**

Create `tests/storage/v2/sqlite-repository-v2.test.ts`:

```typescript
import Database from "better-sqlite3";
import { describe, expect, test } from "vitest";

import { SqliteRepository } from "../../../src/storage/sqlite-repository.js";

describe("SqliteRepository v2 schema", () => {
  test("creates all 9 v2 tables on construction", () => {
    const repo = new SqliteRepository(":memory:");
    // Access the underlying db via a private cast for schema assertion
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db: Database.Database = (repo as unknown as { db: Database.Database }).db;

    const rows = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name IN (?,?,?,?,?,?,?,?,?)"
      )
      .all(
        "v2_periods",
        "v2_windows",
        "v2_card_interactions",
        "v2_scoring_item_events",
        "v2_member_dimension_scores",
        "v2_window_snapshots",
        "v2_member_levels",
        "v2_promotion_records",
        "v2_llm_scoring_tasks"
      ) as Array<{ name: string }>;

    expect(rows.map((r) => r.name).sort()).toEqual([
      "v2_card_interactions",
      "v2_llm_scoring_tasks",
      "v2_member_dimension_scores",
      "v2_member_levels",
      "v2_periods",
      "v2_promotion_records",
      "v2_scoring_item_events",
      "v2_window_snapshots",
      "v2_windows"
    ]);

    repo.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/storage/v2/sqlite-repository-v2.test.ts`
Expected: FAIL — the 9 `v2_*` tables don't exist yet.

- [ ] **Step 3: Append v2 DDL to `tableDefinitions`**

Find the end of the `tableDefinitions` string literal in `src/storage/sqlite-repository.ts` (just before the closing ``` ` `;``). Insert the following SQL **before** the closing backtick:

```sql
CREATE TABLE IF NOT EXISTS v2_periods (
  id TEXT PRIMARY KEY,
  camp_id TEXT NOT NULL,
  number INTEGER NOT NULL,
  is_ice_breaker INTEGER NOT NULL DEFAULT 0,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  opened_by_op_id TEXT,
  closed_reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(camp_id, number)
);
CREATE INDEX IF NOT EXISTS idx_v2_periods_camp_started ON v2_periods (camp_id, started_at DESC);

CREATE TABLE IF NOT EXISTS v2_windows (
  id TEXT PRIMARY KEY,
  camp_id TEXT NOT NULL,
  code TEXT NOT NULL,
  first_period_id TEXT,
  last_period_id TEXT,
  is_final INTEGER NOT NULL DEFAULT 0,
  settlement_state TEXT NOT NULL DEFAULT 'open',
  settled_at TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(camp_id, code)
);

CREATE TABLE IF NOT EXISTS v2_card_interactions (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL,
  period_id TEXT NOT NULL,
  card_type TEXT NOT NULL,
  action_name TEXT NOT NULL,
  action_payload TEXT,
  feishu_message_id TEXT,
  feishu_card_version TEXT,
  received_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_v2_card_interactions_member_period_type
  ON v2_card_interactions (member_id, period_id, card_type);
CREATE INDEX IF NOT EXISTS idx_v2_card_interactions_feishu_msg
  ON v2_card_interactions (feishu_message_id);

CREATE TABLE IF NOT EXISTS v2_scoring_item_events (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL,
  period_id TEXT NOT NULL,
  item_code TEXT NOT NULL,
  dimension TEXT NOT NULL,
  score_delta INTEGER NOT NULL,
  source_type TEXT NOT NULL,
  source_ref TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  llm_task_id TEXT,
  reviewed_by_op_id TEXT,
  review_note TEXT,
  created_at TEXT NOT NULL,
  decided_at TEXT,
  UNIQUE(member_id, period_id, item_code, source_ref)
);
CREATE INDEX IF NOT EXISTS idx_v2_scoring_events_member_period_status
  ON v2_scoring_item_events (member_id, period_id, status);
CREATE INDEX IF NOT EXISTS idx_v2_scoring_events_status_decided
  ON v2_scoring_item_events (status, decided_at);

CREATE TABLE IF NOT EXISTS v2_member_dimension_scores (
  member_id TEXT NOT NULL,
  period_id TEXT NOT NULL,
  dimension TEXT NOT NULL,
  period_score INTEGER NOT NULL DEFAULT 0,
  event_count INTEGER NOT NULL DEFAULT 0,
  last_event_at TEXT,
  PRIMARY KEY (member_id, period_id, dimension)
);
CREATE INDEX IF NOT EXISTS idx_v2_dim_scores_period_dim
  ON v2_member_dimension_scores (period_id, dimension, period_score DESC);

CREATE TABLE IF NOT EXISTS v2_window_snapshots (
  id TEXT PRIMARY KEY,
  window_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  window_aq INTEGER NOT NULL,
  cumulative_aq INTEGER NOT NULL,
  k_score INTEGER NOT NULL,
  h_score INTEGER NOT NULL,
  c_score INTEGER NOT NULL,
  s_score INTEGER NOT NULL,
  g_score INTEGER NOT NULL,
  growth_bonus INTEGER NOT NULL DEFAULT 0,
  consec_missed_on_entry INTEGER NOT NULL DEFAULT 0,
  snapshot_at TEXT NOT NULL,
  UNIQUE(window_id, member_id)
);
CREATE INDEX IF NOT EXISTS idx_v2_window_snapshots_member
  ON v2_window_snapshots (member_id, window_id);

CREATE TABLE IF NOT EXISTS v2_member_levels (
  member_id TEXT PRIMARY KEY,
  current_level INTEGER NOT NULL DEFAULT 1,
  level_attained_at TEXT NOT NULL,
  last_window_id TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS v2_promotion_records (
  id TEXT PRIMARY KEY,
  window_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  evaluated_at TEXT NOT NULL,
  from_level INTEGER NOT NULL,
  to_level INTEGER NOT NULL,
  promoted INTEGER NOT NULL,
  path_taken TEXT NOT NULL,
  reason TEXT NOT NULL,
  UNIQUE(window_id, member_id)
);

CREATE TABLE IF NOT EXISTS v2_llm_scoring_tasks (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt_text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  result_json TEXT,
  error_reason TEXT,
  enqueued_at TEXT NOT NULL,
  started_at TEXT,
  finished_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_v2_llm_tasks_status_enqueued
  ON v2_llm_scoring_tasks (status, enqueued_at);
```

Also extend the `members` table with two new columns via `ensureCompatibility()` — locate that method and add these two lines **alongside** the existing `ensureColumn` calls:

```typescript
ensureColumn(this.db, "members", "source_feishu_open_id", "TEXT NOT NULL DEFAULT ''");
ensureColumn(this.db, "members", "hidden_from_board", "INTEGER NOT NULL DEFAULT 0");
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/storage/v2/sqlite-repository-v2.test.ts`
Expected: PASS — 9 tables present.

Also run the full suite to confirm no regression: `npm test`
Expected: all existing tests still pass.

- [ ] **Step 5: Commit**

```bash
git add src/storage/sqlite-repository.ts tests/storage/v2/sqlite-repository-v2.test.ts
git commit -m "feat(v2): add scoring v2 DDL and members column extensions"
```

---

### Task A3: Typed DomainError hierarchy

**Files:**
- Create: `src/domain/v2/errors.ts`
- Test: `tests/domain/v2/errors.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/domain/v2/errors.test.ts`:

```typescript
import { describe, expect, test } from "vitest";

import {
  DomainError,
  DuplicateEventError,
  IceBreakerPeriodError,
  InvalidDecisionStateError,
  InvalidLevelTransitionError,
  LlmExhaustedError,
  LlmNonRetryableError,
  LlmRetryableError,
  NoActivePeriodError,
  NoActiveWindowError,
  NotEligibleError,
  PerPeriodCapExceededError,
  WindowAlreadySettledError
} from "../../../src/domain/v2/errors.js";

describe("DomainError hierarchy", () => {
  test("NotEligibleError carries code 'not_eligible'", () => {
    const err = new NotEligibleError("member-1");
    expect(err).toBeInstanceOf(DomainError);
    expect(err.code).toBe("not_eligible");
    expect(err.message).toContain("member-1");
    expect(err.name).toBe("NotEligibleError");
  });

  test("PerPeriodCapExceededError exposes memberId, itemCode, cap", () => {
    const err = new PerPeriodCapExceededError("member-1", "K3", 3);
    expect(err.code).toBe("cap_exceeded");
    expect(err.message).toContain("K3");
    expect(err.message).toContain("3");
  });

  test("DuplicateEventError carries source ref", () => {
    const err = new DuplicateEventError("src-abc");
    expect(err.code).toBe("duplicate");
    expect(err.message).toContain("src-abc");
  });

  test("all other error classes are DomainError subclasses with distinct codes", () => {
    const errors: DomainError[] = [
      new NoActivePeriodError(),
      new IceBreakerPeriodError(),
      new NoActiveWindowError(),
      new WindowAlreadySettledError("window-w1"),
      new InvalidLevelTransitionError(1, 3),
      new InvalidDecisionStateError("evt-xyz", "approved"),
      new LlmRetryableError("timeout"),
      new LlmNonRetryableError("json parse"),
      new LlmExhaustedError("3 attempts failed")
    ];
    const codes = errors.map((e) => e.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const err of errors) {
      expect(err).toBeInstanceOf(DomainError);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/domain/v2/errors.test.ts`
Expected: FAIL — `src/domain/v2/errors.js` module not found.

- [ ] **Step 3: Implement `src/domain/v2/errors.ts`**

```typescript
export class DomainError extends Error {
  constructor(
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class NotEligibleError extends DomainError {
  constructor(memberId: string) {
    super("not_eligible", `Member ${memberId} is not an eligible student`);
  }
}

export class PerPeriodCapExceededError extends DomainError {
  constructor(memberId: string, itemCode: string, cap: number) {
    super(
      "cap_exceeded",
      `${itemCode} per-period cap ${cap} reached for member ${memberId}`
    );
  }
}

export class DuplicateEventError extends DomainError {
  constructor(sourceRef: string) {
    super("duplicate", `Event with sourceRef=${sourceRef} already exists`);
  }
}

export class NoActivePeriodError extends DomainError {
  constructor() {
    super("no_active_period", "No active period currently open");
  }
}

export class IceBreakerPeriodError extends DomainError {
  constructor() {
    super("ice_breaker_no_scoring", "Ice-breaker period does not count toward AQ");
  }
}

export class NoActiveWindowError extends DomainError {
  constructor() {
    super(
      "no_active_window",
      "No open evaluation window available; please /开窗 <code> first"
    );
  }
}

export class WindowAlreadySettledError extends DomainError {
  constructor(windowId: string) {
    super("window_already_settled", `Window ${windowId} is already settled`);
  }
}

export class InvalidLevelTransitionError extends DomainError {
  constructor(from: number, to: number) {
    super(
      "invalid_level_transition",
      `Invalid level transition: ${from} -> ${to}`
    );
  }
}

/**
 * Thrown when an operator attempts to decide on a scoring event that is
 * not currently in `review_required` state (e.g. already `approved`/`rejected`).
 * Referenced by Phase G9 review-queue POST route — returns HTTP 409.
 */
export class InvalidDecisionStateError extends DomainError {
  constructor(eventId: string, currentStatus: string) {
    super(
      "invalid_decision_state",
      `Event ${eventId} is not in review_required state (current: ${currentStatus})`
    );
  }
}

export class LlmRetryableError extends DomainError {
  constructor(reason: string) {
    super("llm_retryable", reason);
  }
}

export class LlmNonRetryableError extends DomainError {
  constructor(reason: string) {
    super("llm_non_retryable", reason);
  }
}

export class LlmExhaustedError extends DomainError {
  constructor(reason: string) {
    super("llm_exhausted", reason);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/domain/v2/errors.test.ts`
Expected: PASS — all 4 test cases green.

- [ ] **Step 5: Commit**

```bash
git add src/domain/v2/errors.ts tests/domain/v2/errors.test.ts
git commit -m "feat(v2): add typed DomainError hierarchy"
```

---

### Task A4: Scoring items config (15-item truth table)

**Files:**
- Create: `src/domain/v2/scoring-items-config.ts`
- Test: `tests/domain/v2/scoring-items-config.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/domain/v2/scoring-items-config.test.ts`:

```typescript
import { describe, expect, test } from "vitest";

import {
  SCORING_ITEMS,
  getScoringItemConfig,
  type ScoringItemCode,
  type ScoringDimension
} from "../../../src/domain/v2/scoring-items-config.js";

describe("scoring-items-config", () => {
  test("exactly 15 items", () => {
    const codes = Object.keys(SCORING_ITEMS) as ScoringItemCode[];
    expect(codes).toHaveLength(15);
  });

  test("K dimension per-period cap sum = 20", () => {
    const kItems = Object.values(SCORING_ITEMS).filter((i) => i.dimension === "K");
    const sum = kItems.reduce((acc, i) => acc + i.perPeriodCap, 0);
    expect(sum).toBe(20);
  });

  test("H dimension per-period cap sum = 10", () => {
    const hItems = Object.values(SCORING_ITEMS).filter((i) => i.dimension === "H");
    const sum = hItems.reduce((acc, i) => acc + i.perPeriodCap, 0);
    expect(sum).toBe(10);
  });

  test("C dimension per-period cap sum = 17", () => {
    const cItems = Object.values(SCORING_ITEMS).filter((i) => i.dimension === "C");
    const sum = cItems.reduce((acc, i) => acc + i.perPeriodCap, 0);
    expect(sum).toBe(17);
  });

  test("S dimension per-period cap sum = 8", () => {
    const sItems = Object.values(SCORING_ITEMS).filter((i) => i.dimension === "S");
    const sum = sItems.reduce((acc, i) => acc + i.perPeriodCap, 0);
    expect(sum).toBe(8);
  });

  test("G dimension per-period cap sum = 15", () => {
    const gItems = Object.values(SCORING_ITEMS).filter((i) => i.dimension === "G");
    const sum = gItems.reduce((acc, i) => acc + i.perPeriodCap, 0);
    expect(sum).toBe(15);
  });

  test("five dimensions total sum = 70 (per-period max AQ)", () => {
    const sum = Object.values(SCORING_ITEMS).reduce(
      (acc, i) => acc + i.perPeriodCap,
      0
    );
    expect(sum).toBe(70);
  });

  test("K3 cap is 3 (divergence 8.1 from spec)", () => {
    expect(SCORING_ITEMS.K3.perPeriodCap).toBe(3);
  });

  test("6 items require LLM: K3, K4, C1, C3, H2, G2", () => {
    const llmItems = Object.entries(SCORING_ITEMS)
      .filter(([, cfg]) => cfg.needsLlm)
      .map(([code]) => code)
      .sort();
    expect(llmItems).toEqual(["C1", "C3", "G2", "H2", "K3", "K4"]);
  });

  test("getScoringItemConfig returns config for known codes", () => {
    const cfg = getScoringItemConfig("K3");
    expect(cfg.dimension).toBe("K");
    expect(cfg.perPeriodCap).toBe(3);
    expect(cfg.needsLlm).toBe(true);
  });

  test("getScoringItemConfig throws for unknown code", () => {
    expect(() =>
      getScoringItemConfig("ZZ" as ScoringItemCode)
    ).toThrow(/unknown/i);
  });

  test("ScoringDimension type is exactly K|H|C|S|G", () => {
    const dims: ScoringDimension[] = ["K", "H", "C", "S", "G"];
    expect(dims).toHaveLength(5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/domain/v2/scoring-items-config.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/domain/v2/scoring-items-config.ts`**

```typescript
export type ScoringDimension = "K" | "H" | "C" | "S" | "G";

export type ScoringItemCode =
  | "K1" | "K2" | "K3" | "K4"
  | "H1" | "H2" | "H3"
  | "C1" | "C2" | "C3"
  | "S1" | "S2"
  | "G1" | "G2" | "G3";

export type ScoringSourceType =
  | "card_interaction"
  | "quiz_result"
  | "emoji_reaction"
  | "raw_event_aggregation"
  | "operator_manual"
  | "growth_bonus";

export interface ScoringItemConfig {
  code: ScoringItemCode;
  dimension: ScoringDimension;
  defaultScoreDelta: number;
  perPeriodCap: number;
  needsLlm: boolean;
  sourceType: ScoringSourceType;
}

export const SCORING_ITEMS: Record<ScoringItemCode, ScoringItemConfig> = {
  K1: { code: "K1", dimension: "K", defaultScoreDelta: 3,  perPeriodCap: 3,  needsLlm: false, sourceType: "card_interaction" },
  K2: { code: "K2", dimension: "K", defaultScoreDelta: 10, perPeriodCap: 10, needsLlm: false, sourceType: "quiz_result" },
  K3: { code: "K3", dimension: "K", defaultScoreDelta: 3,  perPeriodCap: 3,  needsLlm: true,  sourceType: "card_interaction" },
  K4: { code: "K4", dimension: "K", defaultScoreDelta: 4,  perPeriodCap: 4,  needsLlm: true,  sourceType: "card_interaction" },
  H1: { code: "H1", dimension: "H", defaultScoreDelta: 5,  perPeriodCap: 5,  needsLlm: false, sourceType: "card_interaction" },
  H2: { code: "H2", dimension: "H", defaultScoreDelta: 3,  perPeriodCap: 3,  needsLlm: true,  sourceType: "card_interaction" },
  H3: { code: "H3", dimension: "H", defaultScoreDelta: 2,  perPeriodCap: 2,  needsLlm: false, sourceType: "card_interaction" },
  C1: { code: "C1", dimension: "C", defaultScoreDelta: 4,  perPeriodCap: 8,  needsLlm: true,  sourceType: "card_interaction" },
  C2: { code: "C2", dimension: "C", defaultScoreDelta: 1,  perPeriodCap: 4,  needsLlm: false, sourceType: "emoji_reaction" },
  C3: { code: "C3", dimension: "C", defaultScoreDelta: 5,  perPeriodCap: 5,  needsLlm: true,  sourceType: "card_interaction" },
  S1: { code: "S1", dimension: "S", defaultScoreDelta: 3,  perPeriodCap: 6,  needsLlm: false, sourceType: "card_interaction" },
  S2: { code: "S2", dimension: "S", defaultScoreDelta: 2,  perPeriodCap: 2,  needsLlm: false, sourceType: "card_interaction" },
  G1: { code: "G1", dimension: "G", defaultScoreDelta: 5,  perPeriodCap: 5,  needsLlm: false, sourceType: "card_interaction" },
  G2: { code: "G2", dimension: "G", defaultScoreDelta: 3,  perPeriodCap: 6,  needsLlm: true,  sourceType: "card_interaction" },
  G3: { code: "G3", dimension: "G", defaultScoreDelta: 4,  perPeriodCap: 4,  needsLlm: false, sourceType: "raw_event_aggregation" }
};

export function getScoringItemConfig(code: ScoringItemCode): ScoringItemConfig {
  const cfg = SCORING_ITEMS[code];
  if (!cfg) {
    throw new Error(`unknown scoring item code: ${code}`);
  }
  return cfg;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/domain/v2/scoring-items-config.test.ts`
Expected: PASS — all 12 assertions green.

- [ ] **Step 5: Commit**

```bash
git add src/domain/v2/scoring-items-config.ts tests/domain/v2/scoring-items-config.test.ts
git commit -m "feat(v2): add 15-item scoring config with K3 cap correction"
```

---

### Task A5: `eligibility.ts` — single source of truth

**Files:**
- Create: `src/domain/v2/eligibility.ts`
- Test: `tests/domain/v2/eligibility.test.ts`

The function is pure: it takes a `MemberRecord`-like shape and returns `boolean`. It does not reach into the database directly; the caller hands it the loaded member.

- [ ] **Step 1: Write failing test**

Create `tests/domain/v2/eligibility.test.ts`:

```typescript
import { describe, expect, test } from "vitest";

import {
  ELIGIBLE_STUDENT_WHERE_CLAUSE,
  isEligibleStudent,
  type EligibilityInput
} from "../../../src/domain/v2/eligibility.js";

function base(): EligibilityInput {
  return {
    roleType: "student",
    isParticipant: true,
    isExcludedFromBoard: false
  };
}

describe("isEligibleStudent", () => {
  test("returns true for baseline student", () => {
    expect(isEligibleStudent(base())).toBe(true);
  });

  test("returns false when roleType is operator", () => {
    expect(isEligibleStudent({ ...base(), roleType: "operator" })).toBe(false);
  });

  test("returns false when roleType is trainer", () => {
    expect(isEligibleStudent({ ...base(), roleType: "trainer" })).toBe(false);
  });

  test("returns false when roleType is observer", () => {
    expect(isEligibleStudent({ ...base(), roleType: "observer" })).toBe(false);
  });

  test("returns false when isParticipant=false", () => {
    expect(isEligibleStudent({ ...base(), isParticipant: false })).toBe(false);
  });

  test("returns false when isExcludedFromBoard=true", () => {
    expect(isEligibleStudent({ ...base(), isExcludedFromBoard: true })).toBe(false);
  });

  test("returns false when input is null/undefined", () => {
    expect(isEligibleStudent(undefined)).toBe(false);
    expect(isEligibleStudent(null)).toBe(false);
  });

  test("ELIGIBLE_STUDENT_WHERE_CLAUSE mirrors the TS predicate for SQL callers", () => {
    // Phase G7 imports this constant instead of inlining the rule, so the
    // SQL layer and the domain layer stay in lockstep (spec §5.6).
    expect(ELIGIBLE_STUDENT_WHERE_CLAUSE).toContain("role_type = 'student'");
    expect(ELIGIBLE_STUDENT_WHERE_CLAUSE).toContain("is_participant = 1");
    expect(ELIGIBLE_STUDENT_WHERE_CLAUSE).toContain("is_excluded_from_board = 0");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/domain/v2/eligibility.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/domain/v2/eligibility.ts`**

```typescript
export type MemberRoleType = "student" | "operator" | "trainer" | "observer";

export interface EligibilityInput {
  roleType: MemberRoleType;
  isParticipant: boolean;
  isExcludedFromBoard: boolean;
}

export function isEligibleStudent(
  member: EligibilityInput | null | undefined
): boolean {
  if (!member) return false;
  if (member.roleType !== "student") return false;
  if (!member.isParticipant) return false;
  if (member.isExcludedFromBoard) return false;
  return true;
}

/**
 * SQL mirror of `isEligibleStudent` for use in repository-layer queries.
 * The spec (§5.6) calls `isEligibleStudent` the "唯一真相源" (single source
 * of truth) for eligibility. Any SQL caller that filters eligible students
 * (e.g. Phase G7 `fetchRankingByCamp`) MUST import this constant instead of
 * inlining the predicate, so the TS function and the SQL layer cannot drift.
 *
 * Intended usage: `WHERE ${ELIGIBLE_STUDENT_WHERE_CLAUSE}` against a `members`
 * row or alias (columns: `role_type`, `is_participant`, `is_excluded_from_board`).
 * If a new eligibility column is added, edit BOTH `isEligibleStudent` and this
 * constant in the same commit; the A5 test asserts they contain matching tokens.
 */
export const ELIGIBLE_STUDENT_WHERE_CLAUSE =
  "role_type = 'student' AND is_participant = 1 AND is_excluded_from_board = 0";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/domain/v2/eligibility.test.ts`
Expected: PASS — all 8 assertions green (7 for `isEligibleStudent` + 1 for `ELIGIBLE_STUDENT_WHERE_CLAUSE` SQL mirror).

- [ ] **Step 5: Commit**

```bash
git add src/domain/v2/eligibility.ts tests/domain/v2/eligibility.test.ts
git commit -m "feat(v2): add isEligibleStudent single source of truth"
```

---

## Phase A Exit Checkpoint

Run the full suite and build:
```bash
npm test
npm run build
```
Expected: both green, 5 new tests + all legacy tests pass. 9 new tables present in the DDL. No new v2 domain logic yet — foundation only.

---

## Phase B — Data Access Layer (10 tasks)

Extend `src/storage/sqlite-repository.ts` with raw-SQL prepared-statement methods for every v2 table defined in Phase A. All tests append to `tests/storage/v2/sqlite-repository-v2.test.ts` (created in Task A2). No drizzle query builder — use `this.db.prepare(...).run()` / `.get()` / `.all()` only.

All v2 methods follow the existing `SqliteRepository` conventions:

- snake_case column names, camelCase TS field names, manual mapping per row
- Multi-step writes wrapped in `this.db.transaction(() => { ... })(args)`
- UUIDs via `randomUUID()` imported from `node:crypto`
- FK members are seeded via `repo.seedDemo()` where tests need them
- `:memory:` SQLite for tests, `repo.close()` at end of each `test()` block that constructs a repo

---

### Task B1: `periods` CRUD

**Files:**
- Modify: `src/storage/sqlite-repository.ts` (append methods after existing members methods)
- Test: `tests/storage/v2/sqlite-repository-v2.test.ts` (append a new `describe` block)

Implements the period lifecycle storage primitives: insert a new period, look up the currently active period (most recent `ended_at IS NULL`), look up by `(campId, number)`, close an open period atomically, and list all periods in a camp.

- [ ] **Step 1: Write the failing test**

Append to `tests/storage/v2/sqlite-repository-v2.test.ts`:

```typescript
import { randomUUID } from "node:crypto";

describe("SqliteRepository v2 periods", () => {
  test("insertPeriod + findActivePeriod + findPeriodByNumber + closePeriod + listPeriods", () => {
    const repo = new SqliteRepository(":memory:");
    repo.seedDemo();
    const campId = repo.getDefaultCampId()!;

    // insert ice-breaker (period 1)
    const p1 = {
      id: `period-${campId}-1`,
      campId,
      number: 1,
      isIceBreaker: true,
      startedAt: "2026-04-10T00:00:00.000Z",
      openedByOpId: "op-001",
      createdAt: "2026-04-10T00:00:00.000Z",
      updatedAt: "2026-04-10T00:00:00.000Z"
    };
    repo.insertPeriod(p1);

    // findActivePeriod should return p1
    const active1 = repo.findActivePeriod(campId);
    expect(active1?.id).toBe(p1.id);
    expect(active1?.number).toBe(1);
    expect(active1?.isIceBreaker).toBe(true);
    expect(active1?.endedAt).toBeNull();

    // findPeriodByNumber
    const byNum = repo.findPeriodByNumber(campId, 1);
    expect(byNum?.id).toBe(p1.id);

    // insert period 2 and close period 1 atomically via closePeriod
    repo.closePeriod(p1.id, "2026-04-11T00:00:00.000Z", "next_period_opened");

    const p2 = {
      id: `period-${campId}-2`,
      campId,
      number: 2,
      isIceBreaker: false,
      startedAt: "2026-04-11T00:00:00.000Z",
      openedByOpId: "op-001",
      createdAt: "2026-04-11T00:00:00.000Z",
      updatedAt: "2026-04-11T00:00:00.000Z"
    };
    repo.insertPeriod(p2);

    const active2 = repo.findActivePeriod(campId);
    expect(active2?.id).toBe(p2.id);

    const closedP1 = repo.findPeriodByNumber(campId, 1);
    expect(closedP1?.endedAt).toBe("2026-04-11T00:00:00.000Z");
    expect(closedP1?.closedReason).toBe("next_period_opened");

    const all = repo.listPeriods(campId);
    expect(all.map((p) => p.number)).toEqual([1, 2]);

    // unknown number returns undefined
    expect(repo.findPeriodByNumber(campId, 99)).toBeUndefined();

    repo.close();
  });

  test("findActivePeriod returns undefined when all periods closed", () => {
    const repo = new SqliteRepository(":memory:");
    repo.seedDemo();
    const campId = repo.getDefaultCampId()!;

    const p = {
      id: `period-${campId}-1`,
      campId,
      number: 1,
      isIceBreaker: true,
      startedAt: "2026-04-10T00:00:00.000Z",
      openedByOpId: null,
      createdAt: "2026-04-10T00:00:00.000Z",
      updatedAt: "2026-04-10T00:00:00.000Z"
    };
    repo.insertPeriod(p);
    repo.closePeriod(p.id, "2026-04-11T00:00:00.000Z", "manual_close");

    expect(repo.findActivePeriod(campId)).toBeUndefined();
    repo.close();
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npm test -- tests/storage/v2/sqlite-repository-v2.test.ts`
Expected: FAIL — `repo.insertPeriod is not a function`.

- [ ] **Step 3: Write the minimal implementation**

In `src/storage/sqlite-repository.ts`, add a type above the class:

```typescript
export interface PeriodRecord {
  id: string;
  campId: string;
  number: number;
  isIceBreaker: boolean;
  startedAt: string;
  endedAt: string | null;
  openedByOpId: string | null;
  closedReason: string | null;
  createdAt: string;
  updatedAt: string;
}
```

Add the following methods inside `SqliteRepository` (append after the existing member helpers, before `close()`):

```typescript
insertPeriod(input: {
  id: string;
  campId: string;
  number: number;
  isIceBreaker: boolean;
  startedAt: string;
  openedByOpId: string | null;
  createdAt: string;
  updatedAt: string;
}): void {
  this.db
    .prepare(
      `INSERT INTO v2_periods
        (id, camp_id, number, is_ice_breaker, started_at, ended_at,
         opened_by_op_id, closed_reason, created_at, updated_at)
       VALUES (@id, @campId, @number, @isIceBreaker, @startedAt, NULL,
               @openedByOpId, NULL, @createdAt, @updatedAt)`
    )
    .run({
      id: input.id,
      campId: input.campId,
      number: input.number,
      isIceBreaker: input.isIceBreaker ? 1 : 0,
      startedAt: input.startedAt,
      openedByOpId: input.openedByOpId,
      createdAt: input.createdAt,
      updatedAt: input.updatedAt
    });
}

findActivePeriod(campId: string): PeriodRecord | undefined {
  const row = this.db
    .prepare(
      `SELECT * FROM v2_periods
       WHERE camp_id = ? AND ended_at IS NULL
       ORDER BY started_at DESC LIMIT 1`
    )
    .get(campId) as Record<string, unknown> | undefined;
  return row ? this.mapPeriodRow(row) : undefined;
}

findPeriodByNumber(campId: string, number: number): PeriodRecord | undefined {
  const row = this.db
    .prepare(
      `SELECT * FROM v2_periods WHERE camp_id = ? AND number = ? LIMIT 1`
    )
    .get(campId, number) as Record<string, unknown> | undefined;
  return row ? this.mapPeriodRow(row) : undefined;
}

closePeriod(id: string, endedAt: string, reason: string): void {
  this.db
    .prepare(
      `UPDATE v2_periods
       SET ended_at = ?, closed_reason = ?, updated_at = ?
       WHERE id = ?`
    )
    .run(endedAt, reason, endedAt, id);
}

listPeriods(campId: string): PeriodRecord[] {
  const rows = this.db
    .prepare(
      `SELECT * FROM v2_periods WHERE camp_id = ? ORDER BY number ASC`
    )
    .all(campId) as Array<Record<string, unknown>>;
  return rows.map((row) => this.mapPeriodRow(row));
}

private mapPeriodRow(row: Record<string, unknown>): PeriodRecord {
  return {
    id: String(row.id),
    campId: String(row.camp_id),
    number: Number(row.number),
    isIceBreaker: Number(row.is_ice_breaker) === 1,
    startedAt: String(row.started_at),
    endedAt: row.ended_at === null ? null : String(row.ended_at),
    openedByOpId: row.opened_by_op_id === null ? null : String(row.opened_by_op_id),
    closedReason: row.closed_reason === null ? null : String(row.closed_reason),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `npm test -- tests/storage/v2/sqlite-repository-v2.test.ts`
Expected: PASS — two new `periods` tests green, Phase A tests still green.

Also run `npm test` to confirm the rest of the suite is untouched.

- [ ] **Step 5: Commit**

```bash
git add src/storage/sqlite-repository.ts tests/storage/v2/sqlite-repository-v2.test.ts
git commit -m "feat(v2): add periods CRUD to SqliteRepository"
```

---

### Task B2: `windows` CRUD

**Files:**
- Modify: `src/storage/sqlite-repository.ts`
- Test: `tests/storage/v2/sqlite-repository-v2.test.ts`

Implements the lazy-window lifecycle: insert an empty window shell, find the next open window that still has a slot for a period, attach the first or last period, mark `settling` / `settled`, and look up by `last_period_id` or `code`. `findOpenWindowWithOpenSlot` is used by `/开期` to bind a new period to the active window.

- [ ] **Step 1: Write the failing test**

Append to `tests/storage/v2/sqlite-repository-v2.test.ts`:

```typescript
describe("SqliteRepository v2 windows", () => {
  test("insertWindowShell + attachFirstPeriod + attachLastPeriod + findWindowByLastPeriod", () => {
    const repo = new SqliteRepository(":memory:");
    repo.seedDemo();
    const campId = repo.getDefaultCampId()!;

    // seed two periods to attach later
    const p2 = {
      id: `period-${campId}-2`,
      campId,
      number: 2,
      isIceBreaker: false,
      startedAt: "2026-04-11T00:00:00.000Z",
      openedByOpId: null,
      createdAt: "2026-04-11T00:00:00.000Z",
      updatedAt: "2026-04-11T00:00:00.000Z"
    };
    const p3 = {
      id: `period-${campId}-3`,
      campId,
      number: 3,
      isIceBreaker: false,
      startedAt: "2026-04-12T00:00:00.000Z",
      openedByOpId: null,
      createdAt: "2026-04-12T00:00:00.000Z",
      updatedAt: "2026-04-12T00:00:00.000Z"
    };
    repo.insertPeriod(p2);
    repo.insertPeriod(p3);

    // insert W1 shell (no periods)
    repo.insertWindowShell({
      code: "W1",
      campId,
      isFinal: false,
      createdAt: "2026-04-10T00:00:00.000Z"
    });

    // findOpenWindowWithOpenSlot returns W1
    const open1 = repo.findOpenWindowWithOpenSlot(campId);
    expect(open1?.code).toBe("W1");
    expect(open1?.firstPeriodId).toBeNull();
    expect(open1?.lastPeriodId).toBeNull();

    repo.attachFirstPeriod(open1!.id, p2.id);
    const afterFirst = repo.findOpenWindowWithOpenSlot(campId);
    expect(afterFirst?.firstPeriodId).toBe(p2.id);
    expect(afterFirst?.lastPeriodId).toBeNull();

    repo.attachLastPeriod(afterFirst!.id, p3.id);

    // now W1 has no open slot → findOpenWindowWithOpenSlot returns undefined
    expect(repo.findOpenWindowWithOpenSlot(campId)).toBeUndefined();

    // findWindowByLastPeriod(p3) returns W1
    const byLast = repo.findWindowByLastPeriod(p3.id);
    expect(byLast?.code).toBe("W1");

    // findWindowByCode
    const byCode = repo.findWindowByCode(campId, "W1");
    expect(byCode?.id).toBe(byLast?.id);

    // markWindowSettling → markWindowSettled
    repo.markWindowSettling(byLast!.id);
    const settling = repo.findWindowByCode(campId, "W1");
    expect(settling?.settlementState).toBe("settling");

    repo.markWindowSettled(byLast!.id, "2026-04-20T00:00:00.000Z");
    const settled = repo.findWindowByCode(campId, "W1");
    expect(settled?.settlementState).toBe("settled");
    expect(settled?.settledAt).toBe("2026-04-20T00:00:00.000Z");

    repo.close();
  });

  test("insertWindowShell is idempotent on UNIQUE(camp_id, code)", () => {
    const repo = new SqliteRepository(":memory:");
    repo.seedDemo();
    const campId = repo.getDefaultCampId()!;

    repo.insertWindowShell({
      code: "W2",
      campId,
      isFinal: false,
      createdAt: "2026-04-10T00:00:00.000Z"
    });
    expect(() =>
      repo.insertWindowShell({
        code: "W2",
        campId,
        isFinal: false,
        createdAt: "2026-04-10T00:00:00.000Z"
      })
    ).toThrow(/UNIQUE/);

    repo.close();
  });

  test("findOpenWindowWithOpenSlot skips settled windows", () => {
    const repo = new SqliteRepository(":memory:");
    repo.seedDemo();
    const campId = repo.getDefaultCampId()!;

    repo.insertWindowShell({
      code: "W1",
      campId,
      isFinal: false,
      createdAt: "2026-04-10T00:00:00.000Z"
    });
    const w1 = repo.findWindowByCode(campId, "W1")!;
    repo.markWindowSettling(w1.id);
    repo.markWindowSettled(w1.id, "2026-04-20T00:00:00.000Z");

    expect(repo.findOpenWindowWithOpenSlot(campId)).toBeUndefined();
    repo.close();
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npm test -- tests/storage/v2/sqlite-repository-v2.test.ts`
Expected: FAIL — `repo.insertWindowShell is not a function`.

- [ ] **Step 3: Write the minimal implementation**

Add the type above the class:

```typescript
export interface WindowRecord {
  id: string;
  campId: string;
  code: string;
  firstPeriodId: string | null;
  lastPeriodId: string | null;
  isFinal: boolean;
  settlementState: "open" | "settling" | "settled";
  settledAt: string | null;
  createdAt: string;
}
```

Add inside `SqliteRepository`:

```typescript
insertWindowShell(input: {
  code: string;
  campId: string;
  isFinal: boolean;
  createdAt: string;
}): void {
  this.db
    .prepare(
      `INSERT INTO v2_windows
        (id, camp_id, code, first_period_id, last_period_id, is_final,
         settlement_state, settled_at, created_at)
       VALUES (@id, @campId, @code, NULL, NULL, @isFinal, 'open', NULL, @createdAt)`
    )
    .run({
      id: `window-${input.campId}-${input.code.toLowerCase()}`,
      campId: input.campId,
      code: input.code,
      isFinal: input.isFinal ? 1 : 0,
      createdAt: input.createdAt
    });
}

findOpenWindowWithOpenSlot(campId: string): WindowRecord | undefined {
  const row = this.db
    .prepare(
      `SELECT * FROM v2_windows
       WHERE camp_id = ? AND settlement_state = 'open'
         AND (first_period_id IS NULL OR last_period_id IS NULL)
       ORDER BY code ASC
       LIMIT 1`
    )
    .get(campId) as Record<string, unknown> | undefined;
  return row ? this.mapWindowRow(row) : undefined;
}

attachFirstPeriod(windowId: string, periodId: string): void {
  this.db
    .prepare(
      `UPDATE v2_windows SET first_period_id = ? WHERE id = ? AND first_period_id IS NULL`
    )
    .run(periodId, windowId);
}

attachLastPeriod(windowId: string, periodId: string): void {
  this.db
    .prepare(
      `UPDATE v2_windows SET last_period_id = ? WHERE id = ? AND last_period_id IS NULL`
    )
    .run(periodId, windowId);
}

findWindowByLastPeriod(periodId: string): WindowRecord | undefined {
  const row = this.db
    .prepare(`SELECT * FROM v2_windows WHERE last_period_id = ? LIMIT 1`)
    .get(periodId) as Record<string, unknown> | undefined;
  return row ? this.mapWindowRow(row) : undefined;
}

markWindowSettling(windowId: string): void {
  this.db
    .prepare(
      `UPDATE v2_windows SET settlement_state = 'settling' WHERE id = ? AND settlement_state = 'open'`
    )
    .run(windowId);
}

markWindowSettled(windowId: string, at: string): void {
  this.db
    .prepare(
      `UPDATE v2_windows SET settlement_state = 'settled', settled_at = ? WHERE id = ?`
    )
    .run(at, windowId);
}

findWindowByCode(campId: string, code: string): WindowRecord | undefined {
  const row = this.db
    .prepare(`SELECT * FROM v2_windows WHERE camp_id = ? AND code = ? LIMIT 1`)
    .get(campId, code) as Record<string, unknown> | undefined;
  return row ? this.mapWindowRow(row) : undefined;
}

private mapWindowRow(row: Record<string, unknown>): WindowRecord {
  return {
    id: String(row.id),
    campId: String(row.camp_id),
    code: String(row.code),
    firstPeriodId: row.first_period_id === null ? null : String(row.first_period_id),
    lastPeriodId: row.last_period_id === null ? null : String(row.last_period_id),
    isFinal: Number(row.is_final) === 1,
    settlementState: String(row.settlement_state) as WindowRecord["settlementState"],
    settledAt: row.settled_at === null ? null : String(row.settled_at),
    createdAt: String(row.created_at)
  };
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `npm test -- tests/storage/v2/sqlite-repository-v2.test.ts`
Expected: PASS — three new `windows` tests green.

- [ ] **Step 5: Commit**

```bash
git add src/storage/sqlite-repository.ts tests/storage/v2/sqlite-repository-v2.test.ts
git commit -m "feat(v2): add lazy-window CRUD to SqliteRepository"
```

---

### Task B3: `card_interactions` insert + list

**Files:**
- Modify: `src/storage/sqlite-repository.ts`
- Test: `tests/storage/v2/sqlite-repository-v2.test.ts`

`card_interactions` is the raw audit log of every card-based student interaction. Two methods: append a new interaction, and list all interactions for `(memberId, periodId)` optionally filtered by `cardType`.

- [ ] **Step 1: Write the failing test**

Append:

```typescript
describe("SqliteRepository v2 card_interactions", () => {
  test("insert + list by member/period", () => {
    const repo = new SqliteRepository(":memory:");
    repo.seedDemo();
    const campId = repo.getDefaultCampId()!;
    const memberId = "member-student-01";

    repo.insertPeriod({
      id: `period-${campId}-2`,
      campId,
      number: 2,
      isIceBreaker: false,
      startedAt: "2026-04-11T00:00:00.000Z",
      openedByOpId: null,
      createdAt: "2026-04-11T00:00:00.000Z",
      updatedAt: "2026-04-11T00:00:00.000Z"
    });

    const interactionA = {
      id: randomUUID(),
      memberId,
      periodId: `period-${campId}-2`,
      cardType: "daily_checkin" as const,
      actionName: "submit_k3_summary",
      actionPayload: JSON.stringify({ text: "today I learned ..." }),
      feishuMessageId: "om_msg_001",
      feishuCardVersion: "v1",
      receivedAt: "2026-04-11T08:00:00.000Z"
    };
    const interactionB = {
      id: randomUUID(),
      memberId,
      periodId: `period-${campId}-2`,
      cardType: "quiz" as const,
      actionName: "answer_k2",
      actionPayload: JSON.stringify({ score: 8 }),
      feishuMessageId: "om_msg_002",
      feishuCardVersion: "v1",
      receivedAt: "2026-04-11T09:00:00.000Z"
    };
    repo.insertCardInteraction(interactionA);
    repo.insertCardInteraction(interactionB);

    const all = repo.listCardInteractionsForMember(memberId, `period-${campId}-2`);
    expect(all).toHaveLength(2);

    const onlyQuiz = repo.listCardInteractionsForMember(
      memberId,
      `period-${campId}-2`,
      "quiz"
    );
    expect(onlyQuiz).toHaveLength(1);
    expect(onlyQuiz[0].actionName).toBe("answer_k2");
    expect(onlyQuiz[0].actionPayload).toContain("score");

    repo.close();
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npm test -- tests/storage/v2/sqlite-repository-v2.test.ts`
Expected: FAIL — `repo.insertCardInteraction is not a function`.

- [ ] **Step 3: Write the minimal implementation**

Add the type:

```typescript
export interface CardInteractionRecord {
  id: string;
  memberId: string;
  periodId: string;
  cardType: string;
  actionName: string;
  actionPayload: string | null;
  feishuMessageId: string | null;
  feishuCardVersion: string | null;
  receivedAt: string;
}
```

Add inside `SqliteRepository`:

```typescript
insertCardInteraction(input: {
  id: string;
  memberId: string;
  periodId: string;
  cardType: string;
  actionName: string;
  actionPayload: string | null;
  feishuMessageId: string | null;
  feishuCardVersion: string | null;
  receivedAt: string;
}): void {
  this.db
    .prepare(
      `INSERT INTO v2_card_interactions
        (id, member_id, period_id, card_type, action_name, action_payload,
         feishu_message_id, feishu_card_version, received_at)
       VALUES (@id, @memberId, @periodId, @cardType, @actionName, @actionPayload,
               @feishuMessageId, @feishuCardVersion, @receivedAt)`
    )
    .run(input);
}

listCardInteractionsForMember(
  memberId: string,
  periodId: string,
  cardType?: string
): CardInteractionRecord[] {
  const sql = cardType
    ? `SELECT * FROM v2_card_interactions
       WHERE member_id = ? AND period_id = ? AND card_type = ?
       ORDER BY received_at ASC`
    : `SELECT * FROM v2_card_interactions
       WHERE member_id = ? AND period_id = ?
       ORDER BY received_at ASC`;
  const rows = (cardType
    ? this.db.prepare(sql).all(memberId, periodId, cardType)
    : this.db.prepare(sql).all(memberId, periodId)) as Array<Record<string, unknown>>;
  return rows.map((row) => ({
    id: String(row.id),
    memberId: String(row.member_id),
    periodId: String(row.period_id),
    cardType: String(row.card_type),
    actionName: String(row.action_name),
    actionPayload: row.action_payload === null ? null : String(row.action_payload),
    feishuMessageId: row.feishu_message_id === null ? null : String(row.feishu_message_id),
    feishuCardVersion:
      row.feishu_card_version === null ? null : String(row.feishu_card_version),
    receivedAt: String(row.received_at)
  }));
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `npm test -- tests/storage/v2/sqlite-repository-v2.test.ts`
Expected: PASS — one new `card_interactions` test green.

- [ ] **Step 5: Commit**

```bash
git add src/storage/sqlite-repository.ts tests/storage/v2/sqlite-repository-v2.test.ts
git commit -m "feat(v2): add card_interactions insert and list methods"
```

---

### Task B4: `scoring_item_events` core methods

**Files:**
- Modify: `src/storage/sqlite-repository.ts`
- Test: `tests/storage/v2/sqlite-repository-v2.test.ts`

The truth-source table for all scoring events. Methods required: idempotent insert, lookup by `sourceRef`, approved/pending sum aggregations used by cap clamping, status update (used by `ScoringAggregator.applyDecision`), and list of `review_required` events for the operator queue.

- [ ] **Step 1: Write the failing test**

Append:

```typescript
describe("SqliteRepository v2 scoring_item_events", () => {
  test("insert + findBySourceRef + sums + updateStatus", () => {
    const repo = new SqliteRepository(":memory:");
    repo.seedDemo();
    const campId = repo.getDefaultCampId()!;
    const memberId = "member-student-01";
    const periodId = `period-${campId}-2`;

    repo.insertPeriod({
      id: periodId,
      campId,
      number: 2,
      isIceBreaker: false,
      startedAt: "2026-04-11T00:00:00.000Z",
      openedByOpId: null,
      createdAt: "2026-04-11T00:00:00.000Z",
      updatedAt: "2026-04-11T00:00:00.000Z"
    });

    // approved event (non-LLM path)
    const e1Id = randomUUID();
    repo.insertScoringItemEvent({
      id: e1Id,
      memberId,
      periodId,
      itemCode: "K1",
      dimension: "K",
      scoreDelta: 3,
      sourceType: "card_interaction",
      sourceRef: "card-k1-001",
      status: "approved",
      llmTaskId: null,
      createdAt: "2026-04-11T08:00:00.000Z",
      decidedAt: "2026-04-11T08:00:00.000Z"
    });

    // pending event (LLM-bound)
    const e2Id = randomUUID();
    repo.insertScoringItemEvent({
      id: e2Id,
      memberId,
      periodId,
      itemCode: "K3",
      dimension: "K",
      scoreDelta: 3,
      sourceType: "card_interaction",
      sourceRef: "card-k3-001",
      status: "pending",
      llmTaskId: null,
      createdAt: "2026-04-11T09:00:00.000Z",
      decidedAt: null
    });

    // findEventBySourceRef returns the matching row
    const byRef = repo.findEventBySourceRef(memberId, periodId, "K1", "card-k1-001");
    expect(byRef?.id).toBe(e1Id);
    expect(byRef?.status).toBe("approved");

    // sums
    expect(repo.sumApprovedScoreDelta(memberId, periodId, "K1")).toBe(3);
    expect(repo.sumPendingScoreDelta(memberId, periodId, "K3")).toBe(3);
    expect(repo.sumApprovedScoreDelta(memberId, periodId, "K3")).toBe(0);

    // unique constraint on (memberId, periodId, itemCode, sourceRef)
    expect(() =>
      repo.insertScoringItemEvent({
        id: randomUUID(),
        memberId,
        periodId,
        itemCode: "K1",
        dimension: "K",
        scoreDelta: 3,
        sourceType: "card_interaction",
        sourceRef: "card-k1-001",
        status: "approved",
        llmTaskId: null,
        createdAt: "2026-04-11T10:00:00.000Z",
        decidedAt: "2026-04-11T10:00:00.000Z"
      })
    ).toThrow(/UNIQUE/);

    // updateEventStatus
    repo.updateEventStatus({
      id: e2Id,
      status: "approved",
      decidedAt: "2026-04-11T11:00:00.000Z",
      reviewNote: null,
      reviewedByOpId: null
    });
    expect(repo.sumApprovedScoreDelta(memberId, periodId, "K3")).toBe(3);
    expect(repo.sumPendingScoreDelta(memberId, periodId, "K3")).toBe(0);

    repo.close();
  });

  test("listReviewRequiredEvents returns only review_required rows", () => {
    const repo = new SqliteRepository(":memory:");
    repo.seedDemo();
    const campId = repo.getDefaultCampId()!;
    const memberId = "member-student-01";
    const periodId = `period-${campId}-2`;

    repo.insertPeriod({
      id: periodId,
      campId,
      number: 2,
      isIceBreaker: false,
      startedAt: "2026-04-11T00:00:00.000Z",
      openedByOpId: null,
      createdAt: "2026-04-11T00:00:00.000Z",
      updatedAt: "2026-04-11T00:00:00.000Z"
    });

    repo.insertScoringItemEvent({
      id: randomUUID(),
      memberId,
      periodId,
      itemCode: "K4",
      dimension: "K",
      scoreDelta: 4,
      sourceType: "card_interaction",
      sourceRef: "card-k4-001",
      status: "review_required",
      llmTaskId: null,
      createdAt: "2026-04-11T12:00:00.000Z",
      decidedAt: null
    });
    repo.insertScoringItemEvent({
      id: randomUUID(),
      memberId,
      periodId,
      itemCode: "K4",
      dimension: "K",
      scoreDelta: 4,
      sourceType: "card_interaction",
      sourceRef: "card-k4-002",
      status: "approved",
      llmTaskId: null,
      createdAt: "2026-04-11T12:30:00.000Z",
      decidedAt: "2026-04-11T12:30:00.000Z"
    });

    const queue = repo.listReviewRequiredEvents(campId);
    expect(queue).toHaveLength(1);
    expect(queue[0].sourceRef).toBe("card-k4-001");
    expect(queue[0].status).toBe("review_required");

    repo.close();
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npm test -- tests/storage/v2/sqlite-repository-v2.test.ts`
Expected: FAIL — methods missing.

- [ ] **Step 3: Write the minimal implementation**

Add the type:

```typescript
export type ScoringEventStatus = "pending" | "approved" | "rejected" | "review_required";

export interface ScoringItemEventRecord {
  id: string;
  memberId: string;
  periodId: string;
  itemCode: string;
  dimension: string;
  scoreDelta: number;
  sourceType: string;
  sourceRef: string;
  status: ScoringEventStatus;
  llmTaskId: string | null;
  reviewedByOpId: string | null;
  reviewNote: string | null;
  createdAt: string;
  decidedAt: string | null;
}
```

Add methods:

```typescript
insertScoringItemEvent(input: {
  id: string;
  memberId: string;
  periodId: string;
  itemCode: string;
  dimension: string;
  scoreDelta: number;
  sourceType: string;
  sourceRef: string;
  status: ScoringEventStatus;
  llmTaskId: string | null;
  createdAt: string;
  decidedAt: string | null;
}): void {
  this.db
    .prepare(
      `INSERT INTO v2_scoring_item_events
        (id, member_id, period_id, item_code, dimension, score_delta,
         source_type, source_ref, status, llm_task_id, reviewed_by_op_id,
         review_note, created_at, decided_at)
       VALUES (@id, @memberId, @periodId, @itemCode, @dimension, @scoreDelta,
               @sourceType, @sourceRef, @status, @llmTaskId, NULL, NULL,
               @createdAt, @decidedAt)`
    )
    .run(input);
}

findEventBySourceRef(
  memberId: string,
  periodId: string,
  itemCode: string,
  sourceRef: string
): ScoringItemEventRecord | undefined {
  const row = this.db
    .prepare(
      `SELECT * FROM v2_scoring_item_events
       WHERE member_id = ? AND period_id = ? AND item_code = ? AND source_ref = ?
       LIMIT 1`
    )
    .get(memberId, periodId, itemCode, sourceRef) as
    | Record<string, unknown>
    | undefined;
  return row ? this.mapScoringEventRow(row) : undefined;
}

sumApprovedScoreDelta(memberId: string, periodId: string, itemCode: string): number {
  const row = this.db
    .prepare(
      `SELECT COALESCE(SUM(score_delta), 0) AS total
       FROM v2_scoring_item_events
       WHERE member_id = ? AND period_id = ? AND item_code = ? AND status = 'approved'`
    )
    .get(memberId, periodId, itemCode) as { total: number };
  return Number(row.total);
}

sumPendingScoreDelta(memberId: string, periodId: string, itemCode: string): number {
  const row = this.db
    .prepare(
      `SELECT COALESCE(SUM(score_delta), 0) AS total
       FROM v2_scoring_item_events
       WHERE member_id = ? AND period_id = ? AND item_code = ? AND status = 'pending'`
    )
    .get(memberId, periodId, itemCode) as { total: number };
  return Number(row.total);
}

updateEventStatus(input: {
  id: string;
  status: ScoringEventStatus;
  decidedAt: string;
  reviewNote: string | null;
  reviewedByOpId: string | null;
}): void {
  this.db
    .prepare(
      `UPDATE v2_scoring_item_events
       SET status = @status, decided_at = @decidedAt,
           review_note = @reviewNote, reviewed_by_op_id = @reviewedByOpId
       WHERE id = @id`
    )
    .run(input);
}

listReviewRequiredEvents(campId: string): ScoringItemEventRecord[] {
  const rows = this.db
    .prepare(
      `SELECT e.* FROM v2_scoring_item_events e
       INNER JOIN v2_periods p ON p.id = e.period_id
       WHERE p.camp_id = ? AND e.status = 'review_required'
       ORDER BY e.created_at ASC`
    )
    .all(campId) as Array<Record<string, unknown>>;
  return rows.map((row) => this.mapScoringEventRow(row));
}

private mapScoringEventRow(row: Record<string, unknown>): ScoringItemEventRecord {
  return {
    id: String(row.id),
    memberId: String(row.member_id),
    periodId: String(row.period_id),
    itemCode: String(row.item_code),
    dimension: String(row.dimension),
    scoreDelta: Number(row.score_delta),
    sourceType: String(row.source_type),
    sourceRef: String(row.source_ref),
    status: String(row.status) as ScoringEventStatus,
    llmTaskId: row.llm_task_id === null ? null : String(row.llm_task_id),
    reviewedByOpId: row.reviewed_by_op_id === null ? null : String(row.reviewed_by_op_id),
    reviewNote: row.review_note === null ? null : String(row.review_note),
    createdAt: String(row.created_at),
    decidedAt: row.decided_at === null ? null : String(row.decided_at)
  };
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `npm test -- tests/storage/v2/sqlite-repository-v2.test.ts`
Expected: PASS — two new `scoring_item_events` tests green.

- [ ] **Step 5: Commit**

```bash
git add src/storage/sqlite-repository.ts tests/storage/v2/sqlite-repository-v2.test.ts
git commit -m "feat(v2): add scoring_item_events CRUD and aggregations"
```

---

### Task B5: `member_dimension_scores` increments

**Files:**
- Modify: `src/storage/sqlite-repository.ts`
- Test: `tests/storage/v2/sqlite-repository-v2.test.ts`

The materialised per-dimension totals used by the ranking/window settler. Methods: atomic upsert-increment, decrement (for `approved → rejected` flips), fetch for `(memberId, periodId)`, and cross-period cumulative fetch used by `computeRankContext`.

- [ ] **Step 1: Write the failing test**

Append:

```typescript
describe("SqliteRepository v2 member_dimension_scores", () => {
  test("increment + decrement + fetch", () => {
    const repo = new SqliteRepository(":memory:");
    repo.seedDemo();
    const campId = repo.getDefaultCampId()!;
    const memberId = "member-student-01";
    const periodId = `period-${campId}-2`;

    repo.insertPeriod({
      id: periodId,
      campId,
      number: 2,
      isIceBreaker: false,
      startedAt: "2026-04-11T00:00:00.000Z",
      openedByOpId: null,
      createdAt: "2026-04-11T00:00:00.000Z",
      updatedAt: "2026-04-11T00:00:00.000Z"
    });

    // empty → fetch returns empty
    expect(repo.fetchMemberDimensionScores(memberId, periodId)).toEqual({});

    repo.incrementMemberDimensionScore({
      memberId,
      periodId,
      dimension: "K",
      delta: 3,
      eventAt: "2026-04-11T08:00:00.000Z"
    });
    repo.incrementMemberDimensionScore({
      memberId,
      periodId,
      dimension: "K",
      delta: 4,
      eventAt: "2026-04-11T09:00:00.000Z"
    });
    repo.incrementMemberDimensionScore({
      memberId,
      periodId,
      dimension: "H",
      delta: 5,
      eventAt: "2026-04-11T10:00:00.000Z"
    });

    const scores = repo.fetchMemberDimensionScores(memberId, periodId);
    expect(scores.K).toBe(7);
    expect(scores.H).toBe(5);
    expect(scores.C).toBeUndefined();

    // decrement
    repo.decrementMemberDimensionScore({
      memberId,
      periodId,
      dimension: "K",
      delta: 3,
      eventAt: "2026-04-11T11:00:00.000Z"
    });
    expect(repo.fetchMemberDimensionScores(memberId, periodId).K).toBe(4);

    repo.close();
  });

  test("fetchDimensionCumulativeForRanking aggregates across periods", () => {
    const repo = new SqliteRepository(":memory:");
    repo.seedDemo();
    const campId = repo.getDefaultCampId()!;

    const p2 = `period-${campId}-2`;
    const p3 = `period-${campId}-3`;
    for (const [pid, num] of [[p2, 2], [p3, 3]] as Array<[string, number]>) {
      repo.insertPeriod({
        id: pid,
        campId,
        number: num,
        isIceBreaker: false,
        startedAt: `2026-04-1${num}T00:00:00.000Z`,
        openedByOpId: null,
        createdAt: `2026-04-1${num}T00:00:00.000Z`,
        updatedAt: `2026-04-1${num}T00:00:00.000Z`
      });
    }

    const alice = "member-student-01";
    const bob = "member-student-02";
    for (const m of [alice, bob]) {
      repo.incrementMemberDimensionScore({
        memberId: m,
        periodId: p2,
        dimension: "K",
        delta: 5,
        eventAt: "2026-04-12T00:00:00.000Z"
      });
    }
    repo.incrementMemberDimensionScore({
      memberId: alice,
      periodId: p3,
      dimension: "K",
      delta: 7,
      eventAt: "2026-04-13T00:00:00.000Z"
    });

    const ranking = repo.fetchDimensionCumulativeForRanking(campId, "K", [alice, bob]);
    // Alice: 5 + 7 = 12, Bob: 5
    expect(ranking).toEqual([
      { memberId: alice, cumulativeScore: 12 },
      { memberId: bob, cumulativeScore: 5 }
    ]);

    repo.close();
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npm test -- tests/storage/v2/sqlite-repository-v2.test.ts`
Expected: FAIL — methods missing.

- [ ] **Step 3: Write the minimal implementation**

```typescript
incrementMemberDimensionScore(input: {
  memberId: string;
  periodId: string;
  dimension: string;
  delta: number;
  eventAt: string;
}): void {
  this.db
    .prepare(
      `INSERT INTO v2_member_dimension_scores
        (member_id, period_id, dimension, period_score, event_count, last_event_at)
       VALUES (@memberId, @periodId, @dimension, @delta, 1, @eventAt)
       ON CONFLICT(member_id, period_id, dimension) DO UPDATE SET
         period_score = period_score + @delta,
         event_count = event_count + 1,
         last_event_at = @eventAt`
    )
    .run(input);
}

decrementMemberDimensionScore(input: {
  memberId: string;
  periodId: string;
  dimension: string;
  delta: number;
  eventAt: string;
}): void {
  this.db
    .prepare(
      `INSERT INTO v2_member_dimension_scores
        (member_id, period_id, dimension, period_score, event_count, last_event_at)
       VALUES (@memberId, @periodId, @dimension, -@delta, 0, @eventAt)
       ON CONFLICT(member_id, period_id, dimension) DO UPDATE SET
         period_score = period_score - @delta,
         event_count = MAX(event_count - 1, 0),
         last_event_at = @eventAt`
    )
    .run(input);
}

fetchMemberDimensionScores(
  memberId: string,
  periodId: string
): Record<string, number> {
  const rows = this.db
    .prepare(
      `SELECT dimension, period_score FROM v2_member_dimension_scores
       WHERE member_id = ? AND period_id = ?`
    )
    .all(memberId, periodId) as Array<{ dimension: string; period_score: number }>;
  const result: Record<string, number> = {};
  for (const row of rows) {
    result[row.dimension] = Number(row.period_score);
  }
  return result;
}

fetchDimensionCumulativeForRanking(
  campId: string,
  dimension: string,
  memberIds: string[]
): Array<{ memberId: string; cumulativeScore: number }> {
  if (memberIds.length === 0) {
    return [];
  }
  const placeholders = memberIds.map(() => "?").join(",");
  const rows = this.db
    .prepare(
      `SELECT ds.member_id AS member_id, COALESCE(SUM(ds.period_score), 0) AS total
       FROM v2_member_dimension_scores ds
       INNER JOIN v2_periods p ON p.id = ds.period_id
       WHERE p.camp_id = ? AND ds.dimension = ?
         AND ds.member_id IN (${placeholders})
       GROUP BY ds.member_id
       ORDER BY total DESC, ds.member_id ASC`
    )
    .all(campId, dimension, ...memberIds) as Array<{
    member_id: string;
    total: number;
  }>;

  // Include zeroed members explicitly so ranking stays stable.
  const byMember = new Map<string, number>();
  for (const row of rows) {
    byMember.set(String(row.member_id), Number(row.total));
  }
  const result: Array<{ memberId: string; cumulativeScore: number }> = memberIds.map(
    (mid) => ({
      memberId: mid,
      cumulativeScore: byMember.get(mid) ?? 0
    })
  );
  result.sort((a, b) => {
    if (b.cumulativeScore !== a.cumulativeScore) {
      return b.cumulativeScore - a.cumulativeScore;
    }
    return a.memberId < b.memberId ? -1 : a.memberId > b.memberId ? 1 : 0;
  });
  return result;
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `npm test -- tests/storage/v2/sqlite-repository-v2.test.ts`
Expected: PASS — two new `member_dimension_scores` tests green.

- [ ] **Step 5: Commit**

```bash
git add src/storage/sqlite-repository.ts tests/storage/v2/sqlite-repository-v2.test.ts
git commit -m "feat(v2): add member_dimension_scores upsert-increment and ranking"
```

---

### Task B6: `window_snapshots` writes + lookups

**Files:**
- Modify: `src/storage/sqlite-repository.ts`
- Test: `tests/storage/v2/sqlite-repository-v2.test.ts`

Snapshots are the immutable output of `WindowSettler`. Methods: insert a snapshot, find the latest snapshot for a member strictly before a given window (used to compute `prevAq` / `prevCumulativeAq` / `consecMissedOnEntry`), and find a specific snapshot by `(windowId, memberId)`.

- [ ] **Step 1: Write the failing test**

Append:

```typescript
describe("SqliteRepository v2 window_snapshots", () => {
  test("insert + findSnapshotForWindow + findLatestSnapshotBefore", () => {
    const repo = new SqliteRepository(":memory:");
    repo.seedDemo();
    const campId = repo.getDefaultCampId()!;
    const memberId = "member-student-01";

    // seed two windows
    repo.insertWindowShell({
      code: "W1",
      campId,
      isFinal: false,
      createdAt: "2026-04-10T00:00:00.000Z"
    });
    repo.insertWindowShell({
      code: "W2",
      campId,
      isFinal: false,
      createdAt: "2026-04-10T00:00:00.000Z"
    });
    const w1 = repo.findWindowByCode(campId, "W1")!;
    const w2 = repo.findWindowByCode(campId, "W2")!;

    // insert snapshot for W1
    repo.insertWindowSnapshot({
      id: randomUUID(),
      windowId: w1.id,
      memberId,
      windowAq: 35,
      cumulativeAq: 35,
      kScore: 10,
      hScore: 8,
      cScore: 7,
      sScore: 4,
      gScore: 6,
      growthBonus: 0,
      consecMissedOnEntry: 0,
      snapshotAt: "2026-04-15T00:00:00.000Z"
    });

    const w1Snap = repo.findSnapshotForWindow(w1.id, memberId);
    expect(w1Snap?.windowAq).toBe(35);
    expect(w1Snap?.cumulativeAq).toBe(35);

    // before W2 → returns W1
    const before = repo.findLatestSnapshotBefore(memberId, w2.id);
    expect(before?.windowId).toBe(w1.id);

    // before W1 → returns undefined
    expect(repo.findLatestSnapshotBefore(memberId, w1.id)).toBeUndefined();

    // insert snapshot for W2
    repo.insertWindowSnapshot({
      id: randomUUID(),
      windowId: w2.id,
      memberId,
      windowAq: 40,
      cumulativeAq: 75,
      kScore: 12,
      hScore: 9,
      cScore: 8,
      sScore: 5,
      gScore: 6,
      growthBonus: 3,
      consecMissedOnEntry: 0,
      snapshotAt: "2026-04-25T00:00:00.000Z"
    });

    // UNIQUE(window_id, member_id)
    expect(() =>
      repo.insertWindowSnapshot({
        id: randomUUID(),
        windowId: w2.id,
        memberId,
        windowAq: 99,
        cumulativeAq: 99,
        kScore: 0,
        hScore: 0,
        cScore: 0,
        sScore: 0,
        gScore: 0,
        growthBonus: 0,
        consecMissedOnEntry: 0,
        snapshotAt: "2026-04-26T00:00:00.000Z"
      })
    ).toThrow(/UNIQUE/);

    repo.close();
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npm test -- tests/storage/v2/sqlite-repository-v2.test.ts`
Expected: FAIL — methods missing.

- [ ] **Step 3: Write the minimal implementation**

Add the type:

```typescript
export interface WindowSnapshotRecord {
  id: string;
  windowId: string;
  memberId: string;
  windowAq: number;
  cumulativeAq: number;
  kScore: number;
  hScore: number;
  cScore: number;
  sScore: number;
  gScore: number;
  growthBonus: number;
  consecMissedOnEntry: number;
  snapshotAt: string;
}
```

Add methods:

```typescript
insertWindowSnapshot(input: WindowSnapshotRecord): void {
  this.db
    .prepare(
      `INSERT INTO v2_window_snapshots
        (id, window_id, member_id, window_aq, cumulative_aq, k_score, h_score,
         c_score, s_score, g_score, growth_bonus, consec_missed_on_entry, snapshot_at)
       VALUES (@id, @windowId, @memberId, @windowAq, @cumulativeAq, @kScore, @hScore,
               @cScore, @sScore, @gScore, @growthBonus, @consecMissedOnEntry, @snapshotAt)`
    )
    .run(input);
}

findSnapshotForWindow(
  windowId: string,
  memberId: string
): WindowSnapshotRecord | undefined {
  const row = this.db
    .prepare(
      `SELECT * FROM v2_window_snapshots
       WHERE window_id = ? AND member_id = ? LIMIT 1`
    )
    .get(windowId, memberId) as Record<string, unknown> | undefined;
  return row ? this.mapSnapshotRow(row) : undefined;
}

findLatestSnapshotBefore(
  memberId: string,
  windowId: string
): WindowSnapshotRecord | undefined {
  const row = this.db
    .prepare(
      `SELECT s.* FROM v2_window_snapshots s
       INNER JOIN v2_windows w ON w.id = s.window_id
       WHERE s.member_id = ?
         AND s.window_id != ?
         AND w.code < (SELECT code FROM v2_windows WHERE id = ?)
       ORDER BY w.code DESC LIMIT 1`
    )
    .get(memberId, windowId, windowId) as Record<string, unknown> | undefined;
  return row ? this.mapSnapshotRow(row) : undefined;
}

private mapSnapshotRow(row: Record<string, unknown>): WindowSnapshotRecord {
  return {
    id: String(row.id),
    windowId: String(row.window_id),
    memberId: String(row.member_id),
    windowAq: Number(row.window_aq),
    cumulativeAq: Number(row.cumulative_aq),
    kScore: Number(row.k_score),
    hScore: Number(row.h_score),
    cScore: Number(row.c_score),
    sScore: Number(row.s_score),
    gScore: Number(row.g_score),
    growthBonus: Number(row.growth_bonus),
    consecMissedOnEntry: Number(row.consec_missed_on_entry),
    snapshotAt: String(row.snapshot_at)
  };
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `npm test -- tests/storage/v2/sqlite-repository-v2.test.ts`
Expected: PASS — one new `window_snapshots` test green.

- [ ] **Step 5: Commit**

```bash
git add src/storage/sqlite-repository.ts tests/storage/v2/sqlite-repository-v2.test.ts
git commit -m "feat(v2): add window_snapshots insert and lookup methods"
```

---

### Task B7: `member_levels` get + upsert

**Files:**
- Modify: `src/storage/sqlite-repository.ts`
- Test: `tests/storage/v2/sqlite-repository-v2.test.ts`

Persists the current rank of each member. `getMemberLevel` returns level `1` for members without a row (fresh-joined student default), and `upsertMemberLevel` atomically writes a new level after a promotion.

- [ ] **Step 1: Write the failing test**

Append:

```typescript
describe("SqliteRepository v2 member_levels", () => {
  test("getMemberLevel defaults to 1 when no row exists", () => {
    const repo = new SqliteRepository(":memory:");
    repo.seedDemo();

    const level = repo.getMemberLevel("member-student-01");
    expect(level.currentLevel).toBe(1);
    expect(level.lastWindowId).toBeNull();

    repo.close();
  });

  test("upsertMemberLevel writes then reads back", () => {
    const repo = new SqliteRepository(":memory:");
    repo.seedDemo();
    const campId = repo.getDefaultCampId()!;

    repo.insertWindowShell({
      code: "W1",
      campId,
      isFinal: false,
      createdAt: "2026-04-10T00:00:00.000Z"
    });
    const w1 = repo.findWindowByCode(campId, "W1")!;

    repo.upsertMemberLevel({
      memberId: "member-student-01",
      currentLevel: 2,
      levelAttainedAt: "2026-04-20T00:00:00.000Z",
      lastWindowId: w1.id,
      updatedAt: "2026-04-20T00:00:00.000Z"
    });

    const level = repo.getMemberLevel("member-student-01");
    expect(level.currentLevel).toBe(2);
    expect(level.lastWindowId).toBe(w1.id);
    expect(level.levelAttainedAt).toBe("2026-04-20T00:00:00.000Z");

    // upsert again (promotion to Lv3)
    repo.upsertMemberLevel({
      memberId: "member-student-01",
      currentLevel: 3,
      levelAttainedAt: "2026-04-30T00:00:00.000Z",
      lastWindowId: w1.id,
      updatedAt: "2026-04-30T00:00:00.000Z"
    });
    expect(repo.getMemberLevel("member-student-01").currentLevel).toBe(3);

    repo.close();
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npm test -- tests/storage/v2/sqlite-repository-v2.test.ts`
Expected: FAIL — methods missing.

- [ ] **Step 3: Write the minimal implementation**

Add the type:

```typescript
export interface MemberLevelRecord {
  memberId: string;
  currentLevel: number;
  levelAttainedAt: string | null;
  lastWindowId: string | null;
  updatedAt: string | null;
}
```

Add methods:

```typescript
getMemberLevel(memberId: string): MemberLevelRecord {
  const row = this.db
    .prepare(`SELECT * FROM v2_member_levels WHERE member_id = ?`)
    .get(memberId) as Record<string, unknown> | undefined;

  if (!row) {
    return {
      memberId,
      currentLevel: 1,
      levelAttainedAt: null,
      lastWindowId: null,
      updatedAt: null
    };
  }

  return {
    memberId: String(row.member_id),
    currentLevel: Number(row.current_level),
    levelAttainedAt: row.level_attained_at === null ? null : String(row.level_attained_at),
    lastWindowId: row.last_window_id === null ? null : String(row.last_window_id),
    updatedAt: row.updated_at === null ? null : String(row.updated_at)
  };
}

upsertMemberLevel(input: {
  memberId: string;
  currentLevel: number;
  levelAttainedAt: string;
  lastWindowId: string | null;
  updatedAt: string;
}): void {
  this.db
    .prepare(
      `INSERT INTO v2_member_levels
        (member_id, current_level, level_attained_at, last_window_id, updated_at)
       VALUES (@memberId, @currentLevel, @levelAttainedAt, @lastWindowId, @updatedAt)
       ON CONFLICT(member_id) DO UPDATE SET
         current_level = @currentLevel,
         level_attained_at = @levelAttainedAt,
         last_window_id = @lastWindowId,
         updated_at = @updatedAt`
    )
    .run(input);
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `npm test -- tests/storage/v2/sqlite-repository-v2.test.ts`
Expected: PASS — two new `member_levels` tests green.

- [ ] **Step 5: Commit**

```bash
git add src/storage/sqlite-repository.ts tests/storage/v2/sqlite-repository-v2.test.ts
git commit -m "feat(v2): add member_levels get-with-default and upsert"
```

---

### Task B8: `promotion_records` insert + lookups

**Files:**
- Modify: `src/storage/sqlite-repository.ts`
- Test: `tests/storage/v2/sqlite-repository-v2.test.ts`

History of `LevelPromotionJudge` decisions. Methods: insert one record (idempotent per `(windowId, memberId)`), find the record for a specific window (used by the next window's judge to check `consecMissed`), and list all records for a member across the camp lifetime.

- [ ] **Step 1: Write the failing test**

Append:

```typescript
describe("SqliteRepository v2 promotion_records", () => {
  test("insert + findPromotionForWindow + listPromotionsForMember", () => {
    const repo = new SqliteRepository(":memory:");
    repo.seedDemo();
    const campId = repo.getDefaultCampId()!;
    const memberId = "member-student-01";

    repo.insertWindowShell({
      code: "W1",
      campId,
      isFinal: false,
      createdAt: "2026-04-10T00:00:00.000Z"
    });
    repo.insertWindowShell({
      code: "W2",
      campId,
      isFinal: false,
      createdAt: "2026-04-10T00:00:00.000Z"
    });
    const w1 = repo.findWindowByCode(campId, "W1")!;
    const w2 = repo.findWindowByCode(campId, "W2")!;

    repo.insertPromotionRecord({
      id: randomUUID(),
      windowId: w1.id,
      memberId,
      evaluatedAt: "2026-04-20T00:00:00.000Z",
      fromLevel: 1,
      toLevel: 2,
      promoted: true,
      pathTaken: "primary",
      reason: JSON.stringify({ conditionChecks: [] })
    });

    const r1 = repo.findPromotionForWindow(w1.id, memberId);
    expect(r1?.promoted).toBe(true);
    expect(r1?.toLevel).toBe(2);
    expect(r1?.pathTaken).toBe("primary");

    // no record for W2 yet
    expect(repo.findPromotionForWindow(w2.id, memberId)).toBeUndefined();

    // insert second record (not promoted)
    repo.insertPromotionRecord({
      id: randomUUID(),
      windowId: w2.id,
      memberId,
      evaluatedAt: "2026-04-30T00:00:00.000Z",
      fromLevel: 2,
      toLevel: 2,
      promoted: false,
      pathTaken: "none",
      reason: JSON.stringify({ conditionChecks: [] })
    });

    const all = repo.listPromotionsForMember(memberId);
    expect(all).toHaveLength(2);
    expect(all[0].windowId).toBe(w1.id);
    expect(all[1].windowId).toBe(w2.id);

    // UNIQUE(window_id, member_id)
    expect(() =>
      repo.insertPromotionRecord({
        id: randomUUID(),
        windowId: w1.id,
        memberId,
        evaluatedAt: "2026-04-21T00:00:00.000Z",
        fromLevel: 1,
        toLevel: 1,
        promoted: false,
        pathTaken: "none",
        reason: "{}"
      })
    ).toThrow(/UNIQUE/);

    repo.close();
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npm test -- tests/storage/v2/sqlite-repository-v2.test.ts`
Expected: FAIL — methods missing.

- [ ] **Step 3: Write the minimal implementation**

Add the type:

```typescript
export interface PromotionRecord {
  id: string;
  windowId: string;
  memberId: string;
  evaluatedAt: string;
  fromLevel: number;
  toLevel: number;
  promoted: boolean;
  pathTaken: string;
  reason: string;
}
```

Add methods:

```typescript
insertPromotionRecord(input: PromotionRecord): void {
  this.db
    .prepare(
      `INSERT INTO v2_promotion_records
        (id, window_id, member_id, evaluated_at, from_level, to_level,
         promoted, path_taken, reason)
       VALUES (@id, @windowId, @memberId, @evaluatedAt, @fromLevel, @toLevel,
               @promoted, @pathTaken, @reason)`
    )
    .run({
      ...input,
      promoted: input.promoted ? 1 : 0
    });
}

findPromotionForWindow(
  windowId: string,
  memberId: string
): PromotionRecord | undefined {
  const row = this.db
    .prepare(
      `SELECT * FROM v2_promotion_records WHERE window_id = ? AND member_id = ? LIMIT 1`
    )
    .get(windowId, memberId) as Record<string, unknown> | undefined;
  return row ? this.mapPromotionRow(row) : undefined;
}

listPromotionsForMember(memberId: string): PromotionRecord[] {
  const rows = this.db
    .prepare(
      `SELECT p.* FROM v2_promotion_records p
       INNER JOIN v2_windows w ON w.id = p.window_id
       WHERE p.member_id = ?
       ORDER BY w.code ASC, p.evaluated_at ASC`
    )
    .all(memberId) as Array<Record<string, unknown>>;
  return rows.map((row) => this.mapPromotionRow(row));
}

private mapPromotionRow(row: Record<string, unknown>): PromotionRecord {
  return {
    id: String(row.id),
    windowId: String(row.window_id),
    memberId: String(row.member_id),
    evaluatedAt: String(row.evaluated_at),
    fromLevel: Number(row.from_level),
    toLevel: Number(row.to_level),
    promoted: Number(row.promoted) === 1,
    pathTaken: String(row.path_taken),
    reason: String(row.reason)
  };
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `npm test -- tests/storage/v2/sqlite-repository-v2.test.ts`
Expected: PASS — one new `promotion_records` test green.

- [ ] **Step 5: Commit**

```bash
git add src/storage/sqlite-repository.ts tests/storage/v2/sqlite-repository-v2.test.ts
git commit -m "feat(v2): add promotion_records insert and lookup methods"
```

---

### Task B9: `llm_scoring_tasks` queue operations

**Files:**
- Modify: `src/storage/sqlite-repository.ts`
- Test: `tests/storage/v2/sqlite-repository-v2.test.ts`

Worker queue primitives for `LlmScoringWorker`. The claim path is critical: it must atomically transition one pending task to `running`, using `BEGIN IMMEDIATE` to serialize competing workers. Retry backoff is implemented by re-setting `status='pending'` and bumping `enqueued_at` so the FIFO index picks it up later. `requeueStaleRunningTasks` recovers from a worker crash by returning stuck `running` tasks to `pending`.

- [ ] **Step 1: Write the failing test**

Append:

```typescript
describe("SqliteRepository v2 llm_scoring_tasks", () => {
  test("insert + claimNextPending + markTaskSucceeded", () => {
    const repo = new SqliteRepository(":memory:");
    repo.seedDemo();
    const campId = repo.getDefaultCampId()!;

    repo.insertPeriod({
      id: `period-${campId}-2`,
      campId,
      number: 2,
      isIceBreaker: false,
      startedAt: "2026-04-11T00:00:00.000Z",
      openedByOpId: null,
      createdAt: "2026-04-11T00:00:00.000Z",
      updatedAt: "2026-04-11T00:00:00.000Z"
    });

    const eventId = randomUUID();
    repo.insertScoringItemEvent({
      id: eventId,
      memberId: "member-student-01",
      periodId: `period-${campId}-2`,
      itemCode: "K3",
      dimension: "K",
      scoreDelta: 3,
      sourceType: "card_interaction",
      sourceRef: "card-k3-001",
      status: "pending",
      llmTaskId: null,
      createdAt: "2026-04-11T08:00:00.000Z",
      decidedAt: null
    });

    const taskId = repo.insertLlmTask({
      id: randomUUID(),
      eventId,
      provider: "glm",
      model: "glm-4-plus",
      promptText: "evaluate K3 submission ...",
      enqueuedAt: "2026-04-11T08:00:01.000Z",
      maxAttempts: 3
    });
    expect(taskId).toBeTruthy();

    const claimed = repo.claimNextPendingTask("2026-04-11T08:05:00.000Z");
    expect(claimed?.id).toBe(taskId);
    expect(claimed?.status).toBe("running");
    expect(claimed?.attempts).toBe(1);
    expect(claimed?.startedAt).toBe("2026-04-11T08:05:00.000Z");

    // claiming again returns undefined
    expect(repo.claimNextPendingTask("2026-04-11T08:05:10.000Z")).toBeUndefined();

    repo.markTaskSucceeded(taskId, {
      resultJson: JSON.stringify({ decision: "approved" }),
      finishedAt: "2026-04-11T08:05:20.000Z"
    });
    // after success, still no pending task
    expect(repo.claimNextPendingTask("2026-04-11T08:06:00.000Z")).toBeUndefined();

    repo.close();
  });

  test("markTaskFailedRetry re-queues under max_attempts", () => {
    const repo = new SqliteRepository(":memory:");
    repo.seedDemo();
    const campId = repo.getDefaultCampId()!;

    repo.insertPeriod({
      id: `period-${campId}-2`,
      campId,
      number: 2,
      isIceBreaker: false,
      startedAt: "2026-04-11T00:00:00.000Z",
      openedByOpId: null,
      createdAt: "2026-04-11T00:00:00.000Z",
      updatedAt: "2026-04-11T00:00:00.000Z"
    });

    const eventId = randomUUID();
    repo.insertScoringItemEvent({
      id: eventId,
      memberId: "member-student-01",
      periodId: `period-${campId}-2`,
      itemCode: "K3",
      dimension: "K",
      scoreDelta: 3,
      sourceType: "card_interaction",
      sourceRef: "card-k3-retry",
      status: "pending",
      llmTaskId: null,
      createdAt: "2026-04-11T08:00:00.000Z",
      decidedAt: null
    });

    const taskId = repo.insertLlmTask({
      id: randomUUID(),
      eventId,
      provider: "glm",
      model: "glm-4-plus",
      promptText: "...",
      enqueuedAt: "2026-04-11T08:00:00.000Z",
      maxAttempts: 3
    });

    repo.claimNextPendingTask("2026-04-11T08:01:00.000Z");
    repo.markTaskFailedRetry(taskId, "timeout", 30);

    // reclaim after backoff window
    const reclaimed = repo.claimNextPendingTask("2026-04-11T08:02:00.000Z");
    expect(reclaimed?.id).toBe(taskId);
    expect(reclaimed?.attempts).toBe(2);

    repo.close();
  });

  test("markTaskFailedTerminal leaves task in failed state", () => {
    const repo = new SqliteRepository(":memory:");
    repo.seedDemo();
    const campId = repo.getDefaultCampId()!;

    repo.insertPeriod({
      id: `period-${campId}-2`,
      campId,
      number: 2,
      isIceBreaker: false,
      startedAt: "2026-04-11T00:00:00.000Z",
      openedByOpId: null,
      createdAt: "2026-04-11T00:00:00.000Z",
      updatedAt: "2026-04-11T00:00:00.000Z"
    });

    const eventId = randomUUID();
    repo.insertScoringItemEvent({
      id: eventId,
      memberId: "member-student-01",
      periodId: `period-${campId}-2`,
      itemCode: "K3",
      dimension: "K",
      scoreDelta: 3,
      sourceType: "card_interaction",
      sourceRef: "card-k3-terminal",
      status: "pending",
      llmTaskId: null,
      createdAt: "2026-04-11T08:00:00.000Z",
      decidedAt: null
    });

    const taskId = repo.insertLlmTask({
      id: randomUUID(),
      eventId,
      provider: "glm",
      model: "glm-4-plus",
      promptText: "...",
      enqueuedAt: "2026-04-11T08:00:00.000Z",
      maxAttempts: 1
    });
    repo.claimNextPendingTask("2026-04-11T08:01:00.000Z");
    repo.markTaskFailedTerminal(taskId, "invalid_json", "2026-04-11T08:01:10.000Z");

    // never picked up again
    expect(repo.claimNextPendingTask("2026-04-11T08:10:00.000Z")).toBeUndefined();
    repo.close();
  });

  test("requeueStaleRunningTasks recovers crashed workers", () => {
    const repo = new SqliteRepository(":memory:");
    repo.seedDemo();
    const campId = repo.getDefaultCampId()!;

    repo.insertPeriod({
      id: `period-${campId}-2`,
      campId,
      number: 2,
      isIceBreaker: false,
      startedAt: "2026-04-11T00:00:00.000Z",
      openedByOpId: null,
      createdAt: "2026-04-11T00:00:00.000Z",
      updatedAt: "2026-04-11T00:00:00.000Z"
    });

    const eventId = randomUUID();
    repo.insertScoringItemEvent({
      id: eventId,
      memberId: "member-student-01",
      periodId: `period-${campId}-2`,
      itemCode: "K3",
      dimension: "K",
      scoreDelta: 3,
      sourceType: "card_interaction",
      sourceRef: "card-k3-stale",
      status: "pending",
      llmTaskId: null,
      createdAt: "2026-04-11T08:00:00.000Z",
      decidedAt: null
    });

    const taskId = repo.insertLlmTask({
      id: randomUUID(),
      eventId,
      provider: "glm",
      model: "glm-4-plus",
      promptText: "...",
      enqueuedAt: "2026-04-11T08:00:00.000Z",
      maxAttempts: 3
    });
    // claim and then simulate crash: started_at way in the past
    repo.claimNextPendingTask("2026-04-11T08:01:00.000Z");
    repo.db
      .prepare(`UPDATE v2_llm_scoring_tasks SET started_at = ? WHERE id = ?`)
      .run("2026-04-11T07:00:00.000Z", taskId);

    const requeued = repo.requeueStaleRunningTasks(60 * 60 * 1000); // 1h
    expect(requeued).toBe(1);

    const next = repo.claimNextPendingTask("2026-04-11T09:00:00.000Z");
    expect(next?.id).toBe(taskId);

    repo.close();
  });
});
```

Note: one test pokes `repo.db` directly to simulate a crash — widen the `db` property visibility to `public readonly` or add a test-only accessor. The plan uses the same private-cast trick as Task A2:

```typescript
// in the stale-workers test
const internal = repo as unknown as { db: Database.Database };
internal.db
  .prepare(`UPDATE v2_llm_scoring_tasks SET started_at = ? WHERE id = ?`)
  .run("2026-04-11T07:00:00.000Z", taskId);
```

Use this cast in place of the `repo.db.prepare(...)` call shown above when writing the test so the type-check stays clean.

- [ ] **Step 2: Run the test and verify it fails**

Run: `npm test -- tests/storage/v2/sqlite-repository-v2.test.ts`
Expected: FAIL — methods missing.

- [ ] **Step 3: Write the minimal implementation**

Add the type:

```typescript
export type LlmTaskStatus = "pending" | "running" | "succeeded" | "failed";

export interface LlmScoringTaskRecord {
  id: string;
  eventId: string;
  provider: string;
  model: string;
  promptText: string;
  status: LlmTaskStatus;
  attempts: number;
  maxAttempts: number;
  resultJson: string | null;
  errorReason: string | null;
  enqueuedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}
```

Add methods:

```typescript
insertLlmTask(input: {
  id: string;
  eventId: string;
  provider: string;
  model: string;
  promptText: string;
  enqueuedAt: string;
  maxAttempts: number;
}): string {
  this.db
    .prepare(
      `INSERT INTO v2_llm_scoring_tasks
        (id, event_id, provider, model, prompt_text, status, attempts,
         max_attempts, result_json, error_reason, enqueued_at, started_at, finished_at)
       VALUES (@id, @eventId, @provider, @model, @promptText, 'pending', 0,
               @maxAttempts, NULL, NULL, @enqueuedAt, NULL, NULL)`
    )
    .run(input);
  return input.id;
}

claimNextPendingTask(now: string): LlmScoringTaskRecord | undefined {
  const runner = this.db.transaction((clock: string): LlmScoringTaskRecord | undefined => {
    const row = this.db
      .prepare(
        `SELECT * FROM v2_llm_scoring_tasks
         WHERE status = 'pending' AND enqueued_at <= ?
         ORDER BY enqueued_at ASC LIMIT 1`
      )
      .get(clock) as Record<string, unknown> | undefined;

    if (!row) {
      return undefined;
    }

    const id = String(row.id);
    this.db
      .prepare(
        `UPDATE v2_llm_scoring_tasks
         SET status = 'running', started_at = ?, attempts = attempts + 1
         WHERE id = ? AND status = 'pending'`
      )
      .run(clock, id);

    const updated = this.db
      .prepare(`SELECT * FROM v2_llm_scoring_tasks WHERE id = ?`)
      .get(id) as Record<string, unknown>;
    return this.mapLlmTaskRow(updated);
  });

  // better-sqlite3 runs transactions synchronously; `immediate` prevents other
  // writers from sneaking in between SELECT and UPDATE.
  runner.immediate(now);
  // The transaction fn returns its value via closure; we re-run the read-only
  // statement after the tx completes so the caller always sees the final row.
  const latest = this.db
    .prepare(
      `SELECT * FROM v2_llm_scoring_tasks
       WHERE status = 'running' AND started_at = ?
       ORDER BY attempts DESC LIMIT 1`
    )
    .get(now) as Record<string, unknown> | undefined;
  return latest ? this.mapLlmTaskRow(latest) : undefined;
}

markTaskSucceeded(
  taskId: string,
  input: { resultJson: string; finishedAt: string }
): void {
  this.db
    .prepare(
      `UPDATE v2_llm_scoring_tasks
       SET status = 'succeeded', result_json = ?, finished_at = ?
       WHERE id = ?`
    )
    .run(input.resultJson, input.finishedAt, taskId);
}

markTaskFailedRetry(
  taskId: string,
  errorReason: string,
  backoffSeconds: number
): void {
  const row = this.db
    .prepare(`SELECT attempts, max_attempts FROM v2_llm_scoring_tasks WHERE id = ?`)
    .get(taskId) as { attempts: number; max_attempts: number } | undefined;
  if (!row) {
    return;
  }
  if (row.attempts >= row.max_attempts) {
    this.markTaskFailedTerminal(taskId, errorReason, new Date().toISOString());
    return;
  }
  const nextEnqueue = new Date(Date.now() + backoffSeconds * 1000).toISOString();
  this.db
    .prepare(
      `UPDATE v2_llm_scoring_tasks
       SET status = 'pending', error_reason = ?, enqueued_at = ?, started_at = NULL
       WHERE id = ?`
    )
    .run(errorReason, nextEnqueue, taskId);
}

markTaskFailedTerminal(taskId: string, errorReason: string, at: string): void {
  this.db
    .prepare(
      `UPDATE v2_llm_scoring_tasks
       SET status = 'failed', error_reason = ?, finished_at = ?
       WHERE id = ?`
    )
    .run(errorReason, at, taskId);
}

requeueStaleRunningTasks(timeoutMs: number): number {
  const cutoff = new Date(Date.now() - timeoutMs).toISOString();
  const result = this.db
    .prepare(
      `UPDATE v2_llm_scoring_tasks
       SET status = 'pending', started_at = NULL,
           error_reason = COALESCE(error_reason, 'crash_recovered')
       WHERE status = 'running' AND started_at IS NOT NULL AND started_at < ?`
    )
    .run(cutoff);
  return Number(result.changes ?? 0);
}

private mapLlmTaskRow(row: Record<string, unknown>): LlmScoringTaskRecord {
  return {
    id: String(row.id),
    eventId: String(row.event_id),
    provider: String(row.provider),
    model: String(row.model),
    promptText: String(row.prompt_text),
    status: String(row.status) as LlmTaskStatus,
    attempts: Number(row.attempts),
    maxAttempts: Number(row.max_attempts),
    resultJson: row.result_json === null ? null : String(row.result_json),
    errorReason: row.error_reason === null ? null : String(row.error_reason),
    enqueuedAt: String(row.enqueued_at),
    startedAt: row.started_at === null ? null : String(row.started_at),
    finishedAt: row.finished_at === null ? null : String(row.finished_at)
  };
}
```

Note: `better-sqlite3` exposes `.immediate()` on the function returned by `db.transaction(fn)` which begins the transaction with `BEGIN IMMEDIATE`, satisfying the "atomic claim" requirement without needing external locking.

- [ ] **Step 4: Run the test and verify it passes**

Run: `npm test -- tests/storage/v2/sqlite-repository-v2.test.ts`
Expected: PASS — four new `llm_scoring_tasks` tests green.

- [ ] **Step 5: Commit**

```bash
git add src/storage/sqlite-repository.ts tests/storage/v2/sqlite-repository-v2.test.ts
git commit -m "feat(v2): add llm_scoring_tasks queue with atomic claim and retry"
```

---

### Task B10: `members` extensions for v2 lookups

**Files:**
- Modify: `src/storage/sqlite-repository.ts`
- Test: `tests/storage/v2/sqlite-repository-v2.test.ts`

Augments the existing `members` table with the v2-specific reads and writes introduced in Task A2 (`source_feishu_open_id`, `hidden_from_board`). Methods: find by feishu open id, set the open id (for binding on first event), set avatar url (filled by subproject 2's member sync), toggle `hidden_from_board` (operator override), and list the eligible students for a camp (used by `WindowSettler` and the ranking context).

- [ ] **Step 1: Write the failing test**

Append:

```typescript
describe("SqliteRepository v2 members extensions", () => {
  test("setMemberFeishuOpenId + findMemberByFeishuOpenId roundtrip", () => {
    const repo = new SqliteRepository(":memory:");
    repo.seedDemo();

    const memberId = "member-student-01";
    repo.setMemberFeishuOpenId(memberId, "ou_abc123");

    const found = repo.findMemberByFeishuOpenId("ou_abc123");
    expect(found?.id).toBe(memberId);

    // unknown open id → undefined
    expect(repo.findMemberByFeishuOpenId("ou_missing")).toBeUndefined();

    repo.close();
  });

  test("setMemberAvatarUrl persists", () => {
    const repo = new SqliteRepository(":memory:");
    repo.seedDemo();

    repo.setMemberAvatarUrl("member-student-01", "https://cdn.feishu.cn/a1.png");
    const m = repo.getMember("member-student-01")!;
    expect(m.avatarUrl).toBe("https://cdn.feishu.cn/a1.png");

    repo.close();
  });

  test("setMemberHiddenFromBoard toggles eligibility", () => {
    const repo = new SqliteRepository(":memory:");
    repo.seedDemo();
    const campId = repo.getDefaultCampId()!;

    const beforeHide = repo.listEligibleStudents(campId);
    const beforeCount = beforeHide.length;
    expect(beforeCount).toBeGreaterThan(0);

    const first = beforeHide[0];
    repo.setMemberHiddenFromBoard(first.id, true);

    const afterHide = repo.listEligibleStudents(campId);
    expect(afterHide.length).toBe(beforeCount - 1);
    expect(afterHide.find((m) => m.id === first.id)).toBeUndefined();

    // restore
    repo.setMemberHiddenFromBoard(first.id, false);
    expect(repo.listEligibleStudents(campId).length).toBe(beforeCount);

    repo.close();
  });

  test("listEligibleStudents excludes operators, trainers, non-participants, excluded_from_board", () => {
    const repo = new SqliteRepository(":memory:");
    repo.seedDemo();
    const campId = repo.getDefaultCampId()!;

    const students = repo.listEligibleStudents(campId);
    for (const m of students) {
      expect(m.roleType).toBe("student");
      expect(m.isParticipant).toBe(true);
      expect(m.isExcludedFromBoard).toBe(false);
    }
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npm test -- tests/storage/v2/sqlite-repository-v2.test.ts`
Expected: FAIL — new member methods missing.

- [ ] **Step 3: Write the minimal implementation**

Add these methods inside `SqliteRepository` (place them alongside the existing `getMember` / `ensureMember` helpers):

```typescript
findMemberByFeishuOpenId(openId: string): MemberProfile | undefined {
  const row = this.db
    .prepare(
      `SELECT * FROM members WHERE source_feishu_open_id = ? LIMIT 1`
    )
    .get(openId) as Record<string, unknown> | undefined;

  if (!row) {
    return undefined;
  }

  return {
    id: String(row.id),
    campId: String(row.camp_id),
    name: String(row.name),
    displayName: String(row.display_name ?? ""),
    avatarUrl: String(row.avatar_url ?? ""),
    department: String(row.department),
    roleType: row.role_type as MemberProfile["roleType"],
    isParticipant: asBoolean(Number(row.is_participant)),
    isExcludedFromBoard: asBoolean(Number(row.is_excluded_from_board)),
    status: row.status as MemberProfile["status"]
  };
}

setMemberFeishuOpenId(memberId: string, openId: string): void {
  this.db
    .prepare(`UPDATE members SET source_feishu_open_id = ? WHERE id = ?`)
    .run(openId, memberId);
}

setMemberAvatarUrl(memberId: string, url: string): void {
  this.db
    .prepare(`UPDATE members SET avatar_url = ? WHERE id = ?`)
    .run(url, memberId);
}

setMemberHiddenFromBoard(memberId: string, hidden: boolean): void {
  this.db
    .prepare(`UPDATE members SET hidden_from_board = ? WHERE id = ?`)
    .run(hidden ? 1 : 0, memberId);
}

listEligibleStudents(campId: string): MemberProfile[] {
  const rows = this.db
    .prepare(
      `SELECT * FROM members
       WHERE camp_id = ?
         AND role_type = 'student'
         AND is_participant = 1
         AND is_excluded_from_board = 0
         AND COALESCE(hidden_from_board, 0) = 0
       ORDER BY id ASC`
    )
    .all(campId) as Array<Record<string, unknown>>;

  return rows.map((row) => ({
    id: String(row.id),
    campId: String(row.camp_id),
    name: String(row.name),
    displayName: String(row.display_name ?? ""),
    avatarUrl: String(row.avatar_url ?? ""),
    department: String(row.department),
    roleType: row.role_type as MemberProfile["roleType"],
    isParticipant: asBoolean(Number(row.is_participant)),
    isExcludedFromBoard: asBoolean(Number(row.is_excluded_from_board)),
    status: row.status as MemberProfile["status"]
  }));
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `npm test -- tests/storage/v2/sqlite-repository-v2.test.ts`
Expected: PASS — four new `members extensions` tests green.

Also run the full suite: `npm test`
Expected: no regression across the existing tests.

- [ ] **Step 5: Commit**

```bash
git add src/storage/sqlite-repository.ts tests/storage/v2/sqlite-repository-v2.test.ts
git commit -m "feat(v2): add members extensions for feishu open id and eligibility"
```

---

## Phase B Exit Checkpoint

- [ ] All 10 tasks (B1 through B10) have shipped their tests and implementations
- [ ] `tests/storage/v2/sqlite-repository-v2.test.ts` now contains 10 `describe` blocks (one from Phase A task A2 plus nine added here) and at least 20 `test` cases
- [ ] `npm test -- tests/storage/v2/sqlite-repository-v2.test.ts` is green
- [ ] `npm test` (full suite) is green — no regression in existing tests
- [ ] `git log --oneline codex/phase-one-feishu ^<phase-b-start-sha>` shows 10 commits, one per task
- [ ] `SqliteRepository` exports the 10 new record types: `PeriodRecord`, `WindowRecord`, `CardInteractionRecord`, `ScoringItemEventRecord`, `ScoringEventStatus`, `WindowSnapshotRecord`, `MemberLevelRecord`, `PromotionRecord`, `LlmScoringTaskRecord`, `LlmTaskStatus`
- [ ] No drizzle query-builder imports were added anywhere; every v2 query uses `db.prepare(...)`
- [ ] `grep -rn "drizzle-orm" src/storage/sqlite-repository.ts` returns nothing (drizzle is only referenced in `src/db/schema.ts` type-reference file)
- [ ] All multi-statement writes (`closePeriod`, `claimNextPendingTask`, `markTaskFailedRetry`) use either a single UPDATE or a `db.transaction(...)` wrapper
- [ ] Every `:memory:` repo constructed in the test file is explicitly `.close()`d before the `test()` block exits

Phase B ends here. Phase C (Domain Primitives) depends on every method landed above; do not start C until this checkpoint is fully green.

## Phase C — Core Domain (5 tasks)

Phase C builds the pure functional heart of the scoring system: growth bonus computation, rank context derivation, the 60-path level promotion judge, the window settler that orchestrates settlement, and the period lifecycle command handlers. Phase A errors/types and Phase B repository methods already exist and are importable. Side-effecting functions (`window-settler`, `period-lifecycle`) accept narrow `Deps` interfaces so they are unit-testable against in-memory fakes without booting a real SQLite repository.

---

### Task C1: `growth-bonus.ts` — pure growth weighting computation

**Files:**
- Create: `src/domain/v2/growth-bonus.ts`
- Test: `tests/domain/v2/growth-bonus.test.ts`

This is a pure function covering the three edge cases from spec §3.6 step 2 and §8.10:
1. First window → no bonus regardless of score
2. `previousWindowAq < 30` is clamped to 30 (躺平防爆 floor)
3. `previousWindowAq >= 140` uses absolute-diff floor (+12 ⇒ tier `small`/+3)
4. Otherwise the 1.15 / 1.30 / 1.50 ratio tiers apply, highest wins

- [ ] **Step 1: Write failing test**

Create `tests/domain/v2/growth-bonus.test.ts`:

```typescript
import { describe, expect, test } from "vitest";

import {
  computeGrowthBonus,
  type GrowthBonusInput,
  type GrowthBonusTier
} from "../../../src/domain/v2/growth-bonus.js";

interface Row {
  name: string;
  input: GrowthBonusInput;
  expectedBonus: 0 | 3 | 6 | 10;
  expectedTier: GrowthBonusTier;
}

const rows: Row[] = [
  {
    name: "first window yields no bonus regardless of AQ",
    input: { currentAqBeforeBonus: 200, previousWindowAq: 0, isFirstWindow: true },
    expectedBonus: 0,
    expectedTier: "none"
  },
  {
    name: "first window with zero current AQ",
    input: { currentAqBeforeBonus: 0, previousWindowAq: 0, isFirstWindow: true },
    expectedBonus: 0,
    expectedTier: "none"
  },
  {
    name: "low-base floor: prev=10 clamped to 30, 36/30=1.20 -> small +3",
    input: { currentAqBeforeBonus: 36, previousWindowAq: 10, isFirstWindow: false },
    expectedBonus: 3,
    expectedTier: "small"
  },
  {
    name: "low-base floor: prev=0 clamped to 30, 45/30=1.50 -> leap +10",
    input: { currentAqBeforeBonus: 45, previousWindowAq: 0, isFirstWindow: false },
    expectedBonus: 10,
    expectedTier: "leap"
  },
  {
    name: "ratio tier none: 110/100=1.10 < 1.15",
    input: { currentAqBeforeBonus: 110, previousWindowAq: 100, isFirstWindow: false },
    expectedBonus: 0,
    expectedTier: "none"
  },
  {
    name: "ratio tier small: 115/100=1.15 exactly",
    input: { currentAqBeforeBonus: 115, previousWindowAq: 100, isFirstWindow: false },
    expectedBonus: 3,
    expectedTier: "small"
  },
  {
    name: "ratio tier significant: 130/100=1.30 exactly",
    input: { currentAqBeforeBonus: 130, previousWindowAq: 100, isFirstWindow: false },
    expectedBonus: 6,
    expectedTier: "significant"
  },
  {
    name: "ratio tier leap: 150/100=1.50 exactly",
    input: { currentAqBeforeBonus: 150, previousWindowAq: 100, isFirstWindow: false },
    expectedBonus: 10,
    expectedTier: "leap"
  },
  {
    name: "ratio tier leap: 200/100=2.00 well above 1.50",
    input: { currentAqBeforeBonus: 200, previousWindowAq: 100, isFirstWindow: false },
    expectedBonus: 10,
    expectedTier: "leap"
  },
  {
    name: "high-base floor: prev=140, diff=+12 -> high_base_floor +3",
    input: { currentAqBeforeBonus: 152, previousWindowAq: 140, isFirstWindow: false },
    expectedBonus: 3,
    expectedTier: "high_base_floor"
  },
  {
    name: "high-base floor: prev=200, diff=+11 -> no bonus (ratio 1.055 < 1.15 and diff < 12)",
    input: { currentAqBeforeBonus: 211, previousWindowAq: 200, isFirstWindow: false },
    expectedBonus: 0,
    expectedTier: "none"
  },
  {
    name: "high-base floor overridden by ratio tier when ratio wins (prev=140, cur=210, ratio=1.50)",
    input: { currentAqBeforeBonus: 210, previousWindowAq: 140, isFirstWindow: false },
    expectedBonus: 10,
    expectedTier: "leap"
  },
  {
    name: "high-base floor does NOT activate when prev < 140",
    input: { currentAqBeforeBonus: 151, previousWindowAq: 139, isFirstWindow: false },
    expectedBonus: 0,
    expectedTier: "none"
  },
  {
    name: "regression drop: current < previous yields no bonus",
    input: { currentAqBeforeBonus: 80, previousWindowAq: 100, isFirstWindow: false },
    expectedBonus: 0,
    expectedTier: "none"
  },
  {
    name: "just below small tier: 114/100=1.14",
    input: { currentAqBeforeBonus: 114, previousWindowAq: 100, isFirstWindow: false },
    expectedBonus: 0,
    expectedTier: "none"
  },
  {
    name: "just below leap tier: 149/100=1.49 -> significant +6",
    input: { currentAqBeforeBonus: 149, previousWindowAq: 100, isFirstWindow: false },
    expectedBonus: 6,
    expectedTier: "significant"
  }
];

describe("computeGrowthBonus", () => {
  test.each(rows)("$name", ({ input, expectedBonus, expectedTier }) => {
    const result = computeGrowthBonus(input);
    expect(result.bonus).toBe(expectedBonus);
    expect(result.tier).toBe(expectedTier);
  });

  test("returns a new object; does not mutate input", () => {
    const input: GrowthBonusInput = {
      currentAqBeforeBonus: 130,
      previousWindowAq: 100,
      isFirstWindow: false
    };
    const snapshot = { ...input };
    computeGrowthBonus(input);
    expect(input).toEqual(snapshot);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/domain/v2/growth-bonus.test.ts`
Expected: FAIL — `src/domain/v2/growth-bonus.js` module not found.

- [ ] **Step 3: Implement `src/domain/v2/growth-bonus.ts`**

```typescript
export type GrowthBonusTier =
  | "none"
  | "small"
  | "significant"
  | "leap"
  | "high_base_floor";

export interface GrowthBonusInput {
  currentAqBeforeBonus: number;
  previousWindowAq: number;
  isFirstWindow: boolean;
}

export interface GrowthBonusResult {
  bonus: 0 | 3 | 6 | 10;
  tier: GrowthBonusTier;
}

const PREV_AQ_LOW_FLOOR = 30;
const PREV_AQ_HIGH_BASE_THRESHOLD = 140;
const HIGH_BASE_ABS_DIFF = 12;

const RATIO_LEAP = 1.5;
const RATIO_SIGNIFICANT = 1.3;
const RATIO_SMALL = 1.15;

export function computeGrowthBonus(
  input: GrowthBonusInput
): GrowthBonusResult {
  if (input.isFirstWindow) {
    return { bonus: 0, tier: "none" };
  }

  const { currentAqBeforeBonus, previousWindowAq } = input;
  const effectivePrevAq = Math.max(previousWindowAq, PREV_AQ_LOW_FLOOR);
  const ratio = currentAqBeforeBonus / effectivePrevAq;

  if (ratio >= RATIO_LEAP) {
    return { bonus: 10, tier: "leap" };
  }
  if (ratio >= RATIO_SIGNIFICANT) {
    return { bonus: 6, tier: "significant" };
  }
  if (ratio >= RATIO_SMALL) {
    return { bonus: 3, tier: "small" };
  }

  const absoluteDiff = currentAqBeforeBonus - previousWindowAq;
  if (
    previousWindowAq >= PREV_AQ_HIGH_BASE_THRESHOLD &&
    absoluteDiff >= HIGH_BASE_ABS_DIFF
  ) {
    return { bonus: 3, tier: "high_base_floor" };
  }

  return { bonus: 0, tier: "none" };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/domain/v2/growth-bonus.test.ts`
Expected: PASS — all 16 table rows plus the immutability test green.

- [ ] **Step 5: Commit**

```bash
git add src/domain/v2/growth-bonus.ts tests/domain/v2/growth-bonus.test.ts
git commit -m "feat(v2): add computeGrowthBonus with ratio tiers and high-base floor"
```

---

### Task C2: `rank-context.ts` — pure dimension rank context builder

**Files:**
- Create: `src/domain/v2/rank-context.ts`
- Test: `tests/domain/v2/rank-context.test.ts`

Per spec §3.8 this is a pure function that, given every eligible student's per-dimension cumulative score, produces the rank context the promotion judge consumes: per-dimension `{ rank, cumulativeScore }`, plus boundary sets (`dimensionsInTop3`, `dimensionsInTop5`, `dimensionsInBottom1`, `dimensionsInBottom3`) and scalars (`eligibleStudentCount`, `elapsedScoringPeriods`). Tie-breaking is `(cumulativeScore DESC, memberId ASC)` as the spec mandates (§3.8 note).

- [ ] **Step 1: Write failing test**

Create `tests/domain/v2/rank-context.test.ts`:

```typescript
import { describe, expect, test } from "vitest";

import {
  computeRankContext,
  type RankContextInput,
  type DimensionScoreRow
} from "../../../src/domain/v2/rank-context.js";

function row(
  memberId: string,
  dimension: "K" | "H" | "C" | "S" | "G",
  cumulativeScore: number
): DimensionScoreRow {
  return { memberId, dimension, cumulativeScore };
}

function baseInput(overrides: Partial<RankContextInput> = {}): RankContextInput {
  return {
    targetMemberId: "m-1",
    eligibleMemberIds: ["m-1"],
    scoreRows: [],
    elapsedScoringPeriods: 0,
    ...overrides
  };
}

describe("computeRankContext", () => {
  test("single eligible member: rank 1 in all dimensions", () => {
    const input = baseInput({
      scoreRows: [
        row("m-1", "K", 20),
        row("m-1", "H", 15),
        row("m-1", "C", 10),
        row("m-1", "S", 5),
        row("m-1", "G", 8)
      ],
      elapsedScoringPeriods: 2
    });
    const ctx = computeRankContext(input);
    expect(ctx.eligibleStudentCount).toBe(1);
    expect(ctx.elapsedScoringPeriods).toBe(2);
    expect(ctx.K).toEqual({ rank: 1, cumulativeScore: 20 });
    expect(ctx.H).toEqual({ rank: 1, cumulativeScore: 15 });
    expect(ctx.C).toEqual({ rank: 1, cumulativeScore: 10 });
    expect(ctx.S).toEqual({ rank: 1, cumulativeScore: 5 });
    expect(ctx.G).toEqual({ rank: 1, cumulativeScore: 8 });
    // With only 1 eligible, rank==count so bottom1 and bottom3 both contain the dim
    expect(ctx.dimensionsInBottom1.size).toBe(5);
    expect(ctx.dimensionsInTop3.size).toBe(5);
  });

  test("clean 5-member ranking across all dimensions", () => {
    const members = ["m-1", "m-2", "m-3", "m-4", "m-5"];
    const rows: DimensionScoreRow[] = [];
    // m-1 dominates K, m-2 dominates H, m-3 dominates C, m-4 dominates S, m-5 dominates G
    const kScores = [50, 40, 30, 20, 10];
    const hScores = [10, 50, 40, 30, 20];
    const cScores = [20, 10, 50, 40, 30];
    const sScores = [30, 20, 10, 50, 40];
    const gScores = [40, 30, 20, 10, 50];
    for (let i = 0; i < members.length; i += 1) {
      rows.push(row(members[i], "K", kScores[i]));
      rows.push(row(members[i], "H", hScores[i]));
      rows.push(row(members[i], "C", cScores[i]));
      rows.push(row(members[i], "S", sScores[i]));
      rows.push(row(members[i], "G", gScores[i]));
    }
    const ctx = computeRankContext({
      targetMemberId: "m-1",
      eligibleMemberIds: members,
      scoreRows: rows,
      elapsedScoringPeriods: 4
    });
    expect(ctx.eligibleStudentCount).toBe(5);
    expect(ctx.K.rank).toBe(1);
    expect(ctx.K.cumulativeScore).toBe(50);
    expect(ctx.H.rank).toBe(5);
    expect(ctx.C.rank).toBe(4);
    expect(ctx.S.rank).toBe(3);
    expect(ctx.G.rank).toBe(2);
    expect(ctx.dimensionsInTop3.has("K")).toBe(true);
    expect(ctx.dimensionsInTop3.has("G")).toBe(true);
    expect(ctx.dimensionsInTop3.has("S")).toBe(true);
    expect(ctx.dimensionsInTop3.has("H")).toBe(false);
    expect(ctx.dimensionsInTop3.has("C")).toBe(false);
    expect(ctx.dimensionsInBottom1.has("H")).toBe(true);
    expect(ctx.dimensionsInBottom3.has("H")).toBe(true);
    expect(ctx.dimensionsInBottom3.has("C")).toBe(true);
    expect(ctx.dimensionsInBottom3.has("S")).toBe(true);
  });

  test("tie-breaking: equal scores resolved by memberId ASC", () => {
    const members = ["m-a", "m-b", "m-c"];
    const rows: DimensionScoreRow[] = [
      row("m-a", "K", 30),
      row("m-b", "K", 30),
      row("m-c", "K", 30),
      row("m-a", "H", 10),
      row("m-b", "H", 10),
      row("m-c", "H", 10),
      row("m-a", "C", 0),
      row("m-b", "C", 0),
      row("m-c", "C", 0),
      row("m-a", "S", 5),
      row("m-b", "S", 5),
      row("m-c", "S", 5),
      row("m-a", "G", 20),
      row("m-b", "G", 20),
      row("m-c", "G", 20)
    ];
    const ctxA = computeRankContext({
      targetMemberId: "m-a",
      eligibleMemberIds: members,
      scoreRows: rows,
      elapsedScoringPeriods: 2
    });
    const ctxB = computeRankContext({
      targetMemberId: "m-b",
      eligibleMemberIds: members,
      scoreRows: rows,
      elapsedScoringPeriods: 2
    });
    const ctxC = computeRankContext({
      targetMemberId: "m-c",
      eligibleMemberIds: members,
      scoreRows: rows,
      elapsedScoringPeriods: 2
    });
    expect(ctxA.K.rank).toBe(1);
    expect(ctxB.K.rank).toBe(2);
    expect(ctxC.K.rank).toBe(3);
  });

  test("missing score rows for target member default to zero", () => {
    const ctx = computeRankContext({
      targetMemberId: "m-2",
      eligibleMemberIds: ["m-1", "m-2"],
      scoreRows: [row("m-1", "K", 30), row("m-1", "H", 30)],
      elapsedScoringPeriods: 1
    });
    expect(ctx.K.cumulativeScore).toBe(0);
    expect(ctx.K.rank).toBe(2);
    expect(ctx.H.cumulativeScore).toBe(0);
    expect(ctx.H.rank).toBe(2);
    expect(ctx.dimensionsInBottom1.has("K")).toBe(true);
  });

  test("10-member boundary: rank 3 is in Top3 but rank 4 is not", () => {
    const members = Array.from({ length: 10 }, (_, i) => `m-${i + 1}`);
    const rows: DimensionScoreRow[] = members.map((id, i) =>
      row(id, "K", 100 - i * 5)
    );
    // append 4 more dims all zero so the shape is valid
    for (const id of members) {
      rows.push(row(id, "H", 0));
      rows.push(row(id, "C", 0));
      rows.push(row(id, "S", 0));
      rows.push(row(id, "G", 0));
    }
    const ctxRank3 = computeRankContext({
      targetMemberId: "m-3",
      eligibleMemberIds: members,
      scoreRows: rows,
      elapsedScoringPeriods: 6
    });
    expect(ctxRank3.K.rank).toBe(3);
    expect(ctxRank3.dimensionsInTop3.has("K")).toBe(true);

    const ctxRank4 = computeRankContext({
      targetMemberId: "m-4",
      eligibleMemberIds: members,
      scoreRows: rows,
      elapsedScoringPeriods: 6
    });
    expect(ctxRank4.K.rank).toBe(4);
    expect(ctxRank4.dimensionsInTop3.has("K")).toBe(false);
    expect(ctxRank4.dimensionsInTop5.has("K")).toBe(true);
  });

  test("10-member boundary: bottom3 contains ranks 8, 9, 10", () => {
    const members = Array.from({ length: 10 }, (_, i) => `m-${i + 1}`);
    const rows: DimensionScoreRow[] = members.map((id, i) =>
      row(id, "G", 100 - i * 5)
    );
    for (const id of members) {
      rows.push(row(id, "K", 0));
      rows.push(row(id, "H", 0));
      rows.push(row(id, "C", 0));
      rows.push(row(id, "S", 0));
    }
    const ctxBottom = computeRankContext({
      targetMemberId: "m-10",
      eligibleMemberIds: members,
      scoreRows: rows,
      elapsedScoringPeriods: 8
    });
    expect(ctxBottom.G.rank).toBe(10);
    expect(ctxBottom.dimensionsInBottom1.has("G")).toBe(true);
    expect(ctxBottom.dimensionsInBottom3.has("G")).toBe(true);

    const ctxRank8 = computeRankContext({
      targetMemberId: "m-8",
      eligibleMemberIds: members,
      scoreRows: rows,
      elapsedScoringPeriods: 8
    });
    expect(ctxRank8.G.rank).toBe(8);
    expect(ctxRank8.dimensionsInBottom1.has("G")).toBe(false);
    expect(ctxRank8.dimensionsInBottom3.has("G")).toBe(true);
  });

  test("zero cumulative score across all dimensions still produces a rank", () => {
    const members = ["m-1", "m-2"];
    const rows: DimensionScoreRow[] = members.flatMap((id) => [
      row(id, "K", 0),
      row(id, "H", 0),
      row(id, "C", 0),
      row(id, "S", 0),
      row(id, "G", 0)
    ]);
    const ctx = computeRankContext({
      targetMemberId: "m-2",
      eligibleMemberIds: members,
      scoreRows: rows,
      elapsedScoringPeriods: 1
    });
    expect(ctx.K.cumulativeScore).toBe(0);
    // tie-broken by memberId ASC: m-1 rank 1, m-2 rank 2
    expect(ctx.K.rank).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/domain/v2/rank-context.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/domain/v2/rank-context.ts`**

```typescript
import type { ScoringDimension } from "./scoring-items-config.js";

export interface DimensionScoreRow {
  memberId: string;
  dimension: ScoringDimension;
  cumulativeScore: number;
}

export interface RankContextInput {
  targetMemberId: string;
  eligibleMemberIds: readonly string[];
  scoreRows: readonly DimensionScoreRow[];
  elapsedScoringPeriods: number;
}

export interface DimensionRank {
  rank: number;
  cumulativeScore: number;
}

export interface RankContext {
  K: DimensionRank;
  H: DimensionRank;
  C: DimensionRank;
  S: DimensionRank;
  G: DimensionRank;
  eligibleStudentCount: number;
  dimensionsInBottom1: Set<ScoringDimension>;
  dimensionsInBottom3: Set<ScoringDimension>;
  dimensionsInTop3: Set<ScoringDimension>;
  dimensionsInTop5: Set<ScoringDimension>;
  elapsedScoringPeriods: number;
}

const DIMENSIONS: readonly ScoringDimension[] = ["K", "H", "C", "S", "G"];

function rankFor(
  dimension: ScoringDimension,
  targetMemberId: string,
  eligibleMemberIds: readonly string[],
  scoreRows: readonly DimensionScoreRow[]
): DimensionRank {
  const byMember = new Map<string, number>();
  for (const id of eligibleMemberIds) {
    byMember.set(id, 0);
  }
  for (const row of scoreRows) {
    if (row.dimension !== dimension) continue;
    if (!byMember.has(row.memberId)) continue;
    byMember.set(
      row.memberId,
      (byMember.get(row.memberId) ?? 0) + row.cumulativeScore
    );
  }
  const ordered = Array.from(byMember.entries())
    .map(([memberId, cumulativeScore]) => ({ memberId, cumulativeScore }))
    .sort((a, b) => {
      if (b.cumulativeScore !== a.cumulativeScore) {
        return b.cumulativeScore - a.cumulativeScore;
      }
      return a.memberId < b.memberId ? -1 : a.memberId > b.memberId ? 1 : 0;
    });
  const idx = ordered.findIndex((r) => r.memberId === targetMemberId);
  const cumulativeScore = byMember.get(targetMemberId) ?? 0;
  const rank = idx >= 0 ? idx + 1 : ordered.length + 1;
  return { rank, cumulativeScore };
}

export function computeRankContext(input: RankContextInput): RankContext {
  const count = input.eligibleMemberIds.length;
  const dimensionsInBottom1 = new Set<ScoringDimension>();
  const dimensionsInBottom3 = new Set<ScoringDimension>();
  const dimensionsInTop3 = new Set<ScoringDimension>();
  const dimensionsInTop5 = new Set<ScoringDimension>();
  const perDim: Record<ScoringDimension, DimensionRank> = {
    K: { rank: 0, cumulativeScore: 0 },
    H: { rank: 0, cumulativeScore: 0 },
    C: { rank: 0, cumulativeScore: 0 },
    S: { rank: 0, cumulativeScore: 0 },
    G: { rank: 0, cumulativeScore: 0 }
  };

  for (const dim of DIMENSIONS) {
    const dr = rankFor(
      dim,
      input.targetMemberId,
      input.eligibleMemberIds,
      input.scoreRows
    );
    perDim[dim] = dr;
    if (dr.rank <= 3) dimensionsInTop3.add(dim);
    if (dr.rank <= 5) dimensionsInTop5.add(dim);
    if (dr.rank === count) dimensionsInBottom1.add(dim);
    if (dr.rank >= count - 2) dimensionsInBottom3.add(dim);
  }

  return {
    K: perDim.K,
    H: perDim.H,
    C: perDim.C,
    S: perDim.S,
    G: perDim.G,
    eligibleStudentCount: count,
    dimensionsInBottom1,
    dimensionsInBottom3,
    dimensionsInTop3,
    dimensionsInTop5,
    elapsedScoringPeriods: input.elapsedScoringPeriods
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/domain/v2/rank-context.test.ts`
Expected: PASS — all 7 cases green.

- [ ] **Step 5: Commit**

```bash
git add src/domain/v2/rank-context.ts tests/domain/v2/rank-context.test.ts
git commit -m "feat(v2): add computeRankContext with tie-break and boundary sets"
```

---

### Task C3: `promotion-judge.ts` — 60-path level promotion decision tree

**Files:**
- Create: `src/domain/v2/promotion-judge.ts`
- Test: `tests/domain/v2/promotion-judge.test.ts`

This is the biggest pure function in Phase C. It implements spec §3.7 end-to-end: Lv.5 early return, `consecMissedOnEntry` → `discount` + `dimCountRelax` mapping, `finalHalving = isFinal ? 0.5 : 1.0`, `skipDimensionChecks = isFinal && attendedAllPeriods`, per-level primary and alternate paths with `Math.ceil(base * (1 - discount) * finalHalving)` thresholds, a `final_bonus` retry with +5 on every dimension when both paths fail in a FINAL window, and a full `reason.conditionChecks` audit log. The test suite uses `describe.each` with at least 25 canonical cases covering the 60 paths plus 5 standalone edge tests.

- [ ] **Step 1: Write failing test**

Create `tests/domain/v2/promotion-judge.test.ts`:

```typescript
import { describe, expect, test } from "vitest";

import {
  judge,
  type JudgeInput,
  type JudgeOutput,
  type WindowSnapshotLike
} from "../../../src/domain/v2/promotion-judge.js";
import type { ScoringDimension } from "../../../src/domain/v2/scoring-items-config.js";

function snapshot(overrides: Partial<WindowSnapshotLike> = {}): WindowSnapshotLike {
  return {
    windowAq: 0,
    cumulativeAq: 0,
    kScore: 0,
    hScore: 0,
    cScore: 0,
    sScore: 0,
    gScore: 0,
    ...overrides
  };
}

function ctx(overrides: {
  top3?: ScoringDimension[];
  top5?: ScoringDimension[];
  bottom1?: ScoringDimension[];
  bottom3?: ScoringDimension[];
  eligibleStudentCount?: number;
  elapsedScoringPeriods?: number;
  perDim?: Partial<Record<ScoringDimension, number>>;
} = {}): JudgeInput["dimensionRankContext"] {
  const perDim = overrides.perDim ?? {};
  return {
    K: { rank: 1, cumulativeScore: perDim.K ?? 0 },
    H: { rank: 1, cumulativeScore: perDim.H ?? 0 },
    C: { rank: 1, cumulativeScore: perDim.C ?? 0 },
    S: { rank: 1, cumulativeScore: perDim.S ?? 0 },
    G: { rank: 1, cumulativeScore: perDim.G ?? 0 },
    eligibleStudentCount: overrides.eligibleStudentCount ?? 14,
    dimensionsInBottom1: new Set(overrides.bottom1 ?? []),
    dimensionsInBottom3: new Set(overrides.bottom3 ?? []),
    dimensionsInTop3: new Set(overrides.top3 ?? []),
    dimensionsInTop5: new Set(overrides.top5 ?? []),
    elapsedScoringPeriods: overrides.elapsedScoringPeriods ?? 4
  };
}

function input(overrides: Partial<JudgeInput> = {}): JudgeInput {
  return {
    snapshot: snapshot(),
    currentLevel: 1,
    consecMissedOnEntry: 0,
    isFinal: false,
    dimensionRankContext: ctx(),
    attendedAllPeriods: false,
    homeworkAllSubmitted: false,
    sBehaviorScore: 0,
    cBehaviorScore: 0,
    hasClosingShowcaseBonus: false,
    ...overrides
  };
}

interface JudgeCase {
  name: string;
  setup: JudgeInput;
  expectPromoted: boolean;
  expectToLevel: 1 | 2 | 3 | 4 | 5;
  expectPath: JudgeOutput["pathTaken"];
}

const cases: JudgeCase[] = [
  {
    name: "Lv1->Lv2 primary: windowAq=32, 1 dim>=8",
    setup: input({
      currentLevel: 1,
      snapshot: snapshot({ windowAq: 32, cumulativeAq: 32, kScore: 8 })
    }),
    expectPromoted: true,
    expectToLevel: 2,
    expectPath: "primary"
  },
  {
    name: "Lv1->Lv2 primary fail (no dim>=8), alternate pass: cumAq=56, 2 dims>=5",
    setup: input({
      currentLevel: 1,
      snapshot: snapshot({
        windowAq: 28,
        cumulativeAq: 56,
        kScore: 7,
        hScore: 5,
        cScore: 5
      })
    }),
    expectPromoted: true,
    expectToLevel: 2,
    expectPath: "alternate"
  },
  {
    name: "Lv1->Lv2 both fail: windowAq=20, cum=40, only 1 dim>=5",
    setup: input({
      currentLevel: 1,
      snapshot: snapshot({
        windowAq: 20,
        cumulativeAq: 40,
        kScore: 5,
        hScore: 4
      })
    }),
    expectPromoted: false,
    expectToLevel: 1,
    expectPath: "none"
  },
  {
    name: "Lv1->Lv2 primary with discount 0.15 (consecMissed=1): windowAq >= ceil(32*0.85)=28",
    setup: input({
      currentLevel: 1,
      consecMissedOnEntry: 1,
      snapshot: snapshot({ windowAq: 28, cumulativeAq: 28, kScore: 8 })
    }),
    expectPromoted: true,
    expectToLevel: 2,
    expectPath: "protection_discounted"
  },
  {
    name: "Lv1->Lv2 primary with discount 0.25 (consecMissed=2): windowAq >= ceil(32*0.75)=24",
    setup: input({
      currentLevel: 1,
      consecMissedOnEntry: 2,
      snapshot: snapshot({ windowAq: 24, cumulativeAq: 24, kScore: 8 })
    }),
    expectPromoted: true,
    expectToLevel: 2,
    expectPath: "protection_discounted"
  },
  {
    name: "Lv2->Lv3 primary: windowAq=42, 2 dims>=10, homework all",
    setup: input({
      currentLevel: 2,
      homeworkAllSubmitted: true,
      snapshot: snapshot({
        windowAq: 42,
        cumulativeAq: 100,
        kScore: 12,
        hScore: 10
      })
    }),
    expectPromoted: true,
    expectToLevel: 3,
    expectPath: "primary"
  },
  {
    name: "Lv2->Lv3 primary fails on homework, alternate pass",
    setup: input({
      currentLevel: 2,
      homeworkAllSubmitted: false,
      snapshot: snapshot({
        windowAq: 40,
        cumulativeAq: 160,
        kScore: 10,
        hScore: 10,
        cScore: 10
      }),
      dimensionRankContext: ctx({
        elapsedScoringPeriods: 4,
        perDim: { K: 16, H: 16, C: 16, S: 10 }
      })
    }),
    expectPromoted: true,
    expectToLevel: 3,
    expectPath: "alternate"
  },
  {
    name: "Lv2->Lv3 primary fails on dim count (only 1>=10), alternate fails on cumAq",
    setup: input({
      currentLevel: 2,
      homeworkAllSubmitted: true,
      snapshot: snapshot({
        windowAq: 42,
        cumulativeAq: 120,
        kScore: 12,
        hScore: 9
      })
    }),
    expectPromoted: false,
    expectToLevel: 2,
    expectPath: "none"
  },
  {
    name: "Lv2->Lv3 primary with discount 0.25 dimCountRelax=1 (only 1 dim>=10 needed)",
    setup: input({
      currentLevel: 2,
      consecMissedOnEntry: 2,
      homeworkAllSubmitted: true,
      snapshot: snapshot({
        windowAq: 32,
        cumulativeAq: 32,
        kScore: 10
      })
    }),
    expectPromoted: true,
    expectToLevel: 3,
    expectPath: "protection_discounted"
  },
  {
    name: "Lv3->Lv4 primary: windowAq=50, cum=245, 4 dims meet dimCumulative, sBehavior>=5",
    setup: input({
      currentLevel: 3,
      sBehaviorScore: 5,
      snapshot: snapshot({
        windowAq: 50,
        cumulativeAq: 245,
        kScore: 12,
        hScore: 12,
        cScore: 12,
        sScore: 12,
        gScore: 2
      }),
      dimensionRankContext: ctx({
        elapsedScoringPeriods: 4,
        perDim: { K: 20, H: 20, C: 20, S: 20, G: 8 }
      })
    }),
    expectPromoted: true,
    expectToLevel: 4,
    expectPath: "primary"
  },
  {
    name: "Lv3->Lv4 primary fails (sBehavior<5), alternate: cum=295, cBehavior>=8, no bottom1",
    setup: input({
      currentLevel: 3,
      sBehaviorScore: 4,
      cBehaviorScore: 8,
      snapshot: snapshot({
        windowAq: 39,
        cumulativeAq: 295,
        kScore: 9,
        hScore: 9,
        cScore: 8,
        sScore: 4,
        gScore: 9
      }),
      dimensionRankContext: ctx({
        bottom1: []
      })
    }),
    expectPromoted: true,
    expectToLevel: 4,
    expectPath: "alternate"
  },
  {
    name: "Lv3->Lv4 alternate fails on bottom1 rule",
    setup: input({
      currentLevel: 3,
      sBehaviorScore: 4,
      cBehaviorScore: 8,
      snapshot: snapshot({
        windowAq: 39,
        cumulativeAq: 295
      }),
      dimensionRankContext: ctx({
        bottom1: ["G"]
      })
    }),
    expectPromoted: false,
    expectToLevel: 3,
    expectPath: "none"
  },
  {
    name: "Lv3->Lv4 discount 0.15: windowAq >= ceil(50*0.85)=43",
    setup: input({
      currentLevel: 3,
      consecMissedOnEntry: 1,
      sBehaviorScore: 5,
      snapshot: snapshot({
        windowAq: 43,
        cumulativeAq: 245,
        kScore: 12,
        hScore: 12,
        cScore: 12,
        sScore: 12
      }),
      dimensionRankContext: ctx({
        elapsedScoringPeriods: 4,
        perDim: { K: 20, H: 20, C: 20, S: 20, G: 8 }
      })
    }),
    expectPromoted: true,
    expectToLevel: 4,
    expectPath: "protection_discounted"
  },
  {
    name: "Lv4->Lv5 primary: windowAq=56, cum=392, all 5 dims meet, 1 top3",
    setup: input({
      currentLevel: 4,
      snapshot: snapshot({
        windowAq: 56,
        cumulativeAq: 392
      }),
      dimensionRankContext: ctx({
        top3: ["K"],
        top5: ["K", "H"],
        elapsedScoringPeriods: 6,
        perDim: { K: 30, H: 30, C: 30, S: 30, G: 30 }
      })
    }),
    expectPromoted: true,
    expectToLevel: 5,
    expectPath: "primary"
  },
  {
    name: "Lv4->Lv5 primary fails on top3, alternate passes",
    setup: input({
      currentLevel: 4,
      snapshot: snapshot({
        windowAq: 46,
        cumulativeAq: 434
      }),
      dimensionRankContext: ctx({
        top3: [],
        top5: ["K", "H", "C", "S"],
        bottom3: [],
        elapsedScoringPeriods: 6,
        perDim: { K: 30, H: 30, C: 30, S: 30, G: 25 }
      })
    }),
    expectPromoted: true,
    expectToLevel: 5,
    expectPath: "alternate"
  },
  {
    name: "Lv4->Lv5 alternate fails on bottom3",
    setup: input({
      currentLevel: 4,
      snapshot: snapshot({
        windowAq: 46,
        cumulativeAq: 434
      }),
      dimensionRankContext: ctx({
        top3: [],
        top5: ["K", "H", "C", "S"],
        bottom3: ["G"]
      })
    }),
    expectPromoted: false,
    expectToLevel: 4,
    expectPath: "none"
  },
  {
    name: "Lv5 is terminal: already_at_max",
    setup: input({ currentLevel: 5 }),
    expectPromoted: false,
    expectToLevel: 5,
    expectPath: "none"
  },
  {
    name: "isFinal halving: Lv1->Lv2 primary windowAq >= ceil(32*0.5)=16",
    setup: input({
      currentLevel: 1,
      isFinal: true,
      snapshot: snapshot({ windowAq: 16, cumulativeAq: 16, kScore: 8 })
    }),
    expectPromoted: true,
    expectToLevel: 2,
    expectPath: "primary"
  },
  {
    name: "isFinal + attendedAllPeriods skips dim checks",
    setup: input({
      currentLevel: 2,
      isFinal: true,
      attendedAllPeriods: true,
      homeworkAllSubmitted: true,
      snapshot: snapshot({
        windowAq: 21,
        cumulativeAq: 80,
        kScore: 5
      })
    }),
    expectPromoted: true,
    expectToLevel: 3,
    expectPath: "primary"
  },
  {
    name: "final_bonus rescue: Lv1->Lv2 primary and alt fail, +5 bonus triggers primary",
    setup: input({
      currentLevel: 1,
      isFinal: true,
      hasClosingShowcaseBonus: true,
      snapshot: snapshot({
        windowAq: 15,
        cumulativeAq: 15,
        kScore: 3
      })
    }),
    expectPromoted: true,
    expectToLevel: 2,
    expectPath: "final_bonus"
  },
  {
    name: "final_bonus even fails: all fields too low",
    setup: input({
      currentLevel: 1,
      isFinal: true,
      hasClosingShowcaseBonus: true,
      snapshot: snapshot({
        windowAq: 5,
        cumulativeAq: 5,
        kScore: 0
      })
    }),
    expectPromoted: false,
    expectToLevel: 1,
    expectPath: "none"
  },
  {
    name: "Lv2->Lv3 discount 0.15 dimCountRelax=0 still needs 2 dims>=10",
    setup: input({
      currentLevel: 2,
      consecMissedOnEntry: 1,
      homeworkAllSubmitted: true,
      snapshot: snapshot({
        windowAq: 36,
        cumulativeAq: 36,
        kScore: 10,
        hScore: 10
      })
    }),
    expectPromoted: true,
    expectToLevel: 3,
    expectPath: "protection_discounted"
  },
  {
    name: "Lv3->Lv4 discount 0.25 dimCountRelax=1 needs 3 dims",
    setup: input({
      currentLevel: 3,
      consecMissedOnEntry: 2,
      sBehaviorScore: 5,
      snapshot: snapshot({
        windowAq: 38,
        cumulativeAq: 184,
        kScore: 8,
        hScore: 8,
        cScore: 8,
        sScore: 8
      }),
      dimensionRankContext: ctx({
        elapsedScoringPeriods: 4,
        perDim: { K: 20, H: 20, C: 20, S: 10, G: 4 }
      })
    }),
    expectPromoted: true,
    expectToLevel: 4,
    expectPath: "protection_discounted"
  },
  {
    name: "threshold tie: Lv1->Lv2 windowAq exactly 32",
    setup: input({
      currentLevel: 1,
      snapshot: snapshot({ windowAq: 32, cumulativeAq: 32, kScore: 8 })
    }),
    expectPromoted: true,
    expectToLevel: 2,
    expectPath: "primary"
  },
  {
    name: "threshold miss by 1: Lv1->Lv2 windowAq 31 fails primary",
    setup: input({
      currentLevel: 1,
      snapshot: snapshot({
        windowAq: 31,
        cumulativeAq: 31,
        kScore: 8
      })
    }),
    expectPromoted: false,
    expectToLevel: 1,
    expectPath: "none"
  }
];

describe("LevelPromotionJudge", () => {
  describe.each(cases)("$name", (c) => {
    test("returns expected output", () => {
      const out = judge(c.setup);
      expect(out.promoted).toBe(c.expectPromoted);
      expect(out.toLevel).toBe(c.expectToLevel);
      expect(out.pathTaken).toBe(c.expectPath);
      expect(out.reason).toBeDefined();
      expect(Array.isArray(out.reason.conditionChecks)).toBe(true);
    });
  });

  test("reason.conditionChecks records every evaluated rule", () => {
    const out = judge(
      input({
        currentLevel: 1,
        snapshot: snapshot({ windowAq: 32, cumulativeAq: 32, kScore: 8 })
      })
    );
    expect(out.reason.conditionChecks.length).toBeGreaterThan(0);
    for (const check of out.reason.conditionChecks) {
      expect(typeof check.name).toBe("string");
      expect(typeof check.passed).toBe("boolean");
      expect(check).toHaveProperty("actual");
      expect(check).toHaveProperty("required");
    }
  });

  test("reason.discount reflects consecMissedOnEntry mapping", () => {
    const out0 = judge(input({ currentLevel: 1 }));
    expect(out0.reason.discount).toBe(0);
    const out1 = judge(input({ currentLevel: 1, consecMissedOnEntry: 1 }));
    expect(out1.reason.discount).toBeCloseTo(0.15);
    const out2 = judge(input({ currentLevel: 1, consecMissedOnEntry: 2 }));
    expect(out2.reason.discount).toBeCloseTo(0.25);
    const out3 = judge(input({ currentLevel: 1, consecMissedOnEntry: 5 }));
    expect(out3.reason.discount).toBeCloseTo(0.25);
  });

  test("Lv5 early return path is 'none' with already_at_max note", () => {
    const out = judge(input({ currentLevel: 5 }));
    expect(out.promoted).toBe(false);
    expect(out.toLevel).toBe(5);
    expect(out.pathTaken).toBe("none");
    expect(out.reason.notes ?? []).toContain("already_at_max");
  });

  test("input is not mutated (immutability)", () => {
    const i = input({
      currentLevel: 1,
      snapshot: snapshot({ windowAq: 32, cumulativeAq: 32, kScore: 8 })
    });
    const snap = JSON.stringify({
      ...i,
      dimensionRankContext: {
        ...i.dimensionRankContext,
        dimensionsInBottom1: Array.from(i.dimensionRankContext.dimensionsInBottom1),
        dimensionsInBottom3: Array.from(i.dimensionRankContext.dimensionsInBottom3),
        dimensionsInTop3: Array.from(i.dimensionRankContext.dimensionsInTop3),
        dimensionsInTop5: Array.from(i.dimensionRankContext.dimensionsInTop5)
      }
    });
    judge(i);
    const after = JSON.stringify({
      ...i,
      dimensionRankContext: {
        ...i.dimensionRankContext,
        dimensionsInBottom1: Array.from(i.dimensionRankContext.dimensionsInBottom1),
        dimensionsInBottom3: Array.from(i.dimensionRankContext.dimensionsInBottom3),
        dimensionsInTop3: Array.from(i.dimensionRankContext.dimensionsInTop3),
        dimensionsInTop5: Array.from(i.dimensionRankContext.dimensionsInTop5)
      }
    });
    expect(after).toBe(snap);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/domain/v2/promotion-judge.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/domain/v2/promotion-judge.ts`**

```typescript
import type { ScoringDimension } from "./scoring-items-config.js";

export interface WindowSnapshotLike {
  windowAq: number;
  cumulativeAq: number;
  kScore: number;
  hScore: number;
  cScore: number;
  sScore: number;
  gScore: number;
}

export interface DimensionRank {
  rank: number;
  cumulativeScore: number;
}

export interface JudgeRankContext {
  K: DimensionRank;
  H: DimensionRank;
  C: DimensionRank;
  S: DimensionRank;
  G: DimensionRank;
  eligibleStudentCount: number;
  dimensionsInBottom1: Set<ScoringDimension>;
  dimensionsInBottom3: Set<ScoringDimension>;
  dimensionsInTop3: Set<ScoringDimension>;
  dimensionsInTop5: Set<ScoringDimension>;
  elapsedScoringPeriods: number;
}

export type LevelValue = 1 | 2 | 3 | 4 | 5;

export interface JudgeInput {
  snapshot: WindowSnapshotLike;
  currentLevel: LevelValue;
  consecMissedOnEntry: number;
  isFinal: boolean;
  dimensionRankContext: JudgeRankContext;
  attendedAllPeriods: boolean;
  homeworkAllSubmitted: boolean;
  sBehaviorScore: number;
  cBehaviorScore: number;
  hasClosingShowcaseBonus: boolean;
}

export type JudgePathTaken =
  | "primary"
  | "alternate"
  | "protection_discounted"
  | "final_bonus"
  | "none";

export interface ConditionCheck {
  name: string;
  passed: boolean;
  actual: unknown;
  required: unknown;
}

export interface JudgeReason {
  attemptedPath: "primary" | "alternate" | "both";
  conditionChecks: ConditionCheck[];
  discount: number;
  notes?: string[];
}

export interface JudgeOutput {
  promoted: boolean;
  toLevel: LevelValue;
  pathTaken: JudgePathTaken;
  reason: JudgeReason;
}

interface PathContext {
  snapshot: WindowSnapshotLike;
  rankContext: JudgeRankContext;
  discount: number;
  dimCountRelax: number;
  finalHalving: number;
  skipDimensionChecks: boolean;
  homeworkAllSubmitted: boolean;
  sBehaviorScore: number;
  cBehaviorScore: number;
}

interface PathResult {
  passed: boolean;
  checks: ConditionCheck[];
}

const DIMENSIONS: readonly ScoringDimension[] = ["K", "H", "C", "S", "G"];

function threshold(base: number, discount: number, finalHalving: number): number {
  return Math.ceil(base * (1 - discount) * finalHalving);
}

function snapshotDimScore(
  snap: WindowSnapshotLike,
  dim: ScoringDimension
): number {
  switch (dim) {
    case "K":
      return snap.kScore;
    case "H":
      return snap.hScore;
    case "C":
      return snap.cScore;
    case "S":
      return snap.sScore;
    case "G":
      return snap.gScore;
  }
}

function countDimsAtLeast(
  snap: WindowSnapshotLike,
  cutoff: number
): number {
  let count = 0;
  for (const d of DIMENSIONS) {
    if (snapshotDimScore(snap, d) >= cutoff) count += 1;
  }
  return count;
}

function countDimsWithCumulativeAtLeast(
  rankContext: JudgeRankContext,
  cutoff: number
): number {
  let count = 0;
  for (const d of DIMENSIONS) {
    if (rankContext[d].cumulativeScore >= cutoff) count += 1;
  }
  return count;
}

function mk(
  name: string,
  actual: unknown,
  required: unknown,
  passed: boolean
): ConditionCheck {
  return { name, actual, required, passed };
}

function tryLv2Primary(ctx: PathContext): PathResult {
  const checks: ConditionCheck[] = [];
  const needWindowAq = threshold(32, ctx.discount, ctx.finalHalving);
  const c1 = mk(
    "lv2.primary.windowAq",
    ctx.snapshot.windowAq,
    `>= ${needWindowAq}`,
    ctx.snapshot.windowAq >= needWindowAq
  );
  checks.push(c1);

  if (!ctx.skipDimensionChecks) {
    const dimsGe8 = countDimsAtLeast(ctx.snapshot, 8);
    checks.push(
      mk("lv2.primary.dimsGe8", dimsGe8, ">= 1", dimsGe8 >= 1)
    );
  }
  const passed = checks.every((c) => c.passed);
  return { passed, checks };
}

function tryLv2Alternate(ctx: PathContext): PathResult {
  const checks: ConditionCheck[] = [];
  checks.push(
    mk(
      "lv2.alternate.cumulativeAq",
      ctx.snapshot.cumulativeAq,
      ">= 56",
      ctx.snapshot.cumulativeAq >= 56
    )
  );
  if (!ctx.skipDimensionChecks) {
    const dimsGe5 = countDimsAtLeast(ctx.snapshot, 5);
    checks.push(
      mk("lv2.alternate.dimsGe5", dimsGe5, ">= 2", dimsGe5 >= 2)
    );
  }
  const passed = checks.every((c) => c.passed);
  return { passed, checks };
}

function tryLv3Primary(ctx: PathContext): PathResult {
  const checks: ConditionCheck[] = [];
  const needWindowAq = threshold(42, ctx.discount, ctx.finalHalving);
  checks.push(
    mk(
      "lv3.primary.windowAq",
      ctx.snapshot.windowAq,
      `>= ${needWindowAq}`,
      ctx.snapshot.windowAq >= needWindowAq
    )
  );
  if (!ctx.skipDimensionChecks) {
    const required = 2 - ctx.dimCountRelax;
    const dimsGe10 = countDimsAtLeast(ctx.snapshot, 10);
    checks.push(
      mk("lv3.primary.dimsGe10", dimsGe10, `>= ${required}`, dimsGe10 >= required)
    );
  }
  checks.push(
    mk(
      "lv3.primary.homeworkAllSubmitted",
      ctx.homeworkAllSubmitted,
      true,
      ctx.homeworkAllSubmitted === true
    )
  );
  const passed = checks.every((c) => c.passed);
  return { passed, checks };
}

function tryLv3Alternate(ctx: PathContext): PathResult {
  const checks: ConditionCheck[] = [];
  const needWindowAq = threshold(32, ctx.discount, ctx.finalHalving);
  checks.push(
    mk(
      "lv3.alternate.cumulativeAq",
      ctx.snapshot.cumulativeAq,
      ">= 155",
      ctx.snapshot.cumulativeAq >= 155
    )
  );
  checks.push(
    mk(
      "lv3.alternate.windowAq",
      ctx.snapshot.windowAq,
      `>= ${needWindowAq}`,
      ctx.snapshot.windowAq >= needWindowAq
    )
  );
  if (!ctx.skipDimensionChecks) {
    const required = 3 - ctx.dimCountRelax;
    const cutoff = ctx.rankContext.elapsedScoringPeriods * 4;
    const dims = countDimsWithCumulativeAtLeast(ctx.rankContext, cutoff);
    checks.push(
      mk(
        "lv3.alternate.dimsCumulativeGe",
        { dims, cutoff },
        `>= ${required}`,
        dims >= required
      )
    );
  }
  const passed = checks.every((c) => c.passed);
  return { passed, checks };
}

function tryLv4Primary(ctx: PathContext): PathResult {
  const checks: ConditionCheck[] = [];
  const needWindowAq = threshold(50, ctx.discount, ctx.finalHalving);
  checks.push(
    mk(
      "lv4.primary.windowAq",
      ctx.snapshot.windowAq,
      `>= ${needWindowAq}`,
      ctx.snapshot.windowAq >= needWindowAq
    )
  );
  checks.push(
    mk(
      "lv4.primary.cumulativeAq",
      ctx.snapshot.cumulativeAq,
      ">= 245",
      ctx.snapshot.cumulativeAq >= 245
    )
  );
  if (!ctx.skipDimensionChecks) {
    const required = 4 - ctx.dimCountRelax;
    const cutoff = ctx.rankContext.elapsedScoringPeriods * 5;
    const dims = countDimsWithCumulativeAtLeast(ctx.rankContext, cutoff);
    checks.push(
      mk(
        "lv4.primary.dimsCumulativeGe",
        { dims, cutoff },
        `>= ${required}`,
        dims >= required
      )
    );
  }
  checks.push(
    mk(
      "lv4.primary.sBehaviorScore",
      ctx.sBehaviorScore,
      ">= 5",
      ctx.sBehaviorScore >= 5
    )
  );
  const passed = checks.every((c) => c.passed);
  return { passed, checks };
}

function tryLv4Alternate(ctx: PathContext): PathResult {
  const checks: ConditionCheck[] = [];
  const needWindowAq = threshold(39, ctx.discount, ctx.finalHalving);
  checks.push(
    mk(
      "lv4.alternate.cumulativeAq",
      ctx.snapshot.cumulativeAq,
      ">= 295",
      ctx.snapshot.cumulativeAq >= 295
    )
  );
  checks.push(
    mk(
      "lv4.alternate.windowAq",
      ctx.snapshot.windowAq,
      `>= ${needWindowAq}`,
      ctx.snapshot.windowAq >= needWindowAq
    )
  );
  checks.push(
    mk(
      "lv4.alternate.dimensionsInBottom1Size",
      ctx.rankContext.dimensionsInBottom1.size,
      "== 0",
      ctx.rankContext.dimensionsInBottom1.size === 0
    )
  );
  checks.push(
    mk(
      "lv4.alternate.cBehaviorScore",
      ctx.cBehaviorScore,
      ">= 8",
      ctx.cBehaviorScore >= 8
    )
  );
  const passed = checks.every((c) => c.passed);
  return { passed, checks };
}

function tryLv5Primary(ctx: PathContext): PathResult {
  const checks: ConditionCheck[] = [];
  const needWindowAq = threshold(56, ctx.discount, ctx.finalHalving);
  checks.push(
    mk(
      "lv5.primary.windowAq",
      ctx.snapshot.windowAq,
      `>= ${needWindowAq}`,
      ctx.snapshot.windowAq >= needWindowAq
    )
  );
  checks.push(
    mk(
      "lv5.primary.cumulativeAq",
      ctx.snapshot.cumulativeAq,
      ">= 392",
      ctx.snapshot.cumulativeAq >= 392
    )
  );
  if (!ctx.skipDimensionChecks) {
    const cutoff = ctx.rankContext.elapsedScoringPeriods * 5;
    const dims = countDimsWithCumulativeAtLeast(ctx.rankContext, cutoff);
    checks.push(
      mk(
        "lv5.primary.allDimsCumulativeGe",
        { dims, cutoff },
        "== 5",
        dims === 5
      )
    );
    checks.push(
      mk(
        "lv5.primary.dimensionsInTop3Size",
        ctx.rankContext.dimensionsInTop3.size,
        ">= 1",
        ctx.rankContext.dimensionsInTop3.size >= 1
      )
    );
  }
  const passed = checks.every((c) => c.passed);
  return { passed, checks };
}

function tryLv5Alternate(ctx: PathContext): PathResult {
  const checks: ConditionCheck[] = [];
  const needWindowAq = threshold(46, ctx.discount, ctx.finalHalving);
  checks.push(
    mk(
      "lv5.alternate.cumulativeAq",
      ctx.snapshot.cumulativeAq,
      ">= 434",
      ctx.snapshot.cumulativeAq >= 434
    )
  );
  checks.push(
    mk(
      "lv5.alternate.windowAq",
      ctx.snapshot.windowAq,
      `>= ${needWindowAq}`,
      ctx.snapshot.windowAq >= needWindowAq
    )
  );
  if (!ctx.skipDimensionChecks) {
    checks.push(
      mk(
        "lv5.alternate.dimensionsInTop5Size",
        ctx.rankContext.dimensionsInTop5.size,
        ">= 4",
        ctx.rankContext.dimensionsInTop5.size >= 4
      )
    );
    checks.push(
      mk(
        "lv5.alternate.dimensionsInBottom3Size",
        ctx.rankContext.dimensionsInBottom3.size,
        "== 0",
        ctx.rankContext.dimensionsInBottom3.size === 0
      )
    );
  }
  const passed = checks.every((c) => c.passed);
  return { passed, checks };
}

function tryPrimary(targetLevel: LevelValue, ctx: PathContext): PathResult {
  switch (targetLevel) {
    case 2:
      return tryLv2Primary(ctx);
    case 3:
      return tryLv3Primary(ctx);
    case 4:
      return tryLv4Primary(ctx);
    case 5:
      return tryLv5Primary(ctx);
    default:
      return { passed: false, checks: [] };
  }
}

function tryAlternate(targetLevel: LevelValue, ctx: PathContext): PathResult {
  switch (targetLevel) {
    case 2:
      return tryLv2Alternate(ctx);
    case 3:
      return tryLv3Alternate(ctx);
    case 4:
      return tryLv4Alternate(ctx);
    case 5:
      return tryLv5Alternate(ctx);
    default:
      return { passed: false, checks: [] };
  }
}

function boostedSnapshot(snap: WindowSnapshotLike): WindowSnapshotLike {
  return {
    windowAq: snap.windowAq + 25,
    cumulativeAq: snap.cumulativeAq + 25,
    kScore: snap.kScore + 5,
    hScore: snap.hScore + 5,
    cScore: snap.cScore + 5,
    sScore: snap.sScore + 5,
    gScore: snap.gScore + 5
  };
}

export function judge(input: JudgeInput): JudgeOutput {
  if (input.currentLevel === 5) {
    return {
      promoted: false,
      toLevel: 5,
      pathTaken: "none",
      reason: {
        attemptedPath: "primary",
        conditionChecks: [],
        discount: 0,
        notes: ["already_at_max"]
      }
    };
  }

  let discount = 0;
  let dimCountRelax = 0;
  if (input.consecMissedOnEntry === 1) {
    discount = 0.15;
  } else if (input.consecMissedOnEntry >= 2) {
    discount = 0.25;
    dimCountRelax = 1;
  }

  const finalHalving = input.isFinal ? 0.5 : 1.0;
  const skipDimensionChecks = input.isFinal && input.attendedAllPeriods;

  const targetLevel = (input.currentLevel + 1) as LevelValue;
  const ctx: PathContext = {
    snapshot: input.snapshot,
    rankContext: input.dimensionRankContext,
    discount,
    dimCountRelax,
    finalHalving,
    skipDimensionChecks,
    homeworkAllSubmitted: input.homeworkAllSubmitted,
    sBehaviorScore: input.sBehaviorScore,
    cBehaviorScore: input.cBehaviorScore
  };

  const primary = tryPrimary(targetLevel, ctx);
  if (primary.passed) {
    return {
      promoted: true,
      toLevel: targetLevel,
      pathTaken:
        input.consecMissedOnEntry >= 1 ? "protection_discounted" : "primary",
      reason: {
        attemptedPath: "primary",
        conditionChecks: primary.checks,
        discount,
        notes: skipDimensionChecks ? ["full_attendance_dim_skip"] : undefined
      }
    };
  }

  const alternate = tryAlternate(targetLevel, ctx);
  if (alternate.passed) {
    return {
      promoted: true,
      toLevel: targetLevel,
      pathTaken:
        input.consecMissedOnEntry >= 1 ? "protection_discounted" : "alternate",
      reason: {
        attemptedPath: "alternate",
        conditionChecks: [...primary.checks, ...alternate.checks],
        discount,
        notes: skipDimensionChecks ? ["full_attendance_dim_skip"] : undefined
      }
    };
  }

  if (input.isFinal && input.hasClosingShowcaseBonus) {
    const boostedCtx: PathContext = { ...ctx, snapshot: boostedSnapshot(input.snapshot) };
    const retryPrimary = tryPrimary(targetLevel, boostedCtx);
    const retryAlternate = retryPrimary.passed
      ? { passed: false, checks: [] as ConditionCheck[] }
      : tryAlternate(targetLevel, boostedCtx);
    if (retryPrimary.passed || retryAlternate.passed) {
      return {
        promoted: true,
        toLevel: targetLevel,
        pathTaken: "final_bonus",
        reason: {
          attemptedPath: "both",
          conditionChecks: [
            ...primary.checks,
            ...alternate.checks,
            ...retryPrimary.checks,
            ...retryAlternate.checks
          ],
          discount,
          notes: ["final_bonus_applied"]
        }
      };
    }
  }

  return {
    promoted: false,
    toLevel: input.currentLevel,
    pathTaken: "none",
    reason: {
      attemptedPath: "both",
      conditionChecks: [...primary.checks, ...alternate.checks],
      discount,
      notes: []
    }
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/domain/v2/promotion-judge.test.ts`
Expected: PASS — 25 `describe.each` cases plus 4 standalone assertions green.

- [ ] **Step 5: Commit**

```bash
git add src/domain/v2/promotion-judge.ts tests/domain/v2/promotion-judge.test.ts
git commit -m "feat(v2): add LevelPromotionJudge with 60-path decision tree"
```

---

### Task C4: `window-settler.ts` — window settlement orchestrator

**Files:**
- Create: `src/domain/v2/window-settler.ts`
- Test: `tests/domain/v2/window-settler.test.ts`

Per spec §3.6, `settleWindow` orchestrates the per-eligible-student flow: aggregate five-dimension scores across both periods, apply growth bonus, write `window_snapshots`, invoke the promotion judge, record `promotion_records`, update `member_levels`, and flip the window to `settled`. It takes a narrow `SettlerDependencies` interface so it can be unit-tested against in-memory fakes without booting SQLite. Atomicity: if anything throws mid-flight the window is reverted to `open`.

- [ ] **Step 1: Write failing test**

Create `tests/domain/v2/window-settler.test.ts`:

```typescript
import { describe, expect, test, vi } from "vitest";

import {
  settleWindow,
  type SettlerDependencies,
  type SettleOptions,
  type WindowRecord,
  type MemberLevelRecord,
  type PromotionRecord,
  type WindowSnapshotRecord
} from "../../../src/domain/v2/window-settler.js";
import type { DimensionScoreRow } from "../../../src/domain/v2/rank-context.js";

function makeFake(state: {
  window: WindowRecord;
  eligibleMemberIds: string[];
  periodScores: Map<string, DimensionScoreRow[]>;
  prevSnapshots: Map<string, WindowSnapshotRecord>;
  prevPromotions: Map<string, PromotionRecord>;
  memberLevels: Map<string, MemberLevelRecord>;
  attended: Set<string>;
  homeworkAllSubmitted: Set<string>;
  elapsedScoringPeriods: number;
  throwDuringPromotionWrite?: boolean;
}): SettlerDependencies {
  const writtenSnapshots: WindowSnapshotRecord[] = [];
  const writtenPromotions: PromotionRecord[] = [];
  const levelUpdates: MemberLevelRecord[] = [];
  let windowState: WindowRecord = { ...state.window };
  let promotionsWritten = 0;

  const deps: SettlerDependencies = {
    fetchWindow: vi.fn().mockImplementation(async () => windowState),
    updateWindowSettlementState: vi.fn().mockImplementation(async (_id, next) => {
      windowState = { ...windowState, settlementState: next };
    }),
    listEligibleStudentIds: vi.fn().mockResolvedValue(state.eligibleMemberIds),
    fetchPeriodDimensionScores: vi
      .fn()
      .mockImplementation(async (memberId: string, _periodIds: string[]) => {
        return state.periodScores.get(memberId) ?? [];
      }),
    fetchPreviousSnapshot: vi
      .fn()
      .mockImplementation(async (memberId: string) => {
        return state.prevSnapshots.get(memberId) ?? null;
      }),
    fetchPreviousPromotionRecord: vi
      .fn()
      .mockImplementation(async (memberId: string) => {
        return state.prevPromotions.get(memberId) ?? null;
      }),
    fetchMemberLevel: vi
      .fn()
      .mockImplementation(async (memberId: string) => {
        return (
          state.memberLevels.get(memberId) ?? {
            memberId,
            currentLevel: 1,
            levelAttainedAt: "2026-04-01T00:00:00Z",
            lastWindowId: null,
            updatedAt: "2026-04-01T00:00:00Z"
          }
        );
      }),
    computeAttendance: vi
      .fn()
      .mockImplementation(async (memberId: string) => state.attended.has(memberId)),
    computeHomeworkAllSubmitted: vi
      .fn()
      .mockImplementation(async (memberId: string) =>
        state.homeworkAllSubmitted.has(memberId)
      ),
    fetchAllEligibleDimensionScores: vi.fn().mockImplementation(async () => {
      const all: DimensionScoreRow[] = [];
      for (const rows of state.periodScores.values()) {
        all.push(...rows);
      }
      return all;
    }),
    fetchElapsedScoringPeriods: vi
      .fn()
      .mockResolvedValue(state.elapsedScoringPeriods),
    insertWindowSnapshot: vi
      .fn()
      .mockImplementation(async (snap: WindowSnapshotRecord) => {
        writtenSnapshots.push(snap);
      }),
    insertPromotionRecord: vi
      .fn()
      .mockImplementation(async (rec: PromotionRecord) => {
        promotionsWritten += 1;
        if (
          state.throwDuringPromotionWrite &&
          promotionsWritten === 1
        ) {
          throw new Error("simulated write failure");
        }
        writtenPromotions.push(rec);
      }),
    updateMemberLevel: vi
      .fn()
      .mockImplementation(async (rec: MemberLevelRecord) => {
        levelUpdates.push(rec);
      }),
    now: () => "2026-04-10T00:00:00Z"
  };

  return Object.assign(deps, {
    __state: () => ({ windowState, writtenSnapshots, writtenPromotions, levelUpdates })
  });
}

describe("settleWindow", () => {
  test("happy path W1 single member gets promoted Lv1 -> Lv2 primary", async () => {
    const window: WindowRecord = {
      id: "window-w1",
      campId: "c1",
      code: "W1",
      firstPeriodId: "p-1",
      lastPeriodId: "p-2",
      isFinal: false,
      settlementState: "open",
      settledAt: null
    };
    const deps = makeFake({
      window,
      eligibleMemberIds: ["m-1"],
      periodScores: new Map([
        [
          "m-1",
          [
            { memberId: "m-1", dimension: "K", cumulativeScore: 9 },
            { memberId: "m-1", dimension: "H", cumulativeScore: 7 },
            { memberId: "m-1", dimension: "C", cumulativeScore: 6 },
            { memberId: "m-1", dimension: "S", cumulativeScore: 5 },
            { memberId: "m-1", dimension: "G", cumulativeScore: 5 }
          ]
        ]
      ]),
      prevSnapshots: new Map(),
      prevPromotions: new Map(),
      memberLevels: new Map([
        [
          "m-1",
          {
            memberId: "m-1",
            currentLevel: 1,
            levelAttainedAt: "2026-04-01",
            lastWindowId: null,
            updatedAt: "2026-04-01"
          }
        ]
      ]),
      attended: new Set(),
      homeworkAllSubmitted: new Set(),
      elapsedScoringPeriods: 2
    });

    const result = await settleWindow("window-w1", deps);

    expect(result.ok).toBe(true);
    expect(result.settledMemberCount).toBe(1);
    const state = (deps as unknown as { __state: () => { windowState: WindowRecord; writtenSnapshots: WindowSnapshotRecord[]; writtenPromotions: PromotionRecord[]; levelUpdates: MemberLevelRecord[] } }).__state();
    expect(state.windowState.settlementState).toBe("settled");
    expect(state.writtenSnapshots).toHaveLength(1);
    expect(state.writtenSnapshots[0].windowAq).toBe(32);
    expect(state.writtenSnapshots[0].growthBonus).toBe(0);
    expect(state.writtenPromotions).toHaveLength(1);
    expect(state.writtenPromotions[0].promoted).toBe(1);
    expect(state.writtenPromotions[0].toLevel).toBe(2);
    expect(state.levelUpdates).toHaveLength(1);
  });

  test("W2 with growth bonus applied", async () => {
    const window: WindowRecord = {
      id: "window-w2",
      campId: "c1",
      code: "W2",
      firstPeriodId: "p-3",
      lastPeriodId: "p-4",
      isFinal: false,
      settlementState: "open",
      settledAt: null
    };
    const deps = makeFake({
      window,
      eligibleMemberIds: ["m-1"],
      periodScores: new Map([
        [
          "m-1",
          [
            { memberId: "m-1", dimension: "K", cumulativeScore: 15 },
            { memberId: "m-1", dimension: "H", cumulativeScore: 15 },
            { memberId: "m-1", dimension: "C", cumulativeScore: 10 },
            { memberId: "m-1", dimension: "S", cumulativeScore: 5 },
            { memberId: "m-1", dimension: "G", cumulativeScore: 5 }
          ]
        ]
      ]),
      prevSnapshots: new Map([
        [
          "m-1",
          {
            id: "snap-w1-m1",
            windowId: "window-w1",
            memberId: "m-1",
            windowAq: 32,
            cumulativeAq: 32,
            kScore: 8,
            hScore: 8,
            cScore: 8,
            sScore: 4,
            gScore: 4,
            growthBonus: 0,
            consecMissedOnEntry: 0,
            snapshotAt: "2026-04-05"
          }
        ]
      ]),
      prevPromotions: new Map([
        [
          "m-1",
          {
            id: "prom-w1-m1",
            windowId: "window-w1",
            memberId: "m-1",
            evaluatedAt: "2026-04-05",
            fromLevel: 1,
            toLevel: 2,
            promoted: 1,
            pathTaken: "primary",
            reason: "{}"
          }
        ]
      ]),
      memberLevels: new Map([
        [
          "m-1",
          {
            memberId: "m-1",
            currentLevel: 2,
            levelAttainedAt: "2026-04-05",
            lastWindowId: "window-w1",
            updatedAt: "2026-04-05"
          }
        ]
      ]),
      attended: new Set(),
      homeworkAllSubmitted: new Set(["m-1"]),
      elapsedScoringPeriods: 4
    });

    const result = await settleWindow("window-w2", deps);
    expect(result.ok).toBe(true);
    const state = (deps as unknown as { __state: () => { writtenSnapshots: WindowSnapshotRecord[] } }).__state();
    // current before bonus: 15+15+10+5+5 = 50; prev 32, ratio 50/32=1.5625 -> leap +10
    expect(state.writtenSnapshots[0].growthBonus).toBe(10);
    expect(state.writtenSnapshots[0].windowAq).toBe(60);
  });

  test("W2 with protection discount when previous promotion was missed", async () => {
    const window: WindowRecord = {
      id: "window-w2",
      campId: "c1",
      code: "W2",
      firstPeriodId: "p-3",
      lastPeriodId: "p-4",
      isFinal: false,
      settlementState: "open",
      settledAt: null
    };
    const deps = makeFake({
      window,
      eligibleMemberIds: ["m-1"],
      periodScores: new Map([
        [
          "m-1",
          [
            { memberId: "m-1", dimension: "K", cumulativeScore: 8 },
            { memberId: "m-1", dimension: "H", cumulativeScore: 7 },
            { memberId: "m-1", dimension: "C", cumulativeScore: 6 },
            { memberId: "m-1", dimension: "S", cumulativeScore: 4 },
            { memberId: "m-1", dimension: "G", cumulativeScore: 3 }
          ]
        ]
      ]),
      prevSnapshots: new Map([
        [
          "m-1",
          {
            id: "snap-w1-m1",
            windowId: "window-w1",
            memberId: "m-1",
            windowAq: 24,
            cumulativeAq: 24,
            kScore: 6,
            hScore: 6,
            cScore: 6,
            sScore: 3,
            gScore: 3,
            growthBonus: 0,
            consecMissedOnEntry: 0,
            snapshotAt: "2026-04-05"
          }
        ]
      ]),
      prevPromotions: new Map([
        [
          "m-1",
          {
            id: "prom-w1-m1",
            windowId: "window-w1",
            memberId: "m-1",
            evaluatedAt: "2026-04-05",
            fromLevel: 1,
            toLevel: 1,
            promoted: 0,
            pathTaken: "none",
            reason: "{}"
          }
        ]
      ]),
      memberLevels: new Map([
        [
          "m-1",
          {
            memberId: "m-1",
            currentLevel: 1,
            levelAttainedAt: "2026-04-01",
            lastWindowId: "window-w1",
            updatedAt: "2026-04-05"
          }
        ]
      ]),
      attended: new Set(),
      homeworkAllSubmitted: new Set(),
      elapsedScoringPeriods: 4
    });

    const result = await settleWindow("window-w2", deps);
    expect(result.ok).toBe(true);
    const state = (deps as unknown as { __state: () => { writtenSnapshots: WindowSnapshotRecord[]; writtenPromotions: PromotionRecord[] } }).__state();
    expect(state.writtenSnapshots[0].consecMissedOnEntry).toBe(1);
    // windowAq 28 passes discounted threshold ceil(32*0.85)=28
    expect(state.writtenPromotions[0].pathTaken).toBe("protection_discounted");
  });

  test("non-eligible member is skipped via listEligibleStudentIds", async () => {
    const window: WindowRecord = {
      id: "window-w1",
      campId: "c1",
      code: "W1",
      firstPeriodId: "p-1",
      lastPeriodId: "p-2",
      isFinal: false,
      settlementState: "open",
      settledAt: null
    };
    const deps = makeFake({
      window,
      eligibleMemberIds: [],
      periodScores: new Map(),
      prevSnapshots: new Map(),
      prevPromotions: new Map(),
      memberLevels: new Map(),
      attended: new Set(),
      homeworkAllSubmitted: new Set(),
      elapsedScoringPeriods: 2
    });

    const result = await settleWindow("window-w1", deps);
    expect(result.ok).toBe(true);
    expect(result.settledMemberCount).toBe(0);
    const state = (deps as unknown as { __state: () => { writtenSnapshots: WindowSnapshotRecord[] } }).__state();
    expect(state.writtenSnapshots).toHaveLength(0);
  });

  test("idempotent on already-settled window (skipped)", async () => {
    const window: WindowRecord = {
      id: "window-w1",
      campId: "c1",
      code: "W1",
      firstPeriodId: "p-1",
      lastPeriodId: "p-2",
      isFinal: false,
      settlementState: "settled",
      settledAt: "2026-04-09T00:00:00Z"
    };
    const deps = makeFake({
      window,
      eligibleMemberIds: ["m-1"],
      periodScores: new Map(),
      prevSnapshots: new Map(),
      prevPromotions: new Map(),
      memberLevels: new Map(),
      attended: new Set(),
      homeworkAllSubmitted: new Set(),
      elapsedScoringPeriods: 2
    });

    const result = await settleWindow("window-w1", deps);
    expect(result.ok).toBe(true);
    expect(result.alreadySettled).toBe(true);
    expect(deps.listEligibleStudentIds).not.toHaveBeenCalled();
  });

  test("transaction-like atomicity: reverts to 'open' on mid-flight error", async () => {
    const window: WindowRecord = {
      id: "window-w1",
      campId: "c1",
      code: "W1",
      firstPeriodId: "p-1",
      lastPeriodId: "p-2",
      isFinal: false,
      settlementState: "open",
      settledAt: null
    };
    const deps = makeFake({
      window,
      eligibleMemberIds: ["m-1", "m-2"],
      periodScores: new Map([
        [
          "m-1",
          [
            { memberId: "m-1", dimension: "K", cumulativeScore: 9 },
            { memberId: "m-1", dimension: "H", cumulativeScore: 7 },
            { memberId: "m-1", dimension: "C", cumulativeScore: 6 },
            { memberId: "m-1", dimension: "S", cumulativeScore: 5 },
            { memberId: "m-1", dimension: "G", cumulativeScore: 5 }
          ]
        ],
        [
          "m-2",
          [
            { memberId: "m-2", dimension: "K", cumulativeScore: 9 },
            { memberId: "m-2", dimension: "H", cumulativeScore: 7 },
            { memberId: "m-2", dimension: "C", cumulativeScore: 6 },
            { memberId: "m-2", dimension: "S", cumulativeScore: 5 },
            { memberId: "m-2", dimension: "G", cumulativeScore: 5 }
          ]
        ]
      ]),
      prevSnapshots: new Map(),
      prevPromotions: new Map(),
      memberLevels: new Map(),
      attended: new Set(),
      homeworkAllSubmitted: new Set(),
      elapsedScoringPeriods: 2,
      throwDuringPromotionWrite: true
    });

    await expect(settleWindow("window-w1", deps)).rejects.toThrow(
      /simulated write failure/
    );
    const state = (deps as unknown as { __state: () => { windowState: WindowRecord } }).__state();
    expect(state.windowState.settlementState).toBe("open");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/domain/v2/window-settler.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/domain/v2/window-settler.ts`**

```typescript
import { computeGrowthBonus } from "./growth-bonus.js";
import { judge, type JudgeInput, type JudgeOutput } from "./promotion-judge.js";
import {
  computeRankContext,
  type DimensionScoreRow
} from "./rank-context.js";
import type { ScoringDimension } from "./scoring-items-config.js";

export interface WindowRecord {
  id: string;
  campId: string;
  code: string;
  firstPeriodId: string | null;
  lastPeriodId: string | null;
  isFinal: boolean;
  settlementState: "open" | "settling" | "settled";
  settledAt: string | null;
}

export interface WindowSnapshotRecord {
  id: string;
  windowId: string;
  memberId: string;
  windowAq: number;
  cumulativeAq: number;
  kScore: number;
  hScore: number;
  cScore: number;
  sScore: number;
  gScore: number;
  growthBonus: number;
  consecMissedOnEntry: number;
  snapshotAt: string;
}

export interface MemberLevelRecord {
  memberId: string;
  currentLevel: 1 | 2 | 3 | 4 | 5;
  levelAttainedAt: string;
  lastWindowId: string | null;
  updatedAt: string;
}

export interface PromotionRecord {
  id: string;
  windowId: string;
  memberId: string;
  evaluatedAt: string;
  fromLevel: 1 | 2 | 3 | 4 | 5;
  toLevel: 1 | 2 | 3 | 4 | 5;
  promoted: 0 | 1;
  pathTaken: JudgeOutput["pathTaken"];
  reason: string;
}

export interface SettlerDependencies {
  fetchWindow(windowId: string): Promise<WindowRecord>;
  updateWindowSettlementState(
    windowId: string,
    next: "open" | "settling" | "settled"
  ): Promise<void>;
  listEligibleStudentIds(): Promise<string[]>;
  fetchPeriodDimensionScores(
    memberId: string,
    periodIds: readonly string[]
  ): Promise<DimensionScoreRow[]>;
  fetchPreviousSnapshot(
    memberId: string,
    beforeWindowId: string
  ): Promise<WindowSnapshotRecord | null>;
  fetchPreviousPromotionRecord(
    memberId: string,
    beforeWindowId: string
  ): Promise<PromotionRecord | null>;
  fetchMemberLevel(memberId: string): Promise<MemberLevelRecord>;
  computeAttendance(memberId: string): Promise<boolean>;
  computeHomeworkAllSubmitted(
    memberId: string,
    window: WindowRecord
  ): Promise<boolean>;
  fetchAllEligibleDimensionScores(): Promise<DimensionScoreRow[]>;
  fetchElapsedScoringPeriods(window: WindowRecord): Promise<number>;
  insertWindowSnapshot(snap: WindowSnapshotRecord): Promise<void>;
  insertPromotionRecord(rec: PromotionRecord): Promise<void>;
  updateMemberLevel(rec: MemberLevelRecord): Promise<void>;
  now(): string;
}

export interface SettleOptions {
  idFactory?: () => string;
}

export interface SettleResult {
  ok: boolean;
  alreadySettled: boolean;
  settledMemberCount: number;
}

function sumDim(rows: DimensionScoreRow[], dim: ScoringDimension): number {
  let total = 0;
  for (const row of rows) {
    if (row.dimension === dim) total += row.cumulativeScore;
  }
  return total;
}

function defaultIdFactory(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}-${rand}`;
}

export async function settleWindow(
  windowId: string,
  deps: SettlerDependencies,
  options: SettleOptions = {}
): Promise<SettleResult> {
  const window = await deps.fetchWindow(windowId);
  if (window.settlementState === "settled") {
    return { ok: true, alreadySettled: true, settledMemberCount: 0 };
  }

  await deps.updateWindowSettlementState(windowId, "settling");

  try {
    const eligibleIds = await deps.listEligibleStudentIds();
    if (eligibleIds.length === 0) {
      await deps.updateWindowSettlementState(windowId, "settled");
      return { ok: true, alreadySettled: false, settledMemberCount: 0 };
    }

    const periodIds: string[] = [];
    if (window.firstPeriodId) periodIds.push(window.firstPeriodId);
    if (window.lastPeriodId) periodIds.push(window.lastPeriodId);

    const allEligibleScores = await deps.fetchAllEligibleDimensionScores();
    const elapsedScoringPeriods = await deps.fetchElapsedScoringPeriods(window);

    let settledMemberCount = 0;

    for (const memberId of eligibleIds) {
      const dimRows = await deps.fetchPeriodDimensionScores(memberId, periodIds);
      const k = sumDim(dimRows, "K");
      const h = sumDim(dimRows, "H");
      const c = sumDim(dimRows, "C");
      const s = sumDim(dimRows, "S");
      const gBefore = sumDim(dimRows, "G");

      const prevSnap = await deps.fetchPreviousSnapshot(memberId, windowId);
      const prevPromotion = await deps.fetchPreviousPromotionRecord(
        memberId,
        windowId
      );

      const isFirstWindow = prevSnap === null;
      const currentAqBeforeBonus = k + h + c + s + gBefore;
      const { bonus } = computeGrowthBonus({
        currentAqBeforeBonus,
        previousWindowAq: prevSnap?.windowAq ?? 0,
        isFirstWindow
      });

      const gFinal = gBefore + bonus;
      const windowAq = k + h + c + s + gFinal;
      const cumulativeAq = (prevSnap?.cumulativeAq ?? 0) + windowAq;

      let consecMissedOnEntry = prevSnap?.consecMissedOnEntry ?? 0;
      if (prevPromotion && prevPromotion.promoted === 0) {
        consecMissedOnEntry += 1;
      }

      const snapshot: WindowSnapshotRecord = {
        id: (options.idFactory ?? (() => defaultIdFactory("snap")))(),
        windowId,
        memberId,
        windowAq,
        cumulativeAq,
        kScore: k,
        hScore: h,
        cScore: c,
        sScore: s,
        gScore: gFinal,
        growthBonus: bonus,
        consecMissedOnEntry,
        snapshotAt: deps.now()
      };

      await deps.insertWindowSnapshot(snapshot);

      const rankContext = computeRankContext({
        targetMemberId: memberId,
        eligibleMemberIds: eligibleIds,
        scoreRows: allEligibleScores,
        elapsedScoringPeriods
      });

      const memberLevel = await deps.fetchMemberLevel(memberId);
      const attended = await deps.computeAttendance(memberId);
      const homeworkAllSubmitted = await deps.computeHomeworkAllSubmitted(
        memberId,
        window
      );

      const judgeInput: JudgeInput = {
        snapshot: {
          windowAq,
          cumulativeAq,
          kScore: k,
          hScore: h,
          cScore: c,
          sScore: s,
          gScore: gFinal
        },
        currentLevel: memberLevel.currentLevel,
        consecMissedOnEntry,
        isFinal: window.isFinal,
        dimensionRankContext: rankContext,
        attendedAllPeriods: attended,
        homeworkAllSubmitted,
        sBehaviorScore: s,
        cBehaviorScore: c,
        hasClosingShowcaseBonus: false
      };
      const decision = judge(judgeInput);

      const promotion: PromotionRecord = {
        id: (options.idFactory ?? (() => defaultIdFactory("prom")))(),
        windowId,
        memberId,
        evaluatedAt: deps.now(),
        fromLevel: memberLevel.currentLevel,
        toLevel: decision.toLevel,
        promoted: decision.promoted ? 1 : 0,
        pathTaken: decision.pathTaken,
        reason: JSON.stringify(decision.reason)
      };
      await deps.insertPromotionRecord(promotion);

      if (decision.promoted) {
        await deps.updateMemberLevel({
          memberId,
          currentLevel: decision.toLevel,
          levelAttainedAt: deps.now(),
          lastWindowId: windowId,
          updatedAt: deps.now()
        });
      }

      settledMemberCount += 1;
    }

    await deps.updateWindowSettlementState(windowId, "settled");
    return { ok: true, alreadySettled: false, settledMemberCount };
  } catch (err) {
    await deps.updateWindowSettlementState(windowId, "open");
    throw err;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/domain/v2/window-settler.test.ts`
Expected: PASS — all 6 scenarios green.

- [ ] **Step 5: Commit**

```bash
git add src/domain/v2/window-settler.ts tests/domain/v2/window-settler.test.ts
git commit -m "feat(v2): add WindowSettler with growth bonus, judge, and atomicity"
```

---

### Task C5: `period-lifecycle.ts` — `/开期` / `/开窗` / `/结业` handlers

**Files:**
- Create: `src/domain/v2/period-lifecycle.ts`
- Test: `tests/domain/v2/period-lifecycle.test.ts`

Per spec §3.5 this module implements three trainer commands: `openWindow(code, campId)`, `openNewPeriod(number)`, `closeGraduation()`. The module is side-effecting but takes a narrow `PeriodLifecycleDeps` interface so it can be unit-tested with in-memory fakes. `openNewPeriod` throws `NoActiveWindowError` when no slot is available (rather than silently rolling back); it returns `{ shouldSettleWindowId: string | null }` so the caller (API layer) can enqueue the next `settleWindow` call.

- [ ] **Step 1: Write failing test**

Create `tests/domain/v2/period-lifecycle.test.ts`:

```typescript
import { describe, expect, test, vi } from "vitest";

import {
  openNewPeriod,
  openWindow,
  closeGraduation,
  type PeriodLifecycleDeps,
  type PeriodRecord,
  type WindowRecord
} from "../../../src/domain/v2/period-lifecycle.js";
import { NoActiveWindowError } from "../../../src/domain/v2/errors.js";

function makeDeps(initial: {
  periods: PeriodRecord[];
  windows: WindowRecord[];
  campId: string;
}): PeriodLifecycleDeps {
  const periods = [...initial.periods];
  const windows = [...initial.windows];

  return {
    getActiveCampId: vi.fn().mockReturnValue(initial.campId),
    findWindowByCode: vi.fn().mockImplementation(async (campId: string, code: string) => {
      return windows.find((w) => w.campId === campId && w.code === code) ?? null;
    }),
    insertWindow: vi.fn().mockImplementation(async (rec: WindowRecord) => {
      windows.push(rec);
    }),
    findCurrentActivePeriod: vi
      .fn()
      .mockImplementation(async (campId: string): Promise<PeriodRecord | null> => {
        return (
          periods
            .filter((p) => p.campId === campId && p.endedAt === null)
            .sort((a, b) => b.number - a.number)[0] ?? null
        );
      }),
    updatePeriodEndedAt: vi
      .fn()
      .mockImplementation(async (id: string, endedAt: string, reason: string) => {
        const p = periods.find((r) => r.id === id);
        if (p) {
          p.endedAt = endedAt;
          p.closedReason = reason;
        }
      }),
    insertPeriod: vi
      .fn()
      .mockImplementation(async (rec: PeriodRecord) => {
        periods.push(rec);
      }),
    findNextActiveWindow: vi
      .fn()
      .mockImplementation(async (campId: string): Promise<WindowRecord | null> => {
        return (
          windows
            .filter(
              (w) =>
                w.campId === campId &&
                w.settlementState === "open" &&
                (w.firstPeriodId === null || w.lastPeriodId === null)
            )
            .sort((a, b) => a.code.localeCompare(b.code))[0] ?? null
        );
      }),
    updateWindowSlot: vi
      .fn()
      .mockImplementation(
        async (id: string, slot: "first" | "last", periodId: string) => {
          const w = windows.find((r) => r.id === id);
          if (!w) return;
          if (slot === "first") w.firstPeriodId = periodId;
          else w.lastPeriodId = periodId;
        }
      ),
    findWindowByLastPeriod: vi
      .fn()
      .mockImplementation(async (periodId: string): Promise<WindowRecord | null> => {
        return (
          windows.find(
            (w) => w.lastPeriodId === periodId && w.settlementState === "open"
          ) ?? null
        );
      }),
    findPeriodByNumber: vi
      .fn()
      .mockImplementation(async (campId: string, number: number) => {
        return (
          periods.find((p) => p.campId === campId && p.number === number) ?? null
        );
      }),
    findFinalWindow: vi
      .fn()
      .mockImplementation(async (campId: string): Promise<WindowRecord | null> => {
        return (
          windows.find(
            (w) =>
              w.campId === campId &&
              w.isFinal &&
              w.settlementState === "open"
          ) ?? null
        );
      }),
    now: () => "2026-04-10T00:00:00Z",
    __internal: { periods, windows }
  } as unknown as PeriodLifecycleDeps;
}

describe("period-lifecycle: openWindow", () => {
  test("creates a new W3 shell when absent", async () => {
    const deps = makeDeps({ periods: [], windows: [], campId: "c1" });
    const result = await openWindow("W3", "c1", deps);
    expect(result.ok).toBe(true);
    expect(result.windowId).toBe("window-c1-w3");
    expect(deps.insertWindow).toHaveBeenCalledOnce();
  });

  test("idempotent when same code already exists", async () => {
    const deps = makeDeps({
      periods: [],
      windows: [
        {
          id: "window-c1-w3",
          campId: "c1",
          code: "W3",
          firstPeriodId: null,
          lastPeriodId: null,
          isFinal: false,
          settlementState: "open",
          settledAt: null,
          createdAt: "2026-04-01"
        }
      ],
      campId: "c1"
    });
    const result = await openWindow("W3", "c1", deps);
    expect(result.ok).toBe(true);
    expect(result.alreadyExists).toBe(true);
    expect(deps.insertWindow).not.toHaveBeenCalled();
  });

  test("FINAL window is marked isFinal=true", async () => {
    const deps = makeDeps({ periods: [], windows: [], campId: "c1" });
    const result = await openWindow("FINAL", "c1", deps);
    expect(result.ok).toBe(true);
    const internal = (deps as unknown as { __internal: { windows: WindowRecord[] } }).__internal;
    expect(internal.windows[0].isFinal).toBe(true);
  });
});

describe("period-lifecycle: openNewPeriod", () => {
  test("creates ice-breaker period 1 without binding to any window", async () => {
    const deps = makeDeps({
      periods: [],
      windows: [
        {
          id: "window-c1-w1",
          campId: "c1",
          code: "W1",
          firstPeriodId: null,
          lastPeriodId: null,
          isFinal: false,
          settlementState: "open",
          settledAt: null,
          createdAt: "2026-04-01"
        }
      ],
      campId: "c1"
    });
    const result = await openNewPeriod(1, deps);
    expect(result.period.number).toBe(1);
    expect(result.period.isIceBreaker).toBe(true);
    expect(result.assignedWindowId).toBeNull();
    expect(result.shouldSettleWindowId).toBeNull();
    expect(deps.updateWindowSlot).not.toHaveBeenCalled();
  });

  test("binds period 2 to W1.firstPeriodId", async () => {
    const deps = makeDeps({
      periods: [
        {
          id: "period-c1-1",
          campId: "c1",
          number: 1,
          isIceBreaker: true,
          startedAt: "2026-04-01",
          endedAt: null,
          openedByOpId: null,
          closedReason: null,
          createdAt: "2026-04-01",
          updatedAt: "2026-04-01"
        }
      ],
      windows: [
        {
          id: "window-c1-w1",
          campId: "c1",
          code: "W1",
          firstPeriodId: null,
          lastPeriodId: null,
          isFinal: false,
          settlementState: "open",
          settledAt: null,
          createdAt: "2026-04-01"
        }
      ],
      campId: "c1"
    });
    const result = await openNewPeriod(2, deps);
    expect(result.assignedWindowId).toBe("window-c1-w1");
    expect(result.shouldSettleWindowId).toBeNull();
    const internal = (deps as unknown as { __internal: { windows: WindowRecord[] } }).__internal;
    expect(internal.windows[0].firstPeriodId).toBe("period-c1-2");
    expect(internal.windows[0].lastPeriodId).toBeNull();
  });

  test("period 3 binds to W1.lastPeriodId and returns shouldSettleWindowId for W1", async () => {
    const deps = makeDeps({
      periods: [
        {
          id: "period-c1-1",
          campId: "c1",
          number: 1,
          isIceBreaker: true,
          startedAt: "2026-04-01",
          endedAt: "2026-04-05",
          openedByOpId: null,
          closedReason: "next_period_opened",
          createdAt: "2026-04-01",
          updatedAt: "2026-04-01"
        },
        {
          id: "period-c1-2",
          campId: "c1",
          number: 2,
          isIceBreaker: false,
          startedAt: "2026-04-05",
          endedAt: null,
          openedByOpId: null,
          closedReason: null,
          createdAt: "2026-04-05",
          updatedAt: "2026-04-05"
        }
      ],
      windows: [
        {
          id: "window-c1-w1",
          campId: "c1",
          code: "W1",
          firstPeriodId: "period-c1-2",
          lastPeriodId: null,
          isFinal: false,
          settlementState: "open",
          settledAt: null,
          createdAt: "2026-04-01"
        }
      ],
      campId: "c1"
    });
    const result = await openNewPeriod(3, deps);
    expect(result.assignedWindowId).toBe("window-c1-w1");
    expect(result.shouldSettleWindowId).toBe("window-c1-w1");
  });

  test("throws NoActiveWindowError when no open window has a free slot", async () => {
    const deps = makeDeps({
      periods: [
        {
          id: "period-c1-1",
          campId: "c1",
          number: 1,
          isIceBreaker: true,
          startedAt: "2026-04-01",
          endedAt: "2026-04-05",
          openedByOpId: null,
          closedReason: "next_period_opened",
          createdAt: "2026-04-01",
          updatedAt: "2026-04-01"
        }
      ],
      windows: [],
      campId: "c1"
    });
    await expect(openNewPeriod(2, deps)).rejects.toBeInstanceOf(NoActiveWindowError);
  });

  test("closes previous active period before creating the new one", async () => {
    const deps = makeDeps({
      periods: [
        {
          id: "period-c1-2",
          campId: "c1",
          number: 2,
          isIceBreaker: false,
          startedAt: "2026-04-05",
          endedAt: null,
          openedByOpId: null,
          closedReason: null,
          createdAt: "2026-04-05",
          updatedAt: "2026-04-05"
        }
      ],
      windows: [
        {
          id: "window-c1-w1",
          campId: "c1",
          code: "W1",
          firstPeriodId: "period-c1-2",
          lastPeriodId: null,
          isFinal: false,
          settlementState: "open",
          settledAt: null,
          createdAt: "2026-04-01"
        }
      ],
      campId: "c1"
    });
    await openNewPeriod(3, deps);
    expect(deps.updatePeriodEndedAt).toHaveBeenCalledWith(
      "period-c1-2",
      "2026-04-10T00:00:00Z",
      "next_period_opened"
    );
  });
});

describe("period-lifecycle: closeGraduation", () => {
  test("returns shouldSettleWindowId for the FINAL window", async () => {
    const deps = makeDeps({
      periods: [
        {
          id: "period-c1-12",
          campId: "c1",
          number: 12,
          isIceBreaker: false,
          startedAt: "2026-04-01",
          endedAt: null,
          openedByOpId: null,
          closedReason: null,
          createdAt: "2026-04-01",
          updatedAt: "2026-04-01"
        }
      ],
      windows: [
        {
          id: "window-c1-final",
          campId: "c1",
          code: "FINAL",
          firstPeriodId: "period-c1-11",
          lastPeriodId: "period-c1-12",
          isFinal: true,
          settlementState: "open",
          settledAt: null,
          createdAt: "2026-04-01"
        }
      ],
      campId: "c1"
    });
    const result = await closeGraduation(deps);
    expect(result.ok).toBe(true);
    expect(result.shouldSettleWindowId).toBe("window-c1-final");
    expect(deps.updatePeriodEndedAt).toHaveBeenCalledWith(
      "period-c1-12",
      "2026-04-10T00:00:00Z",
      "graduation"
    );
  });

  test("returns ok=false when no FINAL window exists", async () => {
    const deps = makeDeps({ periods: [], windows: [], campId: "c1" });
    const result = await closeGraduation(deps);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("no_final_window");
  });

  test("does not re-close period 12 if already ended", async () => {
    const deps = makeDeps({
      periods: [
        {
          id: "period-c1-12",
          campId: "c1",
          number: 12,
          isIceBreaker: false,
          startedAt: "2026-04-01",
          endedAt: "2026-04-08",
          openedByOpId: null,
          closedReason: "manual_close",
          createdAt: "2026-04-01",
          updatedAt: "2026-04-01"
        }
      ],
      windows: [
        {
          id: "window-c1-final",
          campId: "c1",
          code: "FINAL",
          firstPeriodId: "period-c1-11",
          lastPeriodId: "period-c1-12",
          isFinal: true,
          settlementState: "open",
          settledAt: null,
          createdAt: "2026-04-01"
        }
      ],
      campId: "c1"
    });
    await closeGraduation(deps);
    expect(deps.updatePeriodEndedAt).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/domain/v2/period-lifecycle.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/domain/v2/period-lifecycle.ts`**

```typescript
import { NoActiveWindowError } from "./errors.js";

export interface PeriodRecord {
  id: string;
  campId: string;
  number: number;
  isIceBreaker: boolean;
  startedAt: string;
  endedAt: string | null;
  openedByOpId: string | null;
  closedReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WindowRecord {
  id: string;
  campId: string;
  code: string;
  firstPeriodId: string | null;
  lastPeriodId: string | null;
  isFinal: boolean;
  settlementState: "open" | "settling" | "settled";
  settledAt: string | null;
  createdAt: string;
}

export interface PeriodLifecycleDeps {
  getActiveCampId(): string;
  findWindowByCode(campId: string, code: string): Promise<WindowRecord | null>;
  insertWindow(rec: WindowRecord): Promise<void>;
  findCurrentActivePeriod(campId: string): Promise<PeriodRecord | null>;
  updatePeriodEndedAt(
    id: string,
    endedAt: string,
    reason: string
  ): Promise<void>;
  insertPeriod(rec: PeriodRecord): Promise<void>;
  findNextActiveWindow(campId: string): Promise<WindowRecord | null>;
  updateWindowSlot(
    id: string,
    slot: "first" | "last",
    periodId: string
  ): Promise<void>;
  findWindowByLastPeriod(periodId: string): Promise<WindowRecord | null>;
  findPeriodByNumber(
    campId: string,
    number: number
  ): Promise<PeriodRecord | null>;
  findFinalWindow(campId: string): Promise<WindowRecord | null>;
  now(): string;
}

export interface OpenWindowResult {
  ok: boolean;
  alreadyExists: boolean;
  windowId: string;
}

export interface OpenNewPeriodResult {
  period: PeriodRecord;
  assignedWindowId: string | null;
  shouldSettleWindowId: string | null;
}

export interface CloseGraduationResult {
  ok: boolean;
  reason?: "no_final_window";
  shouldSettleWindowId?: string;
}

export async function openWindow(
  code: string,
  campId: string,
  deps: PeriodLifecycleDeps
): Promise<OpenWindowResult> {
  const existing = await deps.findWindowByCode(campId, code);
  if (existing) {
    return { ok: true, alreadyExists: true, windowId: existing.id };
  }
  const windowId = `window-${campId}-${code.toLowerCase()}`;
  await deps.insertWindow({
    id: windowId,
    campId,
    code,
    firstPeriodId: null,
    lastPeriodId: null,
    isFinal: code === "FINAL",
    settlementState: "open",
    settledAt: null,
    createdAt: deps.now()
  });
  return { ok: true, alreadyExists: false, windowId };
}

export async function openNewPeriod(
  number: number,
  deps: PeriodLifecycleDeps
): Promise<OpenNewPeriodResult> {
  const campId = deps.getActiveCampId();
  const prevPeriod = await deps.findCurrentActivePeriod(campId);
  if (prevPeriod && prevPeriod.endedAt === null) {
    await deps.updatePeriodEndedAt(prevPeriod.id, deps.now(), "next_period_opened");
  }

  const isIceBreaker = number === 1;
  const newPeriod: PeriodRecord = {
    id: `period-${campId}-${number}`,
    campId,
    number,
    isIceBreaker,
    startedAt: deps.now(),
    endedAt: null,
    openedByOpId: null,
    closedReason: null,
    createdAt: deps.now(),
    updatedAt: deps.now()
  };
  await deps.insertPeriod(newPeriod);

  if (isIceBreaker) {
    return {
      period: newPeriod,
      assignedWindowId: null,
      shouldSettleWindowId: null
    };
  }

  const activeWindow = await deps.findNextActiveWindow(campId);
  if (!activeWindow) {
    throw new NoActiveWindowError();
  }

  const slot: "first" | "last" =
    activeWindow.firstPeriodId === null ? "first" : "last";
  await deps.updateWindowSlot(activeWindow.id, slot, newPeriod.id);

  let shouldSettleWindowId: string | null = null;
  if (slot === "last" && prevPeriod) {
    const prevWindow = await deps.findWindowByLastPeriod(prevPeriod.id);
    if (prevWindow) {
      shouldSettleWindowId = prevWindow.id;
    }
  } else if (slot === "last") {
    shouldSettleWindowId = activeWindow.id;
  }

  return {
    period: newPeriod,
    assignedWindowId: activeWindow.id,
    shouldSettleWindowId
  };
}

export async function closeGraduation(
  deps: PeriodLifecycleDeps
): Promise<CloseGraduationResult> {
  const campId = deps.getActiveCampId();
  const finalWindow = await deps.findFinalWindow(campId);
  if (!finalWindow) {
    return { ok: false, reason: "no_final_window" };
  }
  const period12 = await deps.findPeriodByNumber(campId, 12);
  if (period12 && period12.endedAt === null) {
    await deps.updatePeriodEndedAt(period12.id, deps.now(), "graduation");
  }
  return { ok: true, shouldSettleWindowId: finalWindow.id };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/domain/v2/period-lifecycle.test.ts`
Expected: PASS — 10 scenarios green.

- [ ] **Step 5: Commit**

```bash
git add src/domain/v2/period-lifecycle.ts tests/domain/v2/period-lifecycle.test.ts
git commit -m "feat(v2): add period-lifecycle handlers for /开期 /开窗 /结业"
```

---

## Phase C Exit Checkpoint

Run the full suite and build:
```bash
npm test
npm run build
```
Expected: both green. Phase C adds 5 new modules (`growth-bonus`, `rank-context`, `promotion-judge`, `window-settler`, `period-lifecycle`) with approximately 60 new tests covering all the pure functions and the orchestrator. The core domain is now complete: event ingestion (Phase D) can wire into these primitives without touching domain logic again. `src/domain/v2/` should now contain all of the computational heart of the scoring system with zero SQL references — all database interaction is pushed out to the `Deps` interfaces that Phase D and Phase E will satisfy.

---

*Phase D — Ingestion & Aggregation follows in the next section of this plan.*

## Phase D — Scoring Ingestion (3 tasks)

Wire up the event ingestion pipeline: render the 6 LLM prompts, apply decisions through the aggregator, and run the 10-step ingest flow that produces `scoring_item_events` rows (plus `llm_scoring_tasks` rows for the 6 LLM items).

---

### Task D1: `llm-prompts.ts` — 6 LLM prompt templates

**Files:**
- Create: `src/domain/v2/llm-prompts.ts`
- Test: `tests/domain/v2/llm-prompts.test.ts`

All 6 LLM-gated scoring items (K3, K4, C1, C3, H2, G2) need a deterministic prompt renderer so `EventIngestor.ingest` can freeze the text into `llm_scoring_tasks.prompt_text` for later replay. Templates are verbatim from spec §4.6.

- [ ] **Step 1: Write failing test**

Create `tests/domain/v2/llm-prompts.test.ts`:

```typescript
import { describe, expect, test } from "vitest";

import {
  renderPrompt,
  type LlmScorableItemCode,
  type LlmPromptPayload
} from "../../../src/domain/v2/llm-prompts.js";

const SYSTEM_PREFIX_SNIPPET = "AI 训练营评分助手";

function payload(text: string): LlmPromptPayload {
  return { text };
}

describe("renderPrompt", () => {
  test("K3 template contains system prefix, item heading, and payload", () => {
    const out = renderPrompt("K3", payload("今天学到了 Transformer 的 attention 机制"));
    expect(out).toContain(SYSTEM_PREFIX_SNIPPET);
    expect(out).toContain("K3 知识总结打卡");
    expect(out).toContain("今天学到了 Transformer");
    expect(out).toContain("字数 >= 30");
    expect(out).toContain("满分 3");
  });

  test("K4 template describes correction/补充 rules", () => {
    const out = renderPrompt("K4", payload("AI 说 ReLU 会梯度爆炸,其实会梯度消失"));
    expect(out).toContain("K4 AI 纠错或补充");
    expect(out).toContain("指出 AI 输出的具体错误或遗漏");
    expect(out).toContain("满分 4");
  });

  test("C1 template describes creative application rules", () => {
    const out = renderPrompt("C1", payload("用 AI 生成每周会议纪要"));
    expect(out).toContain("C1 AI 创意用法");
    expect(out).toContain("可执行性");
    expect(out).toContain("满分 4");
  });

  test("C3 template describes prompt template rules", () => {
    const out = renderPrompt("C3", payload("# 角色\n你是...\n# 任务\n..."));
    expect(out).toContain("C3 自创提示词模板");
    expect(out).toContain("角色 / 任务 / 约束 / 输出");
    expect(out).toContain("满分 5");
  });

  test("H2 template describes hands-on share rules", () => {
    const out = renderPrompt("H2", payload("用 ChatGPT 做翻译,效果不错"));
    expect(out).toContain("H2 AI 实操分享");
    expect(out).toContain("AI 工具");
    expect(out).toContain("满分 3");
  });

  test("G2 template describes external resource share rules", () => {
    const out = renderPrompt("G2", payload("https://example.com 一个 AI 研究博客"));
    expect(out).toContain("G2 课外好资源");
    expect(out).toContain("不是纯广告");
    expect(out).toContain("满分 3");
  });

  test("throws on unknown item code", () => {
    expect(() =>
      renderPrompt("K1" as LlmScorableItemCode, payload("x"))
    ).toThrow(/unknown llm item/i);
    expect(() =>
      renderPrompt("ZZ" as LlmScorableItemCode, payload("x"))
    ).toThrow(/unknown llm item/i);
  });

  test("rendered prompt is deterministic for the same payload", () => {
    const a = renderPrompt("K3", payload("hello"));
    const b = renderPrompt("K3", payload("hello"));
    expect(a).toBe(b);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/domain/v2/llm-prompts.test.ts`
Expected: FAIL — `src/domain/v2/llm-prompts.js` module not found.

- [ ] **Step 3: Implement `src/domain/v2/llm-prompts.ts`**

```typescript
export type LlmScorableItemCode = "K3" | "K4" | "C1" | "C3" | "H2" | "G2";

export interface LlmPromptPayload {
  text: string;
}

const SYSTEM_PREFIX = `你是 AI 训练营评分助手。根据学员的提交内容判断是否合格。
必须只输出严格 JSON,格式: {"pass": boolean, "score": number, "reason": string}
reason 必须用中文口语化表达,便于学员理解。`;

const ITEM_BODIES: Record<LlmScorableItemCode, string> = {
  K3: `评分项: K3 知识总结打卡
合格标准:
1. 有明确的 AI 相关知识点(至少 1 个)
2. 用学员自己的话表达,不是复制粘贴官方定义
3. 字数 >= 30
满分 3, 不合格 0。`,
  K4: `评分项: K4 AI 纠错或补充
合格标准:
1. 指出 AI 输出的具体错误或遗漏
2. 有明确的纠正或补充内容
3. 不是笼统的"AI 说错了"
满分 4, 不合格 0。`,
  C1: `评分项: C1 AI 创意用法
合格标准:
1. 描述一个具体的 AI 应用场景或新玩法
2. 有可执行性(不是空想)
3. 和学员本职工作或日常生活相关
满分 4, 不合格 0。`,
  C3: `评分项: C3 自创提示词模板
合格标准:
1. 模板有明确的结构(角色 / 任务 / 约束 / 输出 至少覆盖其中 2 项)
2. 可复用,不绑定单次对话
3. 有具体场景说明
满分 5, 不合格 0。`,
  H2: `评分项: H2 AI 实操分享
合格标准:
1. 描述清楚用了什么 AI 工具
2. 描述清楚做了什么任务
3. 描述清楚结果如何
满分 3, 不合格 0。`,
  G2: `评分项: G2 课外好资源
合格标准:
1. 链接或内容确实和 AI 相关
2. 有简单的为什么推荐(至少一句话理由)
3. 不是纯广告
满分 3, 不合格 0。`
};

export function renderPrompt(
  itemCode: LlmScorableItemCode,
  payload: LlmPromptPayload
): string {
  const body = ITEM_BODIES[itemCode];
  if (!body) {
    throw new Error(`unknown llm item code: ${itemCode}`);
  }
  const safeText = payload.text ?? "";
  return `${SYSTEM_PREFIX}\n\n${body}\n学员提交:\n"""\n${safeText}\n"""`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/domain/v2/llm-prompts.test.ts`
Expected: PASS — all 8 assertions green.

- [ ] **Step 5: Commit**

```bash
git add src/domain/v2/llm-prompts.ts tests/domain/v2/llm-prompts.test.ts
git commit -m "feat(v2): add 6 LLM scoring prompt templates"
```

---

### Task D2: `aggregator.ts` — ScoringAggregator decision application

**Files:**
- Create: `src/domain/v2/aggregator.ts`
- Test: `tests/domain/v2/aggregator.test.ts`

The aggregator owns every transition into and out of `approved` status for a `scoring_item_events` row. It is the only component allowed to mutate `member_dimension_scores`. Every call is wrapped in `runInTransaction` so the status flip and the dimension score increment/decrement commit together.

- [ ] **Step 1: Write failing test**

Create `tests/domain/v2/aggregator.test.ts`:

```typescript
import { beforeEach, describe, expect, test, vi } from "vitest";

import { ScoringAggregator } from "../../../src/domain/v2/aggregator.js";
import type { AggregatorDeps } from "../../../src/domain/v2/aggregator.js";

interface StoredEvent {
  id: string;
  memberId: string;
  periodId: string;
  itemCode: string;
  dimension: "K" | "H" | "C" | "S" | "G";
  scoreDelta: number;
  status: "pending" | "approved" | "rejected" | "review_required";
  reviewNote: string | null;
  decidedAt: string | null;
}

function makeDeps(initial: StoredEvent): {
  deps: AggregatorDeps;
  state: { event: StoredEvent; increments: number; decrements: number };
} {
  const state = {
    event: { ...initial },
    increments: 0,
    decrements: 0
  };
  const deps: AggregatorDeps = {
    findEventById: vi.fn((id: string) =>
      state.event.id === id ? { ...state.event } : null
    ),
    updateEventStatus: vi.fn(
      (
        id: string,
        status: StoredEvent["status"],
        note: string | null,
        decidedAt: string
      ) => {
        if (state.event.id !== id) return;
        state.event = {
          ...state.event,
          status,
          reviewNote: note,
          decidedAt
        };
      }
    ),
    incrementMemberDimensionScore: vi.fn(
      (_memberId: string, _periodId: string, _dim: string, delta: number) => {
        state.increments += delta;
      }
    ),
    decrementMemberDimensionScore: vi.fn(
      (_memberId: string, _periodId: string, _dim: string, delta: number) => {
        state.decrements += delta;
      }
    ),
    runInTransaction: vi.fn(<T>(fn: () => T) => fn()),
    now: () => "2026-04-10T00:00:00.000Z"
  };
  return { deps, state };
}

function baseEvent(overrides: Partial<StoredEvent> = {}): StoredEvent {
  return {
    id: "evt-1",
    memberId: "member-1",
    periodId: "period-1",
    itemCode: "K3",
    dimension: "K",
    scoreDelta: 3,
    status: "pending",
    reviewNote: null,
    decidedAt: null,
    ...overrides
  };
}

describe("ScoringAggregator.applyDecision", () => {
  test("pending -> approved increments dimension score", () => {
    const { deps, state } = makeDeps(baseEvent());
    const agg = new ScoringAggregator(deps);
    agg.applyDecision("evt-1", "approved");
    expect(state.event.status).toBe("approved");
    expect(state.increments).toBe(3);
    expect(state.decrements).toBe(0);
  });

  test("pending -> review_required does not touch dimension scores", () => {
    const { deps, state } = makeDeps(baseEvent());
    const agg = new ScoringAggregator(deps);
    agg.applyDecision("evt-1", "review_required", "low quality");
    expect(state.event.status).toBe("review_required");
    expect(state.event.reviewNote).toBe("low quality");
    expect(state.increments).toBe(0);
    expect(state.decrements).toBe(0);
  });

  test("pending -> rejected does not touch dimension scores", () => {
    const { deps, state } = makeDeps(baseEvent());
    const agg = new ScoringAggregator(deps);
    agg.applyDecision("evt-1", "rejected", "per_period_cap_exceeded");
    expect(state.event.status).toBe("rejected");
    expect(state.increments).toBe(0);
    expect(state.decrements).toBe(0);
  });

  test("approved -> review_required decrements dimension score", () => {
    const { deps, state } = makeDeps(baseEvent({ status: "approved" }));
    const agg = new ScoringAggregator(deps);
    agg.applyDecision("evt-1", "review_required", "operator rollback");
    expect(state.event.status).toBe("review_required");
    expect(state.decrements).toBe(3);
    expect(state.increments).toBe(0);
  });

  test("review_required -> approved increments dimension score", () => {
    const { deps, state } = makeDeps(baseEvent({ status: "review_required" }));
    const agg = new ScoringAggregator(deps);
    agg.applyDecision("evt-1", "approved", "operator override");
    expect(state.event.status).toBe("approved");
    expect(state.increments).toBe(3);
    expect(state.decrements).toBe(0);
  });

  test("idempotent no-op when status already matches", () => {
    const { deps, state } = makeDeps(baseEvent({ status: "approved" }));
    const agg = new ScoringAggregator(deps);
    agg.applyDecision("evt-1", "approved");
    expect(state.increments).toBe(0);
    expect(state.decrements).toBe(0);
    expect(deps.updateEventStatus).not.toHaveBeenCalled();
  });

  test("throws when event id is not found", () => {
    const { deps } = makeDeps(baseEvent());
    const agg = new ScoringAggregator(deps);
    expect(() => agg.applyDecision("missing", "approved")).toThrow(/not found/i);
  });

  test("wraps work inside runInTransaction", () => {
    const { deps } = makeDeps(baseEvent());
    const agg = new ScoringAggregator(deps);
    agg.applyDecision("evt-1", "approved");
    expect(deps.runInTransaction).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/domain/v2/aggregator.test.ts`
Expected: FAIL — `src/domain/v2/aggregator.js` module not found.

- [ ] **Step 3: Implement `src/domain/v2/aggregator.ts`**

```typescript
import type { ScoringDimension } from "./scoring-items-config.js";

export type ScoringEventStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "review_required";

export type FinalDecision = "approved" | "rejected" | "review_required";

export interface AggregatorEvent {
  id: string;
  memberId: string;
  periodId: string;
  itemCode: string;
  dimension: ScoringDimension;
  scoreDelta: number;
  status: ScoringEventStatus;
  reviewNote: string | null;
  decidedAt: string | null;
}

export interface AggregatorDeps {
  findEventById(id: string): AggregatorEvent | null;
  updateEventStatus(
    id: string,
    status: ScoringEventStatus,
    note: string | null,
    decidedAt: string
  ): void;
  incrementMemberDimensionScore(
    memberId: string,
    periodId: string,
    dimension: ScoringDimension,
    delta: number
  ): void;
  decrementMemberDimensionScore(
    memberId: string,
    periodId: string,
    dimension: ScoringDimension,
    delta: number
  ): void;
  runInTransaction<T>(fn: () => T): T;
  now(): string;
}

export class ScoringAggregator {
  constructor(private readonly deps: AggregatorDeps) {}

  applyDecision(
    eventId: string,
    decision: FinalDecision,
    note?: string
  ): void {
    this.deps.runInTransaction(() => {
      const event = this.deps.findEventById(eventId);
      if (!event) {
        throw new Error(`scoring event not found: ${eventId}`);
      }
      if (event.status === decision) {
        return;
      }
      const wasApproved = event.status === "approved";
      const willBeApproved = decision === "approved";

      this.deps.updateEventStatus(
        eventId,
        decision,
        note ?? null,
        this.deps.now()
      );

      if (!wasApproved && willBeApproved) {
        this.deps.incrementMemberDimensionScore(
          event.memberId,
          event.periodId,
          event.dimension,
          event.scoreDelta
        );
      } else if (wasApproved && !willBeApproved) {
        this.deps.decrementMemberDimensionScore(
          event.memberId,
          event.periodId,
          event.dimension,
          event.scoreDelta
        );
      }
    });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/domain/v2/aggregator.test.ts`
Expected: PASS — all 8 assertions green.

- [ ] **Step 5: Commit**

```bash
git add src/domain/v2/aggregator.ts tests/domain/v2/aggregator.test.ts
git commit -m "feat(v2): add ScoringAggregator for decision application"
```

---

### Task D3: `ingestor.ts` — EventIngestor 10-step pipeline

**Files:**
- Create: `src/domain/v2/ingestor.ts`
- Test: `tests/domain/v2/ingestor.test.ts`

This is the single entry point the card-interaction callbacks, C2 reaction tracker, and operator manual scoring all feed through. It runs the full 10-step pipeline from spec §3.3: eligibility → active period → cap lookup (approved + pending) → clamp → idempotency → insert event → for LLM items enqueue `llm_scoring_tasks`, for non-LLM items sync-increment `member_dimension_scores`. Everything lives inside one `runInTransaction` call so either all rows commit or none do.

- [ ] **Step 1: Write failing test**

Create `tests/domain/v2/ingestor.test.ts`:

```typescript
import { beforeEach, describe, expect, test, vi } from "vitest";

import { EventIngestor } from "../../../src/domain/v2/ingestor.js";
import type { IngestorDeps, IngestInput } from "../../../src/domain/v2/ingestor.js";
import type { EligibilityInput } from "../../../src/domain/v2/eligibility.js";

interface MemberRow extends EligibilityInput {
  id: string;
}

interface PeriodRow {
  id: string;
  campId: string;
  number: number;
  isIceBreaker: boolean;
  endedAt: string | null;
}

interface EventRow {
  id: string;
  memberId: string;
  periodId: string;
  itemCode: string;
  scoreDelta: number;
  sourceRef: string;
  status: "pending" | "approved" | "rejected" | "review_required";
  llmTaskId: string | null;
  reviewNote: string | null;
}

interface DimRow {
  memberId: string;
  periodId: string;
  dimension: "K" | "H" | "C" | "S" | "G";
  periodScore: number;
}

interface LlmTaskRow {
  id: string;
  eventId: string;
  promptText: string;
  status: "pending";
}

interface TestState {
  members: Map<string, MemberRow>;
  activePeriod: PeriodRow | null;
  events: EventRow[];
  dims: DimRow[];
  llmTasks: LlmTaskRow[];
  nextEventSeq: number;
  nextTaskSeq: number;
}

function makeState(): TestState {
  return {
    members: new Map([
      [
        "member-1",
        {
          id: "member-1",
          roleType: "student",
          isParticipant: true,
          isExcludedFromBoard: false
        }
      ]
    ]),
    activePeriod: {
      id: "period-1",
      campId: "camp-1",
      number: 2,
      isIceBreaker: false,
      endedAt: null
    },
    events: [],
    dims: [],
    llmTasks: [],
    nextEventSeq: 1,
    nextTaskSeq: 1
  };
}

function makeDeps(state: TestState): IngestorDeps {
  return {
    findMemberById: vi.fn((id: string) => state.members.get(id) ?? null),
    findActivePeriod: vi.fn(() => state.activePeriod),
    sumApprovedScoreDelta: vi.fn(
      (memberId: string, periodId: string, itemCode: string) =>
        state.events
          .filter(
            (e) =>
              e.memberId === memberId &&
              e.periodId === periodId &&
              e.itemCode === itemCode &&
              e.status === "approved"
          )
          .reduce((acc, e) => acc + e.scoreDelta, 0)
    ),
    sumPendingScoreDelta: vi.fn(
      (memberId: string, periodId: string, itemCode: string) =>
        state.events
          .filter(
            (e) =>
              e.memberId === memberId &&
              e.periodId === periodId &&
              e.itemCode === itemCode &&
              e.status === "pending"
          )
          .reduce((acc, e) => acc + e.scoreDelta, 0)
    ),
    findEventBySourceRef: vi.fn(
      (memberId: string, periodId: string, itemCode: string, sourceRef: string) =>
        state.events.find(
          (e) =>
            e.memberId === memberId &&
            e.periodId === periodId &&
            e.itemCode === itemCode &&
            e.sourceRef === sourceRef
        ) ?? null
    ),
    insertScoringEvent: vi.fn((row) => {
      const id = `evt-${state.nextEventSeq++}`;
      state.events.push({ ...row, id, llmTaskId: null });
      return id;
    }),
    incrementMemberDimensionScore: vi.fn(
      (memberId: string, periodId: string, dimension: DimRow["dimension"], delta: number) => {
        const existing = state.dims.find(
          (d) =>
            d.memberId === memberId &&
            d.periodId === periodId &&
            d.dimension === dimension
        );
        if (existing) {
          existing.periodScore += delta;
        } else {
          state.dims.push({ memberId, periodId, dimension, periodScore: delta });
        }
      }
    ),
    insertLlmScoringTask: vi.fn(
      (row: { eventId: string; promptText: string; provider: string; model: string }) => {
        const id = `task-${state.nextTaskSeq++}`;
        state.llmTasks.push({
          id,
          eventId: row.eventId,
          promptText: row.promptText,
          status: "pending"
        });
        return id;
      }
    ),
    linkEventToLlmTask: vi.fn((eventId: string, taskId: string) => {
      const evt = state.events.find((e) => e.id === eventId);
      if (evt) evt.llmTaskId = taskId;
    }),
    provider: "fake",
    model: "fake-model",
    runInTransaction: vi.fn(<T>(fn: () => T) => fn()),
    now: () => "2026-04-10T00:00:00.000Z",
    generateId: () => "gen-id"
  };
}

function ingest(overrides: Partial<IngestInput> = {}): IngestInput {
  return {
    memberId: "member-1",
    itemCode: "K1",
    scoreDelta: 3,
    sourceRef: "src-1",
    ...overrides
  };
}

describe("EventIngestor.ingest", () => {
  let state: TestState;
  let ingestor: EventIngestor;

  beforeEach(() => {
    state = makeState();
    ingestor = new EventIngestor(makeDeps(state));
  });

  test("accepts non-LLM item and writes approved event + dimension score", () => {
    const result = ingestor.ingest(ingest({ itemCode: "K1", scoreDelta: 3 }));
    expect(result.accepted).toBe(true);
    expect(state.events).toHaveLength(1);
    expect(state.events[0].status).toBe("approved");
    const k = state.dims.find((d) => d.dimension === "K");
    expect(k?.periodScore).toBe(3);
  });

  test("rejects when member is not eligible", () => {
    state.members.set("member-1", {
      id: "member-1",
      roleType: "operator",
      isParticipant: true,
      isExcludedFromBoard: false
    });
    const result = ingestor.ingest(ingest());
    expect(result.accepted).toBe(false);
    expect(result.reason).toBe("not_eligible");
    expect(state.events).toHaveLength(0);
  });

  test("rejects when there is no active period", () => {
    state.activePeriod = null;
    const result = ingestor.ingest(ingest());
    expect(result.accepted).toBe(false);
    expect(result.reason).toBe("no_active_period");
  });

  test("rejects when active period is ice-breaker", () => {
    state.activePeriod = {
      id: "period-ice",
      campId: "camp-1",
      number: 1,
      isIceBreaker: true,
      endedAt: null
    };
    const result = ingestor.ingest(ingest());
    expect(result.accepted).toBe(false);
    expect(result.reason).toBe("ice_breaker_no_scoring");
  });

  test("inserts rejected zero-delta row when cap is already exhausted", () => {
    state.events.push({
      id: "evt-seed",
      memberId: "member-1",
      periodId: "period-1",
      itemCode: "K1",
      scoreDelta: 3,
      sourceRef: "src-seed",
      status: "approved",
      llmTaskId: null,
      reviewNote: null
    });
    const result = ingestor.ingest(ingest({ sourceRef: "src-2" }));
    expect(result.accepted).toBe(false);
    expect(result.reason).toBe("cap_exceeded");
    const rejected = state.events.find((e) => e.status === "rejected");
    expect(rejected).toBeDefined();
    expect(rejected?.scoreDelta).toBe(0);
    expect(rejected?.reviewNote).toBe("per_period_cap_exceeded");
  });

  test("clamps effective delta when remaining is smaller than requested", () => {
    state.events.push({
      id: "evt-seed",
      memberId: "member-1",
      periodId: "period-1",
      itemCode: "C1",
      scoreDelta: 5,
      sourceRef: "src-seed",
      status: "approved",
      llmTaskId: null,
      reviewNote: null
    });
    const result = ingestor.ingest(
      ingest({ itemCode: "C1", scoreDelta: 4, sourceRef: "src-2" })
    );
    expect(result.accepted).toBe(true);
    const fresh = state.events.find((e) => e.sourceRef === "src-2");
    expect(fresh?.scoreDelta).toBe(3);
  });

  test("pending sum counts against cap for the same item", () => {
    state.events.push({
      id: "evt-seed",
      memberId: "member-1",
      periodId: "period-1",
      itemCode: "K3",
      scoreDelta: 3,
      sourceRef: "src-seed",
      status: "pending",
      llmTaskId: null,
      reviewNote: null
    });
    const result = ingestor.ingest(
      ingest({ itemCode: "K3", scoreDelta: 3, sourceRef: "src-2", payloadText: "new submission 30chars................" })
    );
    expect(result.accepted).toBe(false);
    expect(result.reason).toBe("cap_exceeded");
  });

  test("rejects duplicate sourceRef for the same member/period/item", () => {
    const first = ingestor.ingest(ingest({ itemCode: "K1", sourceRef: "dup-ref" }));
    expect(first.accepted).toBe(true);
    const second = ingestor.ingest(ingest({ itemCode: "K1", sourceRef: "dup-ref" }));
    expect(second.accepted).toBe(false);
    expect(second.reason).toBe("duplicate");
    expect(state.events.filter((e) => e.sourceRef === "dup-ref")).toHaveLength(1);
  });

  test("LLM item K3 creates pending event, enqueues task, and does NOT increment dimension score", () => {
    const result = ingestor.ingest(
      ingest({
        itemCode: "K3",
        scoreDelta: 3,
        sourceRef: "src-llm",
        payloadText: "今天学到了 attention 的 QKV 机制,和 CNN 的卷积核很不一样"
      })
    );
    expect(result.accepted).toBe(true);
    expect(state.events[0].status).toBe("pending");
    expect(state.llmTasks).toHaveLength(1);
    expect(state.llmTasks[0].eventId).toBe(state.events[0].id);
    expect(state.events[0].llmTaskId).toBe(state.llmTasks[0].id);
    expect(state.dims.find((d) => d.dimension === "K")).toBeUndefined();
  });

  test("LLM item G2 freezes prompt text into llm_scoring_tasks.prompt_text", () => {
    const result = ingestor.ingest(
      ingest({
        itemCode: "G2",
        scoreDelta: 3,
        sourceRef: "src-g2",
        payloadText: "https://example.com 推荐这个 AI 博客,内容很硬核"
      })
    );
    expect(result.accepted).toBe(true);
    expect(state.llmTasks[0].promptText).toContain("G2 课外好资源");
    expect(state.llmTasks[0].promptText).toContain("https://example.com");
  });

  test("throws for unknown item code", () => {
    expect(() =>
      ingestor.ingest(
        ingest({ itemCode: "ZZ" as IngestInput["itemCode"], sourceRef: "src-zz" })
      )
    ).toThrow(/unknown/i);
  });

  test("runs the whole pipeline inside runInTransaction", () => {
    const deps = makeDeps(state);
    const spyIngestor = new EventIngestor(deps);
    spyIngestor.ingest(ingest({ itemCode: "K1", sourceRef: "src-tx" }));
    expect(deps.runInTransaction).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/domain/v2/ingestor.test.ts`
Expected: FAIL — `src/domain/v2/ingestor.js` module not found.

- [ ] **Step 3: Implement `src/domain/v2/ingestor.ts`**

```typescript
import {
  SCORING_ITEMS,
  type ScoringDimension,
  type ScoringItemCode,
  type ScoringSourceType
} from "./scoring-items-config.js";
import { isEligibleStudent, type EligibilityInput } from "./eligibility.js";
import { renderPrompt, type LlmScorableItemCode } from "./llm-prompts.js";

export type IngestResult =
  | { accepted: true; eventId: string; effectiveDelta: number; enqueuedLlmTaskId: string | null }
  | {
      accepted: false;
      reason:
        | "not_eligible"
        | "no_active_period"
        | "ice_breaker_no_scoring"
        | "cap_exceeded"
        | "duplicate";
    };

export interface IngestInput {
  memberId: string;
  itemCode: ScoringItemCode;
  scoreDelta: number;
  sourceRef: string;
  sourceType?: ScoringSourceType;
  payloadText?: string;
}

export interface IngestorPeriod {
  id: string;
  campId: string;
  number: number;
  isIceBreaker: boolean;
  endedAt: string | null;
}

export interface IngestorEventInsert {
  memberId: string;
  periodId: string;
  itemCode: ScoringItemCode;
  dimension: ScoringDimension;
  scoreDelta: number;
  sourceType: ScoringSourceType;
  sourceRef: string;
  status: "pending" | "approved" | "rejected";
  reviewNote: string | null;
  createdAt: string;
}

export interface IngestorLlmTaskInsert {
  eventId: string;
  provider: string;
  model: string;
  promptText: string;
  enqueuedAt: string;
}

export interface IngestorDeps {
  findMemberById(id: string): (EligibilityInput & { id: string }) | null;
  findActivePeriod(): IngestorPeriod | null;
  sumApprovedScoreDelta(
    memberId: string,
    periodId: string,
    itemCode: ScoringItemCode
  ): number;
  sumPendingScoreDelta(
    memberId: string,
    periodId: string,
    itemCode: ScoringItemCode
  ): number;
  findEventBySourceRef(
    memberId: string,
    periodId: string,
    itemCode: ScoringItemCode,
    sourceRef: string
  ): { id: string } | null;
  insertScoringEvent(row: IngestorEventInsert): string;
  incrementMemberDimensionScore(
    memberId: string,
    periodId: string,
    dimension: ScoringDimension,
    delta: number
  ): void;
  insertLlmScoringTask(row: IngestorLlmTaskInsert): string;
  linkEventToLlmTask(eventId: string, taskId: string): void;
  runInTransaction<T>(fn: () => T): T;
  now(): string;
  generateId(): string;
  provider: string;
  model: string;
}

const LLM_ITEM_CODES: ReadonlySet<string> = new Set([
  "K3",
  "K4",
  "C1",
  "C3",
  "H2",
  "G2"
]);

export class EventIngestor {
  constructor(private readonly deps: IngestorDeps) {}

  ingest(input: IngestInput): IngestResult {
    return this.deps.runInTransaction(() => this.runPipeline(input));
  }

  private runPipeline(input: IngestInput): IngestResult {
    const config = SCORING_ITEMS[input.itemCode];
    if (!config) {
      throw new Error(`unknown scoring item code: ${input.itemCode}`);
    }

    const member = this.deps.findMemberById(input.memberId);
    if (!isEligibleStudent(member)) {
      return { accepted: false, reason: "not_eligible" };
    }

    const period = this.deps.findActivePeriod();
    if (!period) {
      return { accepted: false, reason: "no_active_period" };
    }
    if (period.isIceBreaker) {
      return { accepted: false, reason: "ice_breaker_no_scoring" };
    }

    const approvedSum = this.deps.sumApprovedScoreDelta(
      input.memberId,
      period.id,
      input.itemCode
    );
    const pendingSum = this.deps.sumPendingScoreDelta(
      input.memberId,
      period.id,
      input.itemCode
    );
    const remaining = config.perPeriodCap - approvedSum - pendingSum;
    if (remaining <= 0) {
      this.deps.insertScoringEvent({
        memberId: input.memberId,
        periodId: period.id,
        itemCode: input.itemCode,
        dimension: config.dimension,
        scoreDelta: 0,
        sourceType: input.sourceType ?? config.sourceType,
        sourceRef: input.sourceRef,
        status: "rejected",
        reviewNote: "per_period_cap_exceeded",
        createdAt: this.deps.now()
      });
      return { accepted: false, reason: "cap_exceeded" };
    }

    const effectiveDelta = Math.min(input.scoreDelta, remaining);

    const duplicate = this.deps.findEventBySourceRef(
      input.memberId,
      period.id,
      input.itemCode,
      input.sourceRef
    );
    if (duplicate) {
      return { accepted: false, reason: "duplicate" };
    }

    const needsLlm = config.needsLlm;
    const status: "pending" | "approved" = needsLlm ? "pending" : "approved";

    const eventId = this.deps.insertScoringEvent({
      memberId: input.memberId,
      periodId: period.id,
      itemCode: input.itemCode,
      dimension: config.dimension,
      scoreDelta: effectiveDelta,
      sourceType: input.sourceType ?? config.sourceType,
      sourceRef: input.sourceRef,
      status,
      reviewNote: null,
      createdAt: this.deps.now()
    });

    let enqueuedLlmTaskId: string | null = null;

    if (needsLlm) {
      const promptText = renderPrompt(input.itemCode as LlmScorableItemCode, {
        text: input.payloadText ?? ""
      });
      enqueuedLlmTaskId = this.deps.insertLlmScoringTask({
        eventId,
        provider: this.deps.provider,
        model: this.deps.model,
        promptText,
        enqueuedAt: this.deps.now()
      });
      this.deps.linkEventToLlmTask(eventId, enqueuedLlmTaskId);
    } else {
      this.deps.incrementMemberDimensionScore(
        input.memberId,
        period.id,
        config.dimension,
        effectiveDelta
      );
    }

    return { accepted: true, eventId, effectiveDelta, enqueuedLlmTaskId };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/domain/v2/ingestor.test.ts`
Expected: PASS — all 12 assertions green.

- [ ] **Step 5: Commit**

```bash
git add src/domain/v2/ingestor.ts tests/domain/v2/ingestor.test.ts
git commit -m "feat(v2): add EventIngestor with cap clamping and LLM enqueue"
```

---

## Phase D Exit Checkpoint

Run the full suite and build:
```bash
npm test
npm run build
```
Expected: both green. Ingestion pipeline is complete — every scoring event can flow from its raw input to either an approved `v2_scoring_item_events` row with a matching `v2_member_dimension_scores` increment, or a pending row with a linked `v2_llm_scoring_tasks` row. The aggregator can later flip the pending rows through `applyDecision`. No live LLM client is wired in yet — that comes in Phase E.

---

## Phase E — LLM Async Worker (5 tasks)

Build the async LLM scoring worker from the ground up: the rate limiter, the semaphore, the client interface with a fake, a real HTTP implementation, and the worker event loop that ties it all together.

---

### Task E1: `token-bucket.ts` — leaky-bucket rate limiter

**Files:**
- Create: `src/services/v2/token-bucket.ts`
- Test: `tests/services/v2/token-bucket.test.ts`

The worker calls `await tokenBucket.acquire()` before each LLM request to enforce `LLM_RATE_LIMIT_PER_SEC`. Implementation is a leaky bucket with `setTimeout` — refills continuously at `ratePerSec` tokens/sec up to a capacity.

- [ ] **Step 1: Write failing test**

Create `tests/services/v2/token-bucket.test.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { TokenBucket } from "../../../src/services/v2/token-bucket.js";

describe("TokenBucket", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("first acquire resolves immediately when capacity allows", async () => {
    const bucket = new TokenBucket(5);
    const p = bucket.acquire();
    await vi.advanceTimersByTimeAsync(0);
    await expect(p).resolves.toBeUndefined();
  });

  test("acquiring more than capacity queues additional waiters", async () => {
    const bucket = new TokenBucket(2, 2);
    const order: number[] = [];
    const wait = (n: number) =>
      bucket.acquire().then(() => {
        order.push(n);
      });
    void wait(1);
    void wait(2);
    void wait(3);
    await vi.advanceTimersByTimeAsync(0);
    expect(order).toEqual([1, 2]);
    await vi.advanceTimersByTimeAsync(500);
    expect(order).toEqual([1, 2, 3]);
  });

  test("rate limit 1/sec serializes 3 acquires across ~2 seconds", async () => {
    const bucket = new TokenBucket(1, 1);
    const stamps: number[] = [];
    const wait = () =>
      bucket.acquire().then(() => {
        stamps.push(Date.now());
      });
    const p1 = wait();
    const p2 = wait();
    const p3 = wait();
    await vi.advanceTimersByTimeAsync(0);
    expect(stamps).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(stamps).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1000);
    expect(stamps).toHaveLength(3);
    await Promise.all([p1, p2, p3]);
  });

  test("acquire(n) consumes n tokens at once", async () => {
    const bucket = new TokenBucket(2, 4);
    await bucket.acquire(4);
    const p = bucket.acquire(1);
    let resolved = false;
    void p.then(() => {
      resolved = true;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(resolved).toBe(false);
    await vi.advanceTimersByTimeAsync(500);
    expect(resolved).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/services/v2/token-bucket.test.ts`
Expected: FAIL — `src/services/v2/token-bucket.js` module not found.

- [ ] **Step 3: Implement `src/services/v2/token-bucket.ts`**

```typescript
interface Waiter {
  cost: number;
  resolve: () => void;
}

export class TokenBucket {
  private readonly ratePerSec: number;
  private readonly capacity: number;
  private tokens: number;
  private lastRefillAtMs: number;
  private readonly queue: Waiter[] = [];
  private scheduledAtMs: number | null = null;

  constructor(ratePerSec: number, capacity?: number) {
    if (ratePerSec <= 0) {
      throw new Error("ratePerSec must be > 0");
    }
    this.ratePerSec = ratePerSec;
    this.capacity = capacity ?? ratePerSec;
    this.tokens = this.capacity;
    this.lastRefillAtMs = Date.now();
  }

  acquire(n: number = 1): Promise<void> {
    if (n <= 0) {
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      this.queue.push({ cost: n, resolve });
      this.drain();
    });
  }

  private refill(): void {
    const nowMs = Date.now();
    const elapsedSec = (nowMs - this.lastRefillAtMs) / 1000;
    if (elapsedSec > 0) {
      this.tokens = Math.min(
        this.capacity,
        this.tokens + elapsedSec * this.ratePerSec
      );
      this.lastRefillAtMs = nowMs;
    }
  }

  private drain(): void {
    this.refill();
    while (this.queue.length > 0) {
      const head = this.queue[0];
      if (this.tokens >= head.cost) {
        this.tokens -= head.cost;
        this.queue.shift();
        head.resolve();
      } else {
        this.schedule(head.cost);
        return;
      }
    }
  }

  private schedule(cost: number): void {
    const deficit = cost - this.tokens;
    const waitMs = Math.max(1, Math.ceil((deficit / this.ratePerSec) * 1000));
    const targetAt = Date.now() + waitMs;
    if (this.scheduledAtMs !== null && this.scheduledAtMs <= targetAt) {
      return;
    }
    this.scheduledAtMs = targetAt;
    setTimeout(() => {
      this.scheduledAtMs = null;
      this.drain();
    }, waitMs);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/services/v2/token-bucket.test.ts`
Expected: PASS — all 4 assertions green.

- [ ] **Step 5: Commit**

```bash
git add src/services/v2/token-bucket.ts tests/services/v2/token-bucket.test.ts
git commit -m "feat(v2-llm): add TokenBucket rate limiter"
```

---

### Task E2: `semaphore.ts` — concurrency primitive

**Files:**
- Create: `src/services/v2/semaphore.ts`
- Test: `tests/services/v2/semaphore.test.ts`

The worker calls `await semaphore.acquire()` to cap in-flight LLM calls at `LLM_CONCURRENCY`. Waiters are resolved in FIFO order.

- [ ] **Step 1: Write failing test**

Create `tests/services/v2/semaphore.test.ts`:

```typescript
import { describe, expect, test } from "vitest";

import { Semaphore } from "../../../src/services/v2/semaphore.js";

describe("Semaphore", () => {
  test("acquires up to max without blocking", async () => {
    const sem = new Semaphore(3);
    await sem.acquire();
    await sem.acquire();
    await sem.acquire();
    expect(sem.inFlight).toBe(3);
    expect(sem.max).toBe(3);
  });

  test("next acquire blocks until release is called", async () => {
    const sem = new Semaphore(1);
    await sem.acquire();
    let resolved = false;
    const p = sem.acquire().then(() => {
      resolved = true;
    });
    await Promise.resolve();
    expect(resolved).toBe(false);
    sem.release();
    await p;
    expect(resolved).toBe(true);
  });

  test("waiters resolve FIFO", async () => {
    const sem = new Semaphore(1);
    await sem.acquire();
    const order: number[] = [];
    const a = sem.acquire().then(() => order.push(1));
    const b = sem.acquire().then(() => order.push(2));
    const c = sem.acquire().then(() => order.push(3));
    sem.release();
    await a;
    sem.release();
    await b;
    sem.release();
    await c;
    expect(order).toEqual([1, 2, 3]);
  });

  test("release with no in-flight holders throws", () => {
    const sem = new Semaphore(2);
    expect(() => sem.release()).toThrow(/release/i);
  });

  test("inFlight never exceeds max", async () => {
    const sem = new Semaphore(2);
    await sem.acquire();
    await sem.acquire();
    expect(sem.inFlight).toBe(2);
    const p = sem.acquire();
    expect(sem.inFlight).toBe(2);
    sem.release();
    await p;
    expect(sem.inFlight).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/services/v2/semaphore.test.ts`
Expected: FAIL — `src/services/v2/semaphore.js` module not found.

- [ ] **Step 3: Implement `src/services/v2/semaphore.ts`**

```typescript
type Waiter = () => void;

export class Semaphore {
  private readonly _max: number;
  private _inFlight: number = 0;
  private readonly queue: Waiter[] = [];

  constructor(max: number) {
    if (max <= 0) {
      throw new Error("max must be > 0");
    }
    this._max = max;
  }

  get max(): number {
    return this._max;
  }

  get inFlight(): number {
    return this._inFlight;
  }

  acquire(): Promise<void> {
    if (this._inFlight < this._max) {
      this._inFlight += 1;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      this.queue.push(resolve);
    });
  }

  release(): void {
    if (this._inFlight === 0) {
      throw new Error("semaphore release called with no in-flight holders");
    }
    const next = this.queue.shift();
    if (next) {
      next();
      return;
    }
    this._inFlight -= 1;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/services/v2/semaphore.test.ts`
Expected: PASS — all 5 assertions green.

- [ ] **Step 5: Commit**

```bash
git add src/services/v2/semaphore.ts tests/services/v2/semaphore.test.ts
git commit -m "feat(v2-llm): add Semaphore concurrency primitive"
```

---

### Task E3: `llm-scoring-client.ts` — interface + FakeLlmScoringClient

**Files:**
- Create: `src/services/v2/llm-scoring-client.ts`
- Test: `tests/services/v2/llm-scoring-client.test.ts`

Define the single interface the worker talks to, plus a fake implementation that unit tests can program. The fake supports queue mode (pop from a `responses` array) and function mode (`provider` callback) plus an optional `delayMs` so tests can simulate latency under fake timers.

- [ ] **Step 1: Write failing test**

Create `tests/services/v2/llm-scoring-client.test.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
  FakeLlmScoringClient,
  type LlmScoringResult
} from "../../../src/services/v2/llm-scoring-client.js";
import { LlmRetryableError } from "../../../src/domain/v2/errors.js";

function ok(score: number): LlmScoringResult {
  return { pass: true, score, reason: "ok", raw: {} };
}

describe("FakeLlmScoringClient", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test("queue mode pops responses in order", async () => {
    const client = new FakeLlmScoringClient({
      responses: [ok(1), ok(2), ok(3)]
    });
    const a = await client.score("prompt", { timeoutMs: 1000 });
    const b = await client.score("prompt", { timeoutMs: 1000 });
    const c = await client.score("prompt", { timeoutMs: 1000 });
    expect(a.score).toBe(1);
    expect(b.score).toBe(2);
    expect(c.score).toBe(3);
  });

  test("queue mode throws when exhausted", async () => {
    const client = new FakeLlmScoringClient({ responses: [] });
    await expect(
      client.score("prompt", { timeoutMs: 1000 })
    ).rejects.toThrow(/fake queue exhausted/i);
  });

  test("function mode calls provider callback with prompt", async () => {
    const fn = vi.fn((prompt: string) =>
      Promise.resolve<LlmScoringResult>({
        pass: prompt.includes("good"),
        score: prompt.length,
        reason: "computed",
        raw: {}
      })
    );
    const client = new FakeLlmScoringClient({ provider: fn });
    const result = await client.score("good prompt", { timeoutMs: 1000 });
    expect(result.pass).toBe(true);
    expect(result.score).toBe("good prompt".length);
    expect(fn).toHaveBeenCalledWith("good prompt");
  });

  test("delayMs option delays resolution", async () => {
    const client = new FakeLlmScoringClient({
      responses: [ok(1)],
      delayMs: 500
    });
    const p = client.score("prompt", { timeoutMs: 1000 });
    let resolved = false;
    void p.then(() => {
      resolved = true;
    });
    await vi.advanceTimersByTimeAsync(499);
    expect(resolved).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(resolved).toBe(true);
  });

  test("function mode can throw retryable error", async () => {
    const client = new FakeLlmScoringClient({
      provider: () => {
        throw new LlmRetryableError("network");
      }
    });
    await expect(
      client.score("prompt", { timeoutMs: 1000 })
    ).rejects.toBeInstanceOf(LlmRetryableError);
  });

  test("exposes provider and model for task logging", () => {
    const client = new FakeLlmScoringClient({
      responses: [],
      provider_name: "fake",
      model: "fake-v1"
    });
    expect(client.provider).toBe("fake");
    expect(client.model).toBe("fake-v1");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/services/v2/llm-scoring-client.test.ts`
Expected: FAIL — `src/services/v2/llm-scoring-client.js` module not found.

- [ ] **Step 3: Implement `src/services/v2/llm-scoring-client.ts`**

```typescript
export interface LlmScoringResult {
  pass: boolean;
  score: number;
  reason: string;
  raw: unknown;
}

export interface LlmScoringOptions {
  timeoutMs: number;
  signal?: AbortSignal;
}

export interface LlmScoringClient {
  readonly provider: string;
  readonly model: string;
  score(promptText: string, options: LlmScoringOptions): Promise<LlmScoringResult>;
}

export type FakeProviderFn = (prompt: string) => Promise<LlmScoringResult> | LlmScoringResult;

export interface FakeLlmScoringClientOptions {
  responses?: LlmScoringResult[];
  provider?: FakeProviderFn;
  delayMs?: number;
  provider_name?: string;
  model?: string;
}

export class FakeLlmScoringClient implements LlmScoringClient {
  readonly provider: string;
  readonly model: string;
  private readonly queue: LlmScoringResult[];
  private readonly providerFn: FakeProviderFn | null;
  private readonly delayMs: number;

  constructor(options: FakeLlmScoringClientOptions) {
    this.provider = options.provider_name ?? "fake";
    this.model = options.model ?? "fake-v1";
    this.queue = options.responses ? [...options.responses] : [];
    this.providerFn = options.provider ?? null;
    this.delayMs = options.delayMs ?? 0;
  }

  async score(
    promptText: string,
    _options: LlmScoringOptions
  ): Promise<LlmScoringResult> {
    if (this.delayMs > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, this.delayMs));
    }
    if (this.providerFn) {
      return await this.providerFn(promptText);
    }
    const next = this.queue.shift();
    if (!next) {
      throw new Error("fake queue exhausted");
    }
    return next;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/services/v2/llm-scoring-client.test.ts`
Expected: PASS — all 6 assertions green.

- [ ] **Step 5: Commit**

```bash
git add src/services/v2/llm-scoring-client.ts tests/services/v2/llm-scoring-client.test.ts
git commit -m "feat(v2-llm): add LlmScoringClient interface and Fake impl"
```

---

### Task E4: `OpenAiCompatibleLlmScoringClient` — real HTTP implementation

**Files:**
- Modify: `src/services/v2/llm-scoring-client.ts` (append class)
- Test: Modify `tests/services/v2/llm-scoring-client.test.ts` (append describe block)

Use Node 22 native `fetch` directly. POST to `{baseUrl}/chat/completions` with `response_format: { type: "json_object" }`. Classify HTTP 5xx, network errors, and AbortError as `LlmRetryableError`; HTTP 4xx, JSON parse failures, and missing required fields as `LlmNonRetryableError`. The worker uses the distinction to decide between requeue and terminal rejection.

- [ ] **Step 1: Append failing test**

Add to `tests/services/v2/llm-scoring-client.test.ts`:

```typescript
import {
  OpenAiCompatibleLlmScoringClient
} from "../../../src/services/v2/llm-scoring-client.js";
import { LlmNonRetryableError } from "../../../src/domain/v2/errors.js";

function makeConfig() {
  return {
    enabled: true,
    provider: "openai_compatible" as const,
    baseUrl: "https://llm.example.com/v1",
    apiKey: "sk-test",
    textModel: "test-model",
    fileModel: "",
    fileExtractor: "openai_file_chat" as const,
    fileParserToolType: "lite" as const,
    timeoutMs: 15000,
    maxInputChars: 6000,
    concurrency: 3
  };
}

function fetchOk(body: unknown) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" }
    })
  );
}

describe("OpenAiCompatibleLlmScoringClient", () => {
  test("parses successful JSON-mode response into LlmScoringResult", async () => {
    const body = {
      choices: [
        {
          message: {
            content: JSON.stringify({ pass: true, score: 3, reason: "good" })
          }
        }
      ]
    };
    const spy = vi.spyOn(globalThis, "fetch").mockImplementation(() => fetchOk(body));
    const client = new OpenAiCompatibleLlmScoringClient(makeConfig());
    const result = await client.score("prompt", { timeoutMs: 1000 });
    expect(result.pass).toBe(true);
    expect(result.score).toBe(3);
    expect(result.reason).toBe("good");
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  test("HTTP 500 throws LlmRetryableError", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(() =>
      Promise.resolve(new Response("upstream error", { status: 500 }))
    );
    const client = new OpenAiCompatibleLlmScoringClient(makeConfig());
    await expect(
      client.score("prompt", { timeoutMs: 1000 })
    ).rejects.toBeInstanceOf(LlmRetryableError);
    vi.restoreAllMocks();
  });

  test("HTTP 400 throws LlmNonRetryableError", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(() =>
      Promise.resolve(new Response("bad request", { status: 400 }))
    );
    const client = new OpenAiCompatibleLlmScoringClient(makeConfig());
    await expect(
      client.score("prompt", { timeoutMs: 1000 })
    ).rejects.toBeInstanceOf(LlmNonRetryableError);
    vi.restoreAllMocks();
  });

  test("JSON parse failure throws LlmNonRetryableError", async () => {
    const body = {
      choices: [{ message: { content: "not json at all" } }]
    };
    vi.spyOn(globalThis, "fetch").mockImplementation(() => fetchOk(body));
    const client = new OpenAiCompatibleLlmScoringClient(makeConfig());
    await expect(
      client.score("prompt", { timeoutMs: 1000 })
    ).rejects.toBeInstanceOf(LlmNonRetryableError);
    vi.restoreAllMocks();
  });

  test("network rejection throws LlmRetryableError", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(() =>
      Promise.reject(new TypeError("network unreachable"))
    );
    const client = new OpenAiCompatibleLlmScoringClient(makeConfig());
    await expect(
      client.score("prompt", { timeoutMs: 1000 })
    ).rejects.toBeInstanceOf(LlmRetryableError);
    vi.restoreAllMocks();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/services/v2/llm-scoring-client.test.ts`
Expected: FAIL — `OpenAiCompatibleLlmScoringClient` not exported yet.

- [ ] **Step 3: Append the class to `src/services/v2/llm-scoring-client.ts`**

Add these imports at the top of the existing file:

```typescript
import {
  LlmNonRetryableError,
  LlmRetryableError
} from "../../domain/v2/errors.js";
import type { LlmProviderConfig } from "../llm/provider-config.js";
```

Append at the bottom:

```typescript
interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

export class OpenAiCompatibleLlmScoringClient implements LlmScoringClient {
  readonly provider: string;
  readonly model: string;
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(config: LlmProviderConfig) {
    if (!config.apiKey) {
      throw new Error("LlmProviderConfig.apiKey is required");
    }
    if (!config.baseUrl) {
      throw new Error("LlmProviderConfig.baseUrl is required");
    }
    this.provider = config.provider;
    this.model = config.textModel;
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.apiKey = config.apiKey;
  }

  async score(
    promptText: string,
    options: LlmScoringOptions
  ): Promise<LlmScoringResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs);
    const signal = options.signal
      ? anySignal([options.signal, controller.signal])
      : controller.signal;

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: this.model,
          response_format: { type: "json_object" },
          messages: [{ role: "user", content: promptText }]
        }),
        signal
      });
    } catch (error) {
      clearTimeout(timer);
      throw new LlmRetryableError(
        error instanceof Error ? error.message : "network error"
      );
    }
    clearTimeout(timer);

    if (response.status >= 500) {
      throw new LlmRetryableError(`http ${response.status}`);
    }
    if (response.status === 429) {
      throw new LlmRetryableError("rate limited");
    }
    if (response.status >= 400) {
      throw new LlmNonRetryableError(`http ${response.status}`);
    }

    let body: ChatCompletionResponse;
    try {
      body = (await response.json()) as ChatCompletionResponse;
    } catch (error) {
      throw new LlmNonRetryableError(
        `failed to parse response json: ${error instanceof Error ? error.message : "unknown"}`
      );
    }

    const content = body.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      throw new LlmNonRetryableError("missing choices[0].message.content");
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch (error) {
      throw new LlmNonRetryableError(
        `content is not json: ${error instanceof Error ? error.message : "unknown"}`
      );
    }

    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof (parsed as { pass?: unknown }).pass !== "boolean" ||
      typeof (parsed as { score?: unknown }).score !== "number" ||
      typeof (parsed as { reason?: unknown }).reason !== "string"
    ) {
      throw new LlmNonRetryableError("missing pass/score/reason fields");
    }

    const result = parsed as { pass: boolean; score: number; reason: string };
    return { pass: result.pass, score: result.score, reason: result.reason, raw: body };
  }
}

function anySignal(signals: AbortSignal[]): AbortSignal {
  const controller = new AbortController();
  for (const sig of signals) {
    if (sig.aborted) {
      controller.abort();
      return controller.signal;
    }
    sig.addEventListener("abort", () => controller.abort(), { once: true });
  }
  return controller.signal;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/services/v2/llm-scoring-client.test.ts`
Expected: PASS — 5 new assertions green on top of the existing 6 fake-client tests.

- [ ] **Step 5: Commit**

```bash
git add src/services/v2/llm-scoring-client.ts tests/services/v2/llm-scoring-client.test.ts
git commit -m "feat(v2-llm): add OpenAiCompatibleLlmScoringClient with native fetch"
```

---

### Task E5: `llm-scoring-worker.ts` — event loop with retry and stale reclaim

**Files:**
- Create: `src/services/v2/llm-scoring-worker.ts`
- Test: `tests/services/v2/llm-scoring-worker.test.ts`

The worker is a background poller started by `src/server.ts`. On `start()`, it first reclaims stale `running` tasks older than `2 * taskTimeoutMs` via `requeueStaleRunningTasks`. Then it loops: claim the next pending task, call the client inside the semaphore + token bucket, call `ScoringAggregator.applyDecision` with the decision, handle failure by requeueing with `2 ** attempts` seconds of backoff or marking terminal after `maxAttempts`. `getStatus()` returns worker observability fields per spec §4.8.

- [ ] **Step 1: Write failing test**

Create `tests/services/v2/llm-scoring-worker.test.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
  LlmScoringWorker,
  type WorkerDeps,
  type WorkerConfig
} from "../../../src/services/v2/llm-scoring-worker.js";
import {
  FakeLlmScoringClient,
  type LlmScoringResult
} from "../../../src/services/v2/llm-scoring-client.js";
import {
  LlmNonRetryableError,
  LlmRetryableError
} from "../../../src/domain/v2/errors.js";

interface FakeTaskRow {
  id: string;
  eventId: string;
  promptText: string;
  status: "pending" | "running" | "succeeded" | "failed";
  attempts: number;
  maxAttempts: number;
  enqueuedAtMs: number;
  startedAtMs: number | null;
}

function baseConfig(overrides: Partial<WorkerConfig> = {}): WorkerConfig {
  return {
    concurrency: 1,
    rateLimitPerSec: 10,
    pollIntervalMs: 50,
    taskTimeoutMs: 1000,
    maxAttempts: 3,
    ...overrides
  };
}

function makeDeps(
  tasks: FakeTaskRow[],
  client: FakeLlmScoringClient,
  decisions: string[]
): WorkerDeps {
  return {
    claimNextPendingTask: vi.fn(() => {
      const now = Date.now();
      const idx = tasks.findIndex(
        (t) =>
          t.status === "pending" &&
          t.attempts < t.maxAttempts &&
          t.enqueuedAtMs <= now
      );
      if (idx === -1) return null;
      const task = tasks[idx];
      task.status = "running";
      task.attempts += 1;
      task.startedAtMs = now;
      return {
        id: task.id,
        eventId: task.eventId,
        promptText: task.promptText,
        attempts: task.attempts,
        maxAttempts: task.maxAttempts
      };
    }),
    markTaskSucceeded: vi.fn((taskId: string, _result: LlmScoringResult) => {
      const task = tasks.find((t) => t.id === taskId);
      if (task) task.status = "succeeded";
    }),
    markTaskFailedRetry: vi.fn(
      (taskId: string, _backoffSec: number, _reason: string) => {
        const task = tasks.find((t) => t.id === taskId);
        if (task) {
          task.status = "pending";
          task.enqueuedAtMs = Date.now() + _backoffSec * 1000;
        }
      }
    ),
    markTaskFailedTerminal: vi.fn((taskId: string, _reason: string) => {
      const task = tasks.find((t) => t.id === taskId);
      if (task) task.status = "failed";
    }),
    requeueStaleRunningTasks: vi.fn(
      (_cutoffMs: number): number => 0
    ),
    countPending: vi.fn(() => tasks.filter((t) => t.status === "pending").length),
    countRunning: vi.fn(() => tasks.filter((t) => t.status === "running").length),
    countSucceededLastHour: vi.fn(
      () => tasks.filter((t) => t.status === "succeeded").length
    ),
    countFailedLastHour: vi.fn(
      () => tasks.filter((t) => t.status === "failed").length
    ),
    reviewQueueDepth: vi.fn(() => 0),
    recentFailureSummary: vi.fn(() => []),
    aggregator: {
      applyDecision: vi.fn(
        (
          eventId: string,
          decision: "approved" | "rejected" | "review_required",
          _note?: string
        ) => {
          decisions.push(`${eventId}:${decision}`);
        }
      )
    },
    llmClient: client
  };
}

describe("LlmScoringWorker", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test("requeueStaleRunningTasks called on start with 2x timeout", async () => {
    const deps = makeDeps([], new FakeLlmScoringClient({ responses: [] }), []);
    const worker = new LlmScoringWorker(deps, baseConfig({ taskTimeoutMs: 500 }));
    worker.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(deps.requeueStaleRunningTasks).toHaveBeenCalledWith(1000);
    await worker.stop();
  });

  test("successful task applies approved decision", async () => {
    const tasks: FakeTaskRow[] = [
      {
        id: "task-1",
        eventId: "evt-1",
        promptText: "p",
        status: "pending",
        attempts: 0,
        maxAttempts: 3,
        enqueuedAtMs: Date.now() - 1,
        startedAtMs: null
      }
    ];
    const client = new FakeLlmScoringClient({
      responses: [{ pass: true, score: 3, reason: "good", raw: {} }]
    });
    const decisions: string[] = [];
    const deps = makeDeps(tasks, client, decisions);
    const worker = new LlmScoringWorker(deps, baseConfig());
    worker.start();
    await vi.advanceTimersByTimeAsync(200);
    expect(decisions).toContain("evt-1:approved");
    expect(tasks[0].status).toBe("succeeded");
    await worker.stop();
  });

  test("pass=false maps to review_required decision", async () => {
    const tasks: FakeTaskRow[] = [
      {
        id: "task-1",
        eventId: "evt-1",
        promptText: "p",
        status: "pending",
        attempts: 0,
        maxAttempts: 3,
        enqueuedAtMs: Date.now() - 1,
        startedAtMs: null
      }
    ];
    const client = new FakeLlmScoringClient({
      responses: [{ pass: false, score: 0, reason: "bad", raw: {} }]
    });
    const decisions: string[] = [];
    const deps = makeDeps(tasks, client, decisions);
    const worker = new LlmScoringWorker(deps, baseConfig());
    worker.start();
    await vi.advanceTimersByTimeAsync(200);
    expect(decisions).toContain("evt-1:review_required");
    await worker.stop();
  });

  test("retryable failure requeues with exponential backoff", async () => {
    const tasks: FakeTaskRow[] = [
      {
        id: "task-1",
        eventId: "evt-1",
        promptText: "p",
        status: "pending",
        attempts: 0,
        maxAttempts: 3,
        enqueuedAtMs: Date.now() - 1,
        startedAtMs: null
      }
    ];
    const client = new FakeLlmScoringClient({
      provider: () => {
        throw new LlmRetryableError("timeout");
      }
    });
    const decisions: string[] = [];
    const deps = makeDeps(tasks, client, decisions);
    const worker = new LlmScoringWorker(deps, baseConfig());
    worker.start();
    await vi.advanceTimersByTimeAsync(200);
    expect(deps.markTaskFailedRetry).toHaveBeenCalledWith(
      "task-1",
      2,
      expect.stringContaining("timeout")
    );
    expect(decisions).toHaveLength(0);
    await worker.stop();
  });

  test("non-retryable failure marks terminal and sets review_required", async () => {
    const tasks: FakeTaskRow[] = [
      {
        id: "task-1",
        eventId: "evt-1",
        promptText: "p",
        status: "pending",
        attempts: 0,
        maxAttempts: 3,
        enqueuedAtMs: Date.now() - 1,
        startedAtMs: null
      }
    ];
    const client = new FakeLlmScoringClient({
      provider: () => {
        throw new LlmNonRetryableError("json parse");
      }
    });
    const decisions: string[] = [];
    const deps = makeDeps(tasks, client, decisions);
    const worker = new LlmScoringWorker(deps, baseConfig());
    worker.start();
    await vi.advanceTimersByTimeAsync(200);
    expect(deps.markTaskFailedTerminal).toHaveBeenCalledWith(
      "task-1",
      expect.stringContaining("json parse")
    );
    expect(decisions).toContain("evt-1:review_required");
    await worker.stop();
  });

  test("retry attempts exhausted escalates to review_required", async () => {
    const tasks: FakeTaskRow[] = [
      {
        id: "task-1",
        eventId: "evt-1",
        promptText: "p",
        status: "pending",
        attempts: 2,
        maxAttempts: 3,
        enqueuedAtMs: Date.now() - 1,
        startedAtMs: null
      }
    ];
    const client = new FakeLlmScoringClient({
      provider: () => {
        throw new LlmRetryableError("still timing out");
      }
    });
    const decisions: string[] = [];
    const deps = makeDeps(tasks, client, decisions);
    const worker = new LlmScoringWorker(deps, baseConfig());
    worker.start();
    await vi.advanceTimersByTimeAsync(200);
    expect(deps.markTaskFailedTerminal).toHaveBeenCalled();
    expect(decisions).toContain("evt-1:review_required");
    await worker.stop();
  });

  test("getStatus reports running, concurrency, counts", async () => {
    const tasks: FakeTaskRow[] = [];
    const deps = makeDeps(tasks, new FakeLlmScoringClient({ responses: [] }), []);
    const worker = new LlmScoringWorker(
      deps,
      baseConfig({ concurrency: 3, pollIntervalMs: 200 })
    );
    worker.start();
    await vi.advanceTimersByTimeAsync(0);
    const status = worker.getStatus();
    expect(status.running).toBe(true);
    expect(status.concurrencyMax).toBe(3);
    expect(status.concurrencyInUse).toBe(0);
    expect(status.pendingCount).toBe(0);
    expect(status.runningCount).toBe(0);
    expect(status.reviewQueueDepth).toBe(0);
    await worker.stop();
    expect(worker.getStatus().running).toBe(false);
  });

  test("stop waits for in-flight work to finish", async () => {
    const tasks: FakeTaskRow[] = [
      {
        id: "task-1",
        eventId: "evt-1",
        promptText: "p",
        status: "pending",
        attempts: 0,
        maxAttempts: 3,
        enqueuedAtMs: Date.now() - 1,
        startedAtMs: null
      }
    ];
    const client = new FakeLlmScoringClient({
      responses: [{ pass: true, score: 3, reason: "ok", raw: {} }],
      delayMs: 100
    });
    const deps = makeDeps(tasks, client, []);
    const worker = new LlmScoringWorker(deps, baseConfig());
    worker.start();
    await vi.advanceTimersByTimeAsync(10);
    const stopPromise = worker.stop();
    await vi.advanceTimersByTimeAsync(200);
    await stopPromise;
    expect(worker.getStatus().running).toBe(false);
  });

  test("multiple pending tasks are processed in order", async () => {
    const tasks: FakeTaskRow[] = [
      {
        id: "task-1",
        eventId: "evt-1",
        promptText: "p1",
        status: "pending",
        attempts: 0,
        maxAttempts: 3,
        enqueuedAtMs: Date.now() - 2,
        startedAtMs: null
      },
      {
        id: "task-2",
        eventId: "evt-2",
        promptText: "p2",
        status: "pending",
        attempts: 0,
        maxAttempts: 3,
        enqueuedAtMs: Date.now() - 1,
        startedAtMs: null
      }
    ];
    const client = new FakeLlmScoringClient({
      responses: [
        { pass: true, score: 3, reason: "ok1", raw: {} },
        { pass: true, score: 3, reason: "ok2", raw: {} }
      ]
    });
    const decisions: string[] = [];
    const deps = makeDeps(tasks, client, decisions);
    const worker = new LlmScoringWorker(deps, baseConfig());
    worker.start();
    await vi.advanceTimersByTimeAsync(500);
    expect(decisions).toEqual(["evt-1:approved", "evt-2:approved"]);
    await worker.stop();
  });

  test("stopped worker does not claim more tasks", async () => {
    const tasks: FakeTaskRow[] = [
      {
        id: "task-1",
        eventId: "evt-1",
        promptText: "p1",
        status: "pending",
        attempts: 0,
        maxAttempts: 3,
        enqueuedAtMs: Date.now() - 1,
        startedAtMs: null
      }
    ];
    const client = new FakeLlmScoringClient({
      responses: [{ pass: true, score: 3, reason: "ok", raw: {} }]
    });
    const deps = makeDeps(tasks, client, []);
    const worker = new LlmScoringWorker(deps, baseConfig());
    worker.start();
    await worker.stop();
    const calls = (deps.claimNextPendingTask as ReturnType<typeof vi.fn>).mock.calls.length;
    await vi.advanceTimersByTimeAsync(500);
    expect(
      (deps.claimNextPendingTask as ReturnType<typeof vi.fn>).mock.calls.length
    ).toBe(calls);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/services/v2/llm-scoring-worker.test.ts`
Expected: FAIL — `src/services/v2/llm-scoring-worker.js` module not found.

- [ ] **Step 3: Implement `src/services/v2/llm-scoring-worker.ts`**

```typescript
import { Semaphore } from "./semaphore.js";
import { TokenBucket } from "./token-bucket.js";
import {
  LlmNonRetryableError,
  LlmRetryableError
} from "../../domain/v2/errors.js";
import type {
  LlmScoringClient,
  LlmScoringResult
} from "./llm-scoring-client.js";

export interface WorkerConfig {
  concurrency: number;
  rateLimitPerSec: number;
  pollIntervalMs: number;
  taskTimeoutMs: number;
  maxAttempts: number;
}

export interface WorkerClaimedTask {
  id: string;
  eventId: string;
  promptText: string;
  attempts: number;
  maxAttempts: number;
}

export interface WorkerAggregator {
  applyDecision(
    eventId: string,
    decision: "approved" | "rejected" | "review_required",
    note?: string
  ): void;
}

export interface WorkerRecentFailure {
  eventId: string;
  errorReason: string;
  at: string;
}

export interface WorkerDeps {
  claimNextPendingTask(): WorkerClaimedTask | null;
  markTaskSucceeded(taskId: string, result: LlmScoringResult): void;
  markTaskFailedRetry(taskId: string, backoffSec: number, reason: string): void;
  markTaskFailedTerminal(taskId: string, reason: string): void;
  requeueStaleRunningTasks(olderThanMs: number): number;
  countPending(): number;
  countRunning(): number;
  countSucceededLastHour(): number;
  countFailedLastHour(): number;
  reviewQueueDepth(): number;
  recentFailureSummary(): WorkerRecentFailure[];
  aggregator: WorkerAggregator;
  llmClient: LlmScoringClient;
}

export interface WorkerStatus {
  running: boolean;
  concurrencyInUse: number;
  concurrencyMax: number;
  pendingCount: number;
  runningCount: number;
  succeededLast1h: number;
  failedLast1h: number;
  reviewQueueDepth: number;
  avgLatencyMs: number;
  recentFailures: WorkerRecentFailure[];
}

export class LlmScoringWorker {
  private readonly semaphore: Semaphore;
  private readonly tokenBucket: TokenBucket;
  private _running: boolean = false;
  private stopRequested: boolean = false;
  private loopPromise: Promise<void> | null = null;
  private inFlight: Set<Promise<void>> = new Set();
  private latencySamples: number[] = [];

  constructor(
    private readonly deps: WorkerDeps,
    private readonly config: WorkerConfig
  ) {
    this.semaphore = new Semaphore(config.concurrency);
    this.tokenBucket = new TokenBucket(
      config.rateLimitPerSec,
      config.rateLimitPerSec
    );
  }

  start(): void {
    if (this._running) {
      return;
    }
    this._running = true;
    this.stopRequested = false;
    this.deps.requeueStaleRunningTasks(2 * this.config.taskTimeoutMs);
    this.loopPromise = this.loop();
  }

  async stop(): Promise<void> {
    this.stopRequested = true;
    if (this.loopPromise) {
      await this.loopPromise;
    }
    if (this.inFlight.size > 0) {
      await Promise.all([...this.inFlight]);
    }
    this._running = false;
  }

  getStatus(): WorkerStatus {
    const avgLatencyMs =
      this.latencySamples.length === 0
        ? 0
        : Math.round(
            this.latencySamples.reduce((acc, v) => acc + v, 0) /
              this.latencySamples.length
          );
    return {
      running: this._running,
      concurrencyInUse: this.semaphore.inFlight,
      concurrencyMax: this.semaphore.max,
      pendingCount: this.deps.countPending(),
      runningCount: this.deps.countRunning(),
      succeededLast1h: this.deps.countSucceededLastHour(),
      failedLast1h: this.deps.countFailedLastHour(),
      reviewQueueDepth: this.deps.reviewQueueDepth(),
      avgLatencyMs,
      recentFailures: this.deps.recentFailureSummary()
    };
  }

  private async loop(): Promise<void> {
    while (!this.stopRequested) {
      const task = this.deps.claimNextPendingTask();
      if (!task) {
        await this.sleep(this.config.pollIntervalMs);
        continue;
      }
      await this.semaphore.acquire();
      await this.tokenBucket.acquire();
      const work = this.runTask(task).finally(() => {
        this.semaphore.release();
        this.inFlight.delete(work);
      });
      this.inFlight.add(work);
    }
  }

  private async runTask(task: WorkerClaimedTask): Promise<void> {
    const startedAt = Date.now();
    try {
      const result = await this.deps.llmClient.score(task.promptText, {
        timeoutMs: this.config.taskTimeoutMs
      });
      this.recordLatency(Date.now() - startedAt);
      this.deps.markTaskSucceeded(task.id, result);
      const decision = result.pass ? "approved" : "review_required";
      this.deps.aggregator.applyDecision(task.eventId, decision, result.reason);
    } catch (error) {
      this.recordLatency(Date.now() - startedAt);
      this.handleFailure(task, error);
    }
  }

  private handleFailure(task: WorkerClaimedTask, error: unknown): void {
    const reason = error instanceof Error ? error.message : String(error);
    const isRetryable = error instanceof LlmRetryableError;
    const isNonRetryable = error instanceof LlmNonRetryableError;

    if (isRetryable && task.attempts < task.maxAttempts) {
      const backoffSec = 2 ** task.attempts;
      this.deps.markTaskFailedRetry(task.id, backoffSec, reason);
      return;
    }

    const terminalReason = isNonRetryable
      ? `llm_non_retryable: ${reason}`
      : `llm_exhausted: ${reason}`;
    this.deps.markTaskFailedTerminal(task.id, terminalReason);
    this.deps.aggregator.applyDecision(
      task.eventId,
      "review_required",
      terminalReason
    );
  }

  private recordLatency(ms: number): void {
    this.latencySamples.push(ms);
    if (this.latencySamples.length > 100) {
      this.latencySamples.shift();
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/services/v2/llm-scoring-worker.test.ts`
Expected: PASS — all 10 assertions green.

- [ ] **Step 5: Commit**

```bash
git add src/services/v2/llm-scoring-worker.ts tests/services/v2/llm-scoring-worker.test.ts
git commit -m "feat(v2-llm): add LlmScoringWorker event loop with retry and stale reclaim"
```

---

## Phase E Exit Checkpoint

Run the full suite and build:
```bash
npm test
npm run build
```
Expected: both green. The async LLM pipeline is now self-contained: `EventIngestor.ingest` enqueues a task → `LlmScoringWorker.loop` claims it, calls `llmClient.score` under the rate limit and semaphore → success maps to `approved` or `review_required` via the aggregator → retryable failures back off with `2 ** attempts` seconds → non-retryable or exhausted attempts escalate to `review_required`. Stale `running` tasks left behind from a previous process restart are reclaimed on `start()`.

---

## Phase F — External Reflows Stubs (2 tasks)

Add stubs for the two reflows that cross the subproject-2 boundary: C2 emoji reaction aggregation (forwards of passing C1 submissions), and member/avatar synchronization from Feishu. These let subproject 1 deliver a complete domain layer with no behavioral gaps, while keeping actual Feishu API calls out of scope.

---

### Task F1: `reaction-tracker.ts` — C2 emoji reaction aggregator

**Files:**
- Create: `src/services/v2/reaction-tracker.ts`
- Test: `tests/services/v2/reaction-tracker.test.ts`

Spec §5.2 rules:
- Track a set of forwarded C1 messages.
- Ignore self-reactions (reactor openId equals the poster's openId).
- Every third distinct reaction on the same tracked message calls `ingestor.ingest('C2', scoreDelta: 1, sourceRef: messageId + ':' + Math.floor(count / 3))` so the per-period cap of 4 tops out at 12 reactions.
- A `registerTrackedMessage(messageId, posterOpenId)` helper lets the subproject-2 forward hook register messages without pulling in any database state.

- [ ] **Step 1: Write failing test**

Create `tests/services/v2/reaction-tracker.test.ts`:

```typescript
import { beforeEach, describe, expect, test, vi } from "vitest";

import {
  ReactionTracker,
  type ReactionIngestor
} from "../../../src/services/v2/reaction-tracker.js";

interface IngestCall {
  itemCode: string;
  scoreDelta: number;
  sourceRef: string;
  memberId: string;
}

function makeIngestor(): { tracker: ReactionTracker; calls: IngestCall[] } {
  const calls: IngestCall[] = [];
  const ingestor: ReactionIngestor = {
    ingest: vi.fn((input) => {
      calls.push({
        itemCode: input.itemCode,
        scoreDelta: input.scoreDelta,
        sourceRef: input.sourceRef,
        memberId: input.memberId
      });
      return { accepted: true, eventId: `evt-${calls.length}` };
    })
  };
  const tracker = new ReactionTracker(ingestor);
  return { tracker, calls };
}

describe("ReactionTracker", () => {
  test("first and second reactions do not trigger ingest", () => {
    const { tracker, calls } = makeIngestor();
    tracker.registerTrackedMessage("msg-1", "ou_poster", "member-1");
    tracker.handleReaction("msg-1", "ou_a", "LIKE");
    tracker.handleReaction("msg-1", "ou_b", "LIKE");
    expect(calls).toHaveLength(0);
  });

  test("every third reaction triggers one C2 ingest of +1", () => {
    const { tracker, calls } = makeIngestor();
    tracker.registerTrackedMessage("msg-1", "ou_poster", "member-1");
    tracker.handleReaction("msg-1", "ou_a", "LIKE");
    tracker.handleReaction("msg-1", "ou_b", "LIKE");
    tracker.handleReaction("msg-1", "ou_c", "LIKE");
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      itemCode: "C2",
      scoreDelta: 1,
      memberId: "member-1"
    });
    expect(calls[0].sourceRef).toContain("msg-1");
  });

  test("self-reaction is rejected", () => {
    const { tracker, calls } = makeIngestor();
    tracker.registerTrackedMessage("msg-1", "ou_poster", "member-1");
    tracker.handleReaction("msg-1", "ou_poster", "LIKE");
    tracker.handleReaction("msg-1", "ou_poster", "LIKE");
    tracker.handleReaction("msg-1", "ou_poster", "LIKE");
    expect(calls).toHaveLength(0);
  });

  test("unregistered message is ignored", () => {
    const { tracker, calls } = makeIngestor();
    tracker.handleReaction("unknown-msg", "ou_a", "LIKE");
    expect(calls).toHaveLength(0);
  });

  test("each triggered ingest uses a distinct sourceRef (batch index)", () => {
    const { tracker, calls } = makeIngestor();
    tracker.registerTrackedMessage("msg-1", "ou_poster", "member-1");
    for (let i = 0; i < 9; i += 1) {
      tracker.handleReaction("msg-1", `ou_${i}`, "LIKE");
    }
    expect(calls).toHaveLength(3);
    const refs = new Set(calls.map((c) => c.sourceRef));
    expect(refs.size).toBe(3);
    for (const ref of refs) {
      expect(ref.startsWith("msg-1:")).toBe(true);
    }
  });

  test("reactions from different emoji still count", () => {
    const { tracker, calls } = makeIngestor();
    tracker.registerTrackedMessage("msg-1", "ou_poster", "member-1");
    tracker.handleReaction("msg-1", "ou_a", "LIKE");
    tracker.handleReaction("msg-1", "ou_b", "CLAP");
    tracker.handleReaction("msg-1", "ou_c", "HEART");
    expect(calls).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/services/v2/reaction-tracker.test.ts`
Expected: FAIL — `src/services/v2/reaction-tracker.js` module not found.

- [ ] **Step 3: Implement `src/services/v2/reaction-tracker.ts`**

```typescript
export interface ReactionIngestInput {
  memberId: string;
  itemCode: "C2";
  scoreDelta: number;
  sourceRef: string;
}

export interface ReactionIngestor {
  ingest(
    input: ReactionIngestInput
  ): { accepted: boolean; eventId?: string; reason?: string };
}

interface TrackedMessage {
  posterOpenId: string;
  memberId: string;
  reactionCount: number;
  lastTriggeredBatch: number;
}

export class ReactionTracker {
  private readonly messages: Map<string, TrackedMessage> = new Map();

  constructor(private readonly ingestor: ReactionIngestor) {}

  registerTrackedMessage(
    messageId: string,
    posterOpenId: string,
    memberId: string
  ): void {
    this.messages.set(messageId, {
      posterOpenId,
      memberId,
      reactionCount: 0,
      lastTriggeredBatch: 0
    });
  }

  handleReaction(
    messageId: string,
    reactingUserOpenId: string,
    _emoji: string
  ): void {
    const tracked = this.messages.get(messageId);
    if (!tracked) {
      return;
    }
    if (reactingUserOpenId === tracked.posterOpenId) {
      return;
    }
    tracked.reactionCount += 1;
    const batchIndex = Math.floor(tracked.reactionCount / 3);
    if (batchIndex > tracked.lastTriggeredBatch) {
      tracked.lastTriggeredBatch = batchIndex;
      this.ingestor.ingest({
        memberId: tracked.memberId,
        itemCode: "C2",
        scoreDelta: 1,
        sourceRef: `${messageId}:${batchIndex}`
      });
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/services/v2/reaction-tracker.test.ts`
Expected: PASS — all 6 assertions green.

- [ ] **Step 5: Commit**

```bash
git add src/services/v2/reaction-tracker.ts tests/services/v2/reaction-tracker.test.ts
git commit -m "feat(v2): add ReactionTracker C2 emoji aggregator stub"
```

---

### Task F2: `member-sync.ts` — MemberSyncService interface + Stub

**Files:**
- Create: `src/domain/v2/member-sync.ts`
- Test: `tests/domain/v2/member-sync.test.ts`

Spec §5.10: subproject 1 defines the interface so `bootstrap.ts` can depend on it, and ships a stub implementation that only records calls in an in-memory trace array. Subproject 2 will later drop in `FeishuMemberSyncService` without changing any caller.

- [ ] **Step 1: Write failing test**

Create `tests/domain/v2/member-sync.test.ts`:

```typescript
import { describe, expect, test } from "vitest";

import {
  StubMemberSyncService,
  type MemberSyncService,
  type SyncResult
} from "../../../src/domain/v2/member-sync.js";

describe("StubMemberSyncService", () => {
  test("syncGroupMembers records the call and returns a zero SyncResult", async () => {
    const service: MemberSyncService = new StubMemberSyncService();
    const result: SyncResult = await service.syncGroupMembers("chat-1");
    expect(result.added).toBe(0);
    expect(result.updated).toBe(0);
    expect(result.totalInGroup).toBe(0);
    expect(typeof result.syncedAt).toBe("string");
  });

  test("syncUserAvatars records the openIds and resolves without throwing", async () => {
    const stub = new StubMemberSyncService();
    await stub.syncUserAvatars(["ou_a", "ou_b"]);
    expect(stub.trace).toContainEqual({
      method: "syncUserAvatars",
      openIds: ["ou_a", "ou_b"]
    });
  });

  test("trace captures both methods in order", async () => {
    const stub = new StubMemberSyncService();
    await stub.syncGroupMembers("chat-42");
    await stub.syncUserAvatars(["ou_x"]);
    expect(stub.trace).toHaveLength(2);
    expect(stub.trace[0]).toMatchObject({
      method: "syncGroupMembers",
      chatId: "chat-42"
    });
    expect(stub.trace[1]).toMatchObject({
      method: "syncUserAvatars",
      openIds: ["ou_x"]
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/domain/v2/member-sync.test.ts`
Expected: FAIL — `src/domain/v2/member-sync.js` module not found.

- [ ] **Step 3: Implement `src/domain/v2/member-sync.ts`**

```typescript
export interface SyncResult {
  added: number;
  updated: number;
  totalInGroup: number;
  syncedAt: string;
}

export interface MemberSyncService {
  syncGroupMembers(chatId: string): Promise<SyncResult>;
  syncUserAvatars(openIds: string[]): Promise<void>;
}

export type MemberSyncTraceEntry =
  | { method: "syncGroupMembers"; chatId: string }
  | { method: "syncUserAvatars"; openIds: string[] };

export class StubMemberSyncService implements MemberSyncService {
  readonly trace: MemberSyncTraceEntry[] = [];

  async syncGroupMembers(chatId: string): Promise<SyncResult> {
    this.trace.push({ method: "syncGroupMembers", chatId });
    return {
      added: 0,
      updated: 0,
      totalInGroup: 0,
      syncedAt: new Date().toISOString()
    };
  }

  async syncUserAvatars(openIds: string[]): Promise<void> {
    this.trace.push({ method: "syncUserAvatars", openIds: [...openIds] });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/domain/v2/member-sync.test.ts`
Expected: PASS — all 3 assertions green.

- [ ] **Step 5: Commit**

```bash
git add src/domain/v2/member-sync.ts tests/domain/v2/member-sync.test.ts
git commit -m "feat(v2): add MemberSyncService interface and StubMemberSyncService"
```

---

## Phase F Exit Checkpoint

Run the full suite and build:
```bash
npm test
npm run build
```
Expected: both green. The domain layer is now complete enough for the subproject 2 cards and Feishu handlers to wire against concrete interfaces: `EventIngestor.ingest` is the single entry point, `ReactionTracker.handleReaction` handles the C2 flow without pulling in Feishu APIs, and `MemberSyncService` / `StubMemberSyncService` let `bootstrap.ts` depend on an abstraction that subproject 2 replaces later without touching subproject-1 code. All legacy tests still green, no regressions.

## Phase G — API Routes (11 tasks)

Phase G turns the domain services delivered in Phases A through F into a first-class HTTP surface under `/api/v2/*`. All routes are registered inside `createApp` in `src/app.ts`, validated with Zod 4 strict object schemas, and tested through `fastify.inject()` — there is no real HTTP listener in the test suite. A single helper `mapDomainErrorToHttp` lives in `src/app-v2-errors.ts` and centralises the spec section 6.4 error-to-HTTP status table so every route catch block stays one line. `createApp` options are extended with seven new dependency injection points (`ingestor`, `aggregator`, `periodLifecycle`, `windowSettler`, `llmWorker`, `reactionTracker`, `memberSync`) so tests can swap in fakes and production code can wire real implementations through `server.ts`.

### Why Phase G Is Structured This Way

Before diving into the tasks, it helps to understand why Phase G is structured the way it is. There are eleven tasks, not one mega-task, because each route represents an independent slice of user-visible behaviour. A failure in one route should not require the entire phase to be rolled back. The test file per task gives us a surgical rollback path: if `POST /api/v2/events` turns out to have a schema bug that was missed in review, we can revert a single commit without touching any of the other ten routes. That property is only possible because the route registration logic is delegated to per-task files under `src/routes/v2/*`.

The alternative — a single large "add all v2 routes" commit — was rejected for three reasons. First, the commit would be too large for code review (easily 2000+ lines of diff). Second, a single commit means a single rollback unit, so a minor bug in one route forces the entire surface to be reverted. Third, the test-per-task discipline forces us to write the tests for each route in isolation before writing any other routes, which catches shared-state bugs that a monolithic test suite would miss.

### Global Design Constraints For Phase G

These constraints apply to every task in Phase G. They are stated once here and referenced by each task. If a task violates one of these constraints the task is not green and must be reworked.

1. **Strict Zod schemas.** All Zod body schemas use `z.object({...}).strict()` so unknown keys produce 400 responses. This matches the coding-style rule that external input must be validated with schema-based validation at system boundaries. Strict mode also catches typos on the caller side — a sub-project 2 developer who accidentally sends `memberID` instead of `memberId` will see a clear 400 instead of a silent null dereference downstream.

2. **Admin gating.** All admin routes (anything under `/api/v2/admin/*`, plus `/api/v2/periods/close`, `/api/v2/windows/open`, and `/api/v2/graduation/close`) must use the `requireAdmin(repository)` Fastify `onRequest` hook delivered in Task G1. The hook is a closure that captures the repository, not a module-level decorator, so tests can inject a `:memory:` repository without restructuring.

3. **Uniform error handling.** Every route body is wrapped in `try { ... } catch (err) { return mapDomainErrorToHttp(err, reply) }`. Routes never let domain errors bubble up to Fastify's default handler, because Fastify would otherwise leak a generic 500 with no `code` field, forcing clients to string-match the error message.

4. **Closure-based dependency injection.** Route handler dependencies come from the closure captured inside `createApp`. Handlers do not read from `app.decorate` or from module-level globals, because decorator state leaks across tests and globals break parallel test execution inside vitest workers.

5. **Tests use app.inject only.** Test files live beside the spec files in `tests/api/v2/` and import `createApp` directly with a `:memory:` SQLite URL. No test may start a real HTTP listener — doing so would mean every test needs to allocate a port, which serialises the test suite and doubles runtime.

6. **Canonical error mapping.** The spec section 6.4 mapping is the single source of truth for HTTP codes. `not_eligible`, `cap_exceeded`, and `duplicate` become 400. `no_active_period`, `no_active_window`, `ice_breaker_no_scoring`, and `window_already_settled` become 409. `invalid_level_transition` becomes 500 because it is a code-layer bug, not a user error. `llm_exhausted` is never surfaced because the worker converts it to a `review_required` event before the API ever sees it. Unknown errors become 500 with `{ ok: false, code: "internal_error" }` and no stack trace leakage.

7. **File-size limit.** Route files under `src/routes/v2/*` must stay under 200 lines each to satisfy the coding-style file-size rule. When a file approaches that ceiling, split it. For example, `src/routes/v2/admin-members.ts` and `src/routes/v2/admin-review.ts` are separate files even though they share the `/api/v2/admin/*` prefix.

8. **Integration-test coverage.** Every new route must be covered by at least one integration test that uses `app.inject`. Tests that only call the route handler function directly are not acceptable because they skip the middleware chain — in particular, they would skip the Zod body parsing and the `requireAdmin` guard.

9. **Response envelope convention.** Responses on success always include `ok: true`. Responses on failure always include `ok: false` plus a `code` field. This convention lets the dashboard in sub-project 3 handle all v2 endpoints with a single response parser. The convention diverges slightly from the common REST pattern of relying on HTTP status alone, but the dashboard needs a consistent error-code taxonomy for UI localisation.

10. **No console prints.** No route contains a `console.log`, `console.error`, or any debug print statement. Logging goes through `request.log` only. The hookify system will flag any `console` usage before commit, but the discipline is still the developer's responsibility.

11. **Commit discipline.** Each task produces exactly one commit. The commit message is listed at the bottom of each task and must be used verbatim. Do not add `[skip ci]` tags, do not amend commits from previous tasks, do not squash.

12. **TypeScript strict mode.** All new files are written to compile cleanly under `"strict": true`. No `any` types. No `@ts-ignore` or `@ts-expect-error`. If you encounter a type mismatch that seems to require a cast, step back and check whether the type definition itself needs to be extended — the answer is almost always yes.

### Phase G Task Summary

| Task | Route | Method | Admin | New Files | Tests |
|---|---|---|---|---|---|
| G1 | middleware + wiring | n/a | yes (factory) | `src/app-v2-errors.ts`, `src/routes/v2/common.ts`, `src/types/fastify.d.ts` | 2 files, 8 tests |
| G2 | `/api/v2/events` | POST | no | `src/routes/v2/events.ts` | 1 file, 8 tests |
| G3 | `/api/v2/periods/open` | POST | no | `src/routes/v2/periods.ts` | 1 file, 4 tests |
| G4 | `/api/v2/periods/close` | POST | yes | extends G3 file | 1 file, 3 tests |
| G5 | `/api/v2/windows/open` | POST | yes | `src/routes/v2/windows.ts` | 1 file, 5 tests |
| G6 | `/api/v2/graduation/close` | POST | yes | `src/routes/v2/graduation.ts` | 1 file, 3 tests |
| G7 | `/api/v2/board/ranking` | GET | no | `src/routes/v2/board.ts` | 2 files, 5 tests |
| G8 | `/api/v2/board/member/:id` | GET | no | extends G7 file | 2 files, 4 tests |
| G9 | `/api/v2/admin/review-queue` | GET + POST | yes | `src/routes/v2/admin-review.ts` | 1 file, 6 tests |
| G10 | `/api/v2/admin/members` | GET + PATCH | yes | `src/routes/v2/admin-members.ts` | 2 files, 6 tests |
| G11 | `/api/v2/llm/worker/status` | GET | no | `src/routes/v2/llm-status.ts` | 1 file, 2 tests |

Phase G creates thirteen route handlers distributed across nine route files plus common infrastructure, and covers them with approximately 54 tests. The shared helper infrastructure from Task G1 keeps each subsequent route file tight (typically under 100 lines).

### Task G1 — Admin Middleware and createApp Dependency Wiring

**Intent**

Task G1 is the foundation that every later Phase G task stands on. It does three things at once. First, it extends the `createApp` options interface with seven new dependency injection points. Second, it ships the `requireAdmin(repository)` Fastify hook factory used by all admin routes. Third, it ships the `mapDomainErrorToHttp` centralised error mapper used by every route catch block. The middleware implementation follows spec section 5.11 exactly, and the error mapper follows spec section 6.4 exactly.

**Why the three pieces live together**

These three pieces land in one task because they share a test harness. The unit tests for the middleware need a throwaway route that calls `mapDomainErrorToHttp` to verify the 403 path. The dependency wiring tests need the middleware to exist so they can prove that `requireAdmin` composes with the new `createApp` options. Splitting them into three tasks would force circular git dependencies where each task's tests would only pass after the next task's implementation was in place.

**Architectural rationale**

The choice of a closure-based factory (`requireAdmin(repository)`) instead of a Fastify plugin (`fastify.register(requireAdminPlugin)`) is deliberate. Plugins run at registration time and are global, which means every route decorated with the plugin would share state. A closure factory gives us one middleware instance per route-registration call, which is what we want because each v2 sub-section has slightly different semantics (for example, the `POST /api/v2/events` route is not admin-gated but the `POST /api/v2/admin/review-queue` route is). A closure factory also lets tests substitute the repository without restructuring.

The choice of a centralised `mapDomainErrorToHttp` instead of a Fastify error handler is also deliberate. Fastify's `setErrorHandler` runs after Zod validation has already consumed the body, which means the error handler has no access to the original body for logging. By handling errors inline in each route catch block, we keep the raw body available for the log line and we avoid a second async hop through Fastify's error-handling middleware stack. The downside is boilerplate in every route, but the boilerplate is exactly one `try/catch` wrapper, which is negligible.

**Files**

- `src/app.ts` — extend the `createApp` options interface with the seven new deps, wire sensible defaults, and add the `requireAdmin(repository)` factory. This edit is additive; no existing code is removed in this task.
- `src/app-v2-errors.ts` — NEW. Export `mapDomainErrorToHttp(err: unknown, reply: FastifyReply): FastifyReply`. Holds the entire section 6.4 mapping table in one place.
- `src/routes/v2/common.ts` — NEW. Re-exports `mapDomainErrorToHttp`, `parseStrict`, and `adminGuard`. Acts as the single import surface for every route file in this phase.
- `src/types/fastify.d.ts` — NEW. TypeScript module augmentation that declares `request.currentAdmin: MemberRecord | undefined` so every later route can consume the field with full type safety.
- `src/domain/v2/eligibility.ts` — read-only import; no edits in this task, but the middleware references the member shape from here.
- `tests/api/v2/require-admin.test.ts` — NEW. Unit-style tests that use `fastify.inject()` on a tiny route registered inside the test harness.
- `tests/api/v2/app-wiring.test.ts` — NEW. Asserts that `createApp` accepts the new options and exposes them to every route via a closure.

**Expected file sizes**

- `src/app.ts`: grows by approximately 60 lines for the new options interface, the `buildV2Runtime` helper, and the `requireAdmin` factory. Total stays under 700 lines. If the total would exceed 700 lines, extract `buildV2Runtime` to its own file.
- `src/app-v2-errors.ts`: approximately 70 lines. The error mapper switch has one case per `DomainError` subclass plus a default.
- `src/routes/v2/common.ts`: approximately 40 lines. It is primarily re-exports.
- `src/types/fastify.d.ts`: approximately 15 lines. Just the module augmentation.

**Steps**

- [ ] RED: Write `tests/api/v2/require-admin.test.ts` with four failing cases. The harness imports `createApp` from `../../../src/app.js`, creates a `:memory:` repository, and seeds one operator member (`id: "op-1", sourceFeishuOpenId: "ou-op-1", roleType: "operator"`) plus one student member (`id: "st-1", sourceFeishuOpenId: "ou-st-1", roleType: "student"`). The test then boots `createApp({ databaseUrl: ":memory:" })` with a test-only option hook that registers a throwaway route `GET /_test/admin-required`. The throwaway route uses `{ onRequest: requireAdmin(repository) }` and returns `{ ok: true, currentAdmin: request.currentAdmin }`. Case 1: no header set — `app.inject({ method: "GET", url: "/_test/admin-required" })` returns 401 and body `{ ok: false, code: "no_identity" }`. Case 2: header set but unknown open id — returns 403 and body `{ ok: false, code: "not_admin" }`. Case 3: header set but student — returns 403. Case 4: header set, operator — returns 200 and body `{ ok: true, currentAdmin: { id: "op-1", ... } }`. Run `npm test -- tests/api/v2/require-admin.test.ts` and watch all four fail with "requireAdmin is not a function".

- [ ] RED: Write `tests/api/v2/app-wiring.test.ts`. This test boots `createApp({ databaseUrl: ":memory:", ingestor: fakeIngestor, aggregator: fakeAggregator, periodLifecycle: fakePeriodLifecycle, windowSettler: fakeWindowSettler, llmWorker: fakeLlmWorker, reactionTracker: fakeReactionTracker, memberSync: fakeMemberSync })` where every fake is a minimal vitest `vi.fn()`-based stub. First assertion: `app.inject({ method: "GET", url: "/_health" })` returns 200. Second assertion: the test-only route `GET /_test/deps` (exposed via a tiny test-hook option) returns a JSON object where every one of the seven deps has the expected identity (compare by object reference equality). Third assertion: calling `createApp({ databaseUrl: ":memory:" })` without any of the new deps also works — every dep defaults to a real production implementation constructed from the repository. Fourth assertion: the default `ingestor` is an instance of `EventIngestor`. Run `npm test -- tests/api/v2/app-wiring.test.ts` and watch it fail because `createApp` does not yet know the new option keys.

- [ ] GREEN: Edit `src/app.ts` and expand the `createApp` options interface. Add seven new optional fields, each a full TypeScript interface imported from the domain / services layer: `ingestor?: EventIngestor`, `aggregator?: ScoringAggregator`, `periodLifecycle?: PeriodLifecycleService`, `windowSettler?: WindowSettler`, `llmWorker?: LlmScoringWorker`, `reactionTracker?: ReactionTracker`, `memberSync?: MemberSyncService`. Provide default implementations inline: `options.ingestor ?? new EventIngestor({ repository, clock: options.clock ?? Date })`, and the analogous pattern for the other six. The defaults live behind a small `buildV2Runtime(options, repository)` helper near the top of `createApp` so route registration is not cluttered. Return the runtime bundle as `const v2 = buildV2Runtime(options, repository);` and thread it into every later route registration call via the `deps` parameter.

- [ ] GREEN: Create `src/types/fastify.d.ts` with a TypeScript module augmentation. The file content is the three-line block: `declare module "fastify" { interface FastifyRequest { currentAdmin?: MemberRecord; } }`. Import `MemberRecord` from `../domain/v2/types.js`. This file is picked up automatically by `tsconfig.json` `include` because it sits under `src/`. The augmentation means that every Fastify request object now has an optional `currentAdmin` field that is `undefined` by default and set to a `MemberRecord` by the `requireAdmin` hook.

- [ ] GREEN: Create `src/app-v2-errors.ts`. Export a single function `mapDomainErrorToHttp(err: unknown, reply: FastifyReply): FastifyReply`. The function body narrows the error with `if (err instanceof DomainError)` and switches on `err.code`. For each known code it calls `reply.code(status).send({ ok: false, code: err.code, message: err.message })`. The final branch (unknown error) calls `reply.request.log.error({ err }, "unhandled_error")` followed by `reply.code(500).send({ ok: false, code: "internal_error" })`. The switch ends with an exhaustive `default` that uses `const _never: never = err.code;` to force the TypeScript compiler to reject a future addition to the `DomainError` hierarchy that forgets to update this switch.

- [ ] GREEN: Add the `requireAdmin` factory to `src/app.ts`. It is a closure that takes a `Repository` and returns a Fastify `onRequest` hook. The hook reads `request.headers["x-feishu-open-id"]`, coerces to a trimmed string, calls `repository.findMemberByFeishuOpenId(openId)`, and short-circuits with 401 on missing header or 403 on missing or non-admin role. On success it assigns `request.currentAdmin = member` and the hook returns without calling `reply.send`. Export both the factory and the raw hook shape for testability.

- [ ] GREEN: Create `src/routes/v2/common.ts`. Re-export `mapDomainErrorToHttp` from `../../app-v2-errors.js`. Export `parseStrict(schema, body, reply)` — a helper that calls `schema.safeParse(body)` and either returns the parsed value or calls `reply.code(400).send({ ok: false, code: "invalid_body", details: parsed.error.flatten() })` and returns `null`. Export `adminGuard(repository)` as a thin alias over `requireAdmin(repository)` scoped to the v2 surface. The `common.ts` file becomes the single import surface that every route file in this phase pulls from, which keeps each route file's import block to a single line.

- [ ] GREEN: Run `npm test -- tests/api/v2/require-admin.test.ts tests/api/v2/app-wiring.test.ts`. All tests should now be green. If any assertion still fails, check the order of branches in the `requireAdmin` hook: 401 must come before 403 because a missing header is a more fundamental failure than a known-but-non-admin header. Also check that the factory is exported from `src/app.ts` and not just defined inline — the test file needs to import it directly.

- [ ] REFACTOR: DRY the middleware header-read logic into a single helper `readOpenIdHeader(request): string | null` inside `src/app.ts`. The helper trims whitespace and returns `null` for empty strings. This ensures that a header with only whitespace is treated the same as a missing header, which is the behaviour the tests assert.

- [ ] REFACTOR: Add a JSDoc block at the top of `src/app-v2-errors.ts` that lists every `DomainError` subclass and its HTTP mapping, so a future reader sees the full table at a glance without needing to read the switch body. The JSDoc is the developer-facing companion to spec section 6.4.

- [ ] REFACTOR: Run `npm run build` to confirm the type augmentation compiles. Fix any strict-mode gaps the compiler complains about. In particular, verify that `request.currentAdmin` is typed as `MemberRecord | undefined` everywhere so admin routes can safely write `request.currentAdmin!.id` after the guard has run (the `!` non-null assertion is safe because the guard short-circuits with 403 if the member is missing, so any code after the guard is only reachable when `currentAdmin` is defined).

- [ ] REFACTOR: Run the full `npm test -- tests/api/v2/` folder to confirm no existing test regressed. There should be no existing v2 tests yet, so this is a smoke check rather than a substantive assertion.

**Commit**

`feat(v2-api): add requireAdmin middleware and wire v2 dependencies into createApp`

**Why this commit is atomic**

All three deliverables — middleware, error mapper, and dep wiring — must land together. Splitting them would either leave a broken build between commits or force a later task to re-open `src/app.ts` for a second-round wiring fix. Keeping them in one commit honours the "atomic, reversible commit" guideline in the git-workflow rule.

### Task G2 — POST /api/v2/events

**Intent**

Task G2 exposes the `EventIngestor` built in Phase D through an HTTP endpoint. The route is the single entry point for manual event ingestion, primarily called by sub-project 2's card-action handler. It validates the body with Zod, forwards to the ingestor, and translates domain errors to HTTP per spec section 6.4.

**Why it is not admin-gated**

The `/api/v2/events` endpoint is reachable by any caller with network access. It is not admin-gated because the gating is inside the ingestor itself: `EventIngestor.ingest` calls `isEligibleStudent` before doing anything else. A student cannot elevate themselves to admin by POSTing events. A non-student who POSTs will receive a 400 `not_eligible` response because the ingestor will refuse. This matches spec section 5.5 layer 1.

**HTTP semantics**

The route returns 202 Accepted on success rather than 200 OK because the ingestor may enqueue an LLM scoring task for items that require LLM scoring (K3, K4, C1, C3, H2, G2). From the HTTP client's perspective, the event has been accepted for processing but the final scoring decision may not be available yet. A client that needs the final decision must poll the review queue or the member detail endpoint.

**Status code rationale**

The six domain errors map as follows. `not_eligible`, `cap_exceeded`, `duplicate` → 400 because they are user-input-level rejections: the caller sent something that the domain rules forbid, and the caller can fix the input. `no_active_period`, `ice_breaker_no_scoring`, `no_active_window` → 409 because they are temporal conflicts: the input is fine but the system is not in a state where the input can be processed. The distinction matters because a dashboard can react differently to the two categories — a 400 triggers "fix your input" and a 409 triggers "try again later".

**Files**

- `src/app.ts` — import `registerV2EventsRoute` and call it inside `createApp` after `buildV2Runtime`.
- `src/routes/v2/events.ts` — NEW. Exports `registerV2EventsRoute(app, deps)`.
- `tests/api/v2/events-post.test.ts` — NEW with eight failing tests.

**Steps**

- [ ] RED: Write all eight tests in `tests/api/v2/events-post.test.ts`. Each test boots `createApp({ databaseUrl: ":memory:", ingestor: fakeIngestor })` where `fakeIngestor.ingest` is a vitest `vi.fn()` with a scripted return value. Test 1 (happy path): `fakeIngestor.ingest` returns `{ eventId: "evt-123", status: "approved" }`; POST body `{ memberId: "m-1", itemCode: "K1", scoreDelta: 2, sourceRef: "card-123", payload: { note: "hi" } }`; assert 202 and body `{ ok: true, eventId: "evt-123" }`. Test 2 (not_eligible): `fakeIngestor.ingest` throws `new NotEligibleError("not_eligible", "m-1 is not a student")`; assert 400 and body `{ ok: false, code: "not_eligible", message: "m-1 is not a student" }`. Test 3 (cap_exceeded): throws `new PerPeriodCapExceededError("cap_exceeded", "K1 cap reached for period p-1")`; assert 400. Test 4 (duplicate): throws `new DuplicateEventError("duplicate", "sourceRef already ingested")`; assert 400. Test 5 (no_active_period): throws `new NoActivePeriodError("no_active_period", "no open period for camp c-1")`; assert 409. Test 6 (ice_breaker_no_scoring): throws `new IceBreakerPeriodError("ice_breaker_no_scoring", "ice breaker period does not score")`; assert 409. Test 7 (invalid body type): POST `{ memberId: 42, itemCode: null }` returns 400 with `{ ok: false, code: "invalid_body" }` and a `details` field. Test 8 (strict reject): POST `{ memberId: "m-1", itemCode: "K1", sourceRef: "s", extra: "forbidden" }` returns 400 `invalid_body` because the `.strict()` modifier rejects unknown keys. Run `npm test -- tests/api/v2/events-post.test.ts` and watch all eight fail with "Cannot find /api/v2/events".

- [ ] GREEN: Create `src/routes/v2/events.ts`. Export `function registerV2EventsRoute(app, deps)`. Inside, declare `const bodySchema = z.object({ memberId: z.string().min(1), itemCode: z.string().min(1), scoreDelta: z.number().int().optional(), sourceRef: z.string().min(1), payload: z.record(z.string(), z.unknown()).optional() }).strict();` followed by `type PostEventBody = z.infer<typeof bodySchema>;`. Register the route: `app.post<{ Body: PostEventBody }>("/api/v2/events", async (request, reply) => { const parsed = parseStrict(bodySchema, request.body, reply); if (!parsed) return; try { const result = await deps.ingestor.ingest(parsed); return reply.code(202).send({ ok: true, eventId: result.eventId }); } catch (err) { return mapDomainErrorToHttp(err, reply); } });`. Note the early-return pattern: `parseStrict` already called `reply.send` on the failure path, so a `null` return means the reply is already sealed.

- [ ] GREEN: Import `registerV2EventsRoute` from `src/app.ts` and call it inside `createApp` after `buildV2Runtime`. Pass the `v2` runtime bundle as `deps`. Run `npm test -- tests/api/v2/events-post.test.ts` — all eight tests should now pass.

- [ ] REFACTOR: Verify `src/routes/v2/events.ts` is under 120 lines. Verify the `parseStrict` helper preserves the original Zod flattened error so the `details` field in the 400 response is still useful for debugging. Run `npm run build` to catch any type issues introduced by the Zod generic on the `app.post` call.

- [ ] REFACTOR: Add a short JSDoc above `registerV2EventsRoute` noting that this route is the HTTP entrypoint for the `EventIngestor` and that the spec references are section 1.3 (API naming) and section 5.6 (`isEligibleStudent` as the single source of truth for eligibility). Future readers will thank you.

- [ ] REFACTOR: Run the full `npm test -- tests/api/v2/` folder to confirm G1 and G2 tests are both still green.

**Commit**

`feat(v2-api): add POST /api/v2/events route with ingestor integration and six-path error mapping`

### Task G3 — POST /api/v2/periods/open

**Intent**

Task G3 exposes `PeriodLifecycleService.openNewPeriod` through an HTTP endpoint. This is how trainer-initiated `/开期` commands from Feishu are translated into domain state changes. Sub-project 2 will call this endpoint directly from its slash-command handler.

**Edge case: window auto-settlement**

Spec section 3.5 establishes that opening a new period can trigger settlement of the previous window. The service returns `shouldSettleWindowId` non-null when that happens. The route must echo this field back to the caller so sub-project 2 can display a trainer-facing confirmation message such as "Period 4 opened. W1 has been settled." Without this echo, the trainer has no signal that a settlement just happened, and the audit trail becomes opaque.

**Why 201 Created rather than 202 Accepted**

The period is fully created and committed by the time the route returns. There is no pending background work (unlike the event ingestion endpoint, which may enqueue LLM tasks). 201 Created is the correct HTTP semantic for a synchronous resource creation.

**Files**

- `src/routes/v2/periods.ts` — NEW.
- `src/app.ts` — import and register.
- `tests/api/v2/periods-open.test.ts` — NEW with four failing tests.

**Steps**

- [ ] RED: Write four tests in `tests/api/v2/periods-open.test.ts`. Test 1 (happy path, no settlement): `fakePeriodLifecycle.openNewPeriod` returns `{ periodId: "p-2", assignedWindowId: "w-W1", shouldSettleWindowId: null }`; POST `/api/v2/periods/open` with body `{ number: 2 }`; assert 201 and body `{ ok: true, periodId: "p-2", assignedWindowId: "w-W1", shouldSettleWindowId: null }`. Test 2 (window-settle path): `openNewPeriod` returns `{ periodId: "p-4", assignedWindowId: "w-W3", shouldSettleWindowId: "w-W1" }`; assert 201 and body echoes `shouldSettleWindowId`. Test 3 (NoActiveWindow): `openNewPeriod` throws `new NoActiveWindowError("no_active_window", "W3 has not been opened by trainer")`; assert 409 and body `{ ok: false, code: "no_active_window", message: "W3 has not been opened by trainer" }`. Test 4 (invalid body): POST `{ number: "two" }` returns 400 `invalid_body`. Run the test file — all four fail.

- [ ] GREEN: Create `src/routes/v2/periods.ts`. Export `registerV2PeriodsOpenRoute(app, deps)`. Schema: `z.object({ number: z.number().int().min(1).max(12) }).strict()`. Handler calls `deps.periodLifecycle.openNewPeriod(body.number)`, wraps in try/catch, and uses `mapDomainErrorToHttp` for the failure path. On success it returns 201 and the full result bundle from the service.

- [ ] GREEN: Import into `src/app.ts` and call it inside `createApp`. Run `npm test -- tests/api/v2/periods-open.test.ts` — green.

- [ ] REFACTOR: Pull the shared `parseStrict` helper from Task G2. Verify the file stays under 80 lines. Verify the schema `min(1).max(12)` correctly rejects period numbers outside the 1-to-12 range by adding a fifth test case `POST { number: 13 } → 400 invalid_body`. If that test passes without additional work, no additional code is needed.

- [ ] REFACTOR: Add a comment block above the route explaining that this endpoint is trainer-initiated and does not require `requireAdmin` because the broader `/开期` slash-command flow in sub-project 2 already gates it inside Feishu. Document that sub-project 3 may choose to add `requireAdmin` if exposed to the admin console. Run `npm run build`.

**Commit**

`feat(v2-api): add POST /api/v2/periods/open route`

### Task G4 — POST /api/v2/periods/close (admin-only)

**Intent**

Task G4 exposes the manual-close escape hatch for a period that ran past its trainer-scheduled end. Spec section 3.5 lists `manual_close` as one of the three valid `closed_reason` values, alongside `next_period_opened` and `force_close_by_timeout`. This endpoint covers the `manual_close` case.

**Why it is admin-gated when G3 is not**

`POST /api/v2/periods/open` advances the camp forward, which is an idempotent operation from the trainer's perspective — even a mistaken "open" can be corrected by the next "open". `POST /api/v2/periods/close` is destructive in the sense that it commits the current period's scoring without waiting for the next period's trigger, which may leave some legitimate events stranded. That asymmetry is why closing requires admin authorisation while opening does not.

**Audit trail**

The `closePeriod` repository method accepts the closing admin's `openId` so the `closed_by_op_id` column on the `periods` table is populated. This lets the sub-project 3 dashboard show who closed each period, which is important for the biweekly compliance review.

**Files**

- `src/routes/v2/periods.ts` — extend with the close handler.
- `tests/api/v2/periods-close.test.ts` — NEW with three failing tests.

**Steps**

- [ ] RED: Write three tests in `tests/api/v2/periods-close.test.ts`. Test 1 (happy path): admin header present, member is operator; POST body `{ periodId: "p-2", reason: "manual_close" }` with header `x-feishu-open-id: ou-op-1`; assert 200 and body `{ ok: true }`; assert that `fakeRepository.closePeriod` was called with `("p-2", "manual_close", "ou-op-1")`. Test 2 (missing header): POST with no header returns 401 `no_identity`. Test 3 (student header): POST with a student's open id returns 403 `not_admin`. All three fail before the route exists.

- [ ] GREEN: Extend `src/routes/v2/periods.ts` with `registerV2PeriodsCloseRoute(app, deps)`. Register `app.post("/api/v2/periods/close", { onRequest: adminGuard(deps.repository) }, handler)`. Schema: `z.object({ periodId: z.string().min(1), reason: z.string().min(1) }).strict()`. Handler calls `deps.repository.closePeriod(body.periodId, body.reason, request.currentAdmin!.sourceFeishuOpenId ?? request.currentAdmin!.id)` and returns 200 `{ ok: true }`. Wrap in try/catch. The `!` non-null assertion on `currentAdmin` is safe because the `adminGuard` hook runs first and short-circuits with 403 if the member is missing, so any code after the hook is guaranteed to have a defined `currentAdmin`.

- [ ] GREEN: Export both route-registration functions from `src/routes/v2/periods.ts` and import them into `src/app.ts`. Run the tests — green.

- [ ] REFACTOR: DRY the admin-guard import: confirm `adminGuard` from `src/routes/v2/common.ts` is a thin alias over `requireAdmin(repository)` scoped to the v2 surface. The re-export gives every admin route a single import line and makes the intent obvious.

- [ ] REFACTOR: Run `npm run build` and `npm test -- tests/api/v2/periods-close.test.ts` to confirm all three green. Verify the type augmentation for `request.currentAdmin` propagates through the handler body — TypeScript should infer `currentAdmin` as `MemberRecord` (not `MemberRecord | undefined`) after the non-null assertion.

**Commit**

`feat(v2-api): add POST /api/v2/periods/close admin route`

### Task G5 — POST /api/v2/windows/open (admin-only)

**Intent**

Task G5 exposes the `/开窗` command described in spec section 3.5. Windows W3, W4, W5, and FINAL are lazy-loaded — they are not pre-seeded by the bootstrap script. The trainer opens them explicitly when the camp reaches the corresponding period range. Because a trainer mistake here would silently break the settlement pipeline (a missing window means the next period cannot be settled), the endpoint is admin-gated.

**Idempotency semantics**

Spec section 3.5 is clear that opening a window that already exists is not an error: it simply returns a 200 echo. This matters because sub-project 2's command handler may retry on network hiccups, and the retry must not create duplicate rows. The service `periodLifecycle.openWindow(code)` returns `{ windowId, created }` where `created: false` indicates idempotency. The HTTP route maps `created: true` to 201 (a new row was created) and `created: false` to 200 (no change, already existed).

**Regex rationale**

The window code regex is `/^W[1-5]$|^FINAL$/`, which accepts exactly W1 through W5 and FINAL. Any other string (W6, W0, W, FINAL2, final, lowercase variants) is rejected at the schema layer with a 400. This is deliberately strict because the trainer should not be able to type a window code with a typo — a typo that makes it past the schema would either crash the service or silently create a malformed row.

**Files**

- `src/routes/v2/windows.ts` — NEW.
- `src/app.ts` — register.
- `tests/api/v2/windows-open.test.ts` — NEW with five failing tests.

**Steps**

- [ ] RED: Write five tests. Test 1 (new window): `fakePeriodLifecycle.openWindow("W3")` returns `{ windowId: "w-W3", created: true }`; POST body `{ code: "W3" }` with operator header; assert 201 body `{ ok: true, windowId: "w-W3", created: true }`. Test 2 (idempotent): `openWindow("W2")` returns `{ windowId: "w-W2", created: false }`; assert 200 body `{ ok: true, windowId: "w-W2", created: false }`. Test 3 (regex reject W6): POST `{ code: "W6" }` returns 400 `invalid_body`. Test 4 (regex accept FINAL): POST `{ code: "FINAL" }` with the fake returning `{ created: true }` returns 201. Test 5 (admin missing): POST `{ code: "W3" }` with no header returns 401. Consider adding a sixth test for lowercase rejection: POST `{ code: "w1" }` returns 400.

- [ ] GREEN: Create `src/routes/v2/windows.ts`. Schema: `z.object({ code: z.string().regex(/^W[1-5]$|^FINAL$/) }).strict()`. Handler calls `deps.periodLifecycle.openWindow(body.code)`. Picks 201 if `result.created` is true, else 200. Wrap in try/catch. Register on `createApp` with `{ onRequest: adminGuard(deps.repository) }`.

- [ ] GREEN: Import into `src/app.ts`. Run `npm test -- tests/api/v2/windows-open.test.ts` — green.

- [ ] REFACTOR: Move the `WINDOW_CODE_REGEX` constant to `src/domain/v2/window-codes.ts` and import it both here and from Phase B/C code that already validates the pattern. Two copies of the regex drifting is a real risk without this extraction. The constant is exported with a type predicate helper: `export function isWindowCode(s: string): s is WindowCode` so call sites can narrow the type automatically.

- [ ] REFACTOR: Run `npm run build` to confirm nothing else broke, then re-run the G5 test file.

**Commit**

`feat(v2-api): add POST /api/v2/windows/open admin route`

### Task G6 — POST /api/v2/graduation/close (admin-only)

**Intent**

Task G6 exists because period 12, the final period of the camp, has no "next /开期" call to trigger settlement of the FINAL window. Spec section 8.3 mandates a separate `/结业` command that becomes this endpoint. The endpoint is the only way to finish the camp cleanly and commit the final promotions.

**Idempotency and the already-settled error**

Unlike the open-window endpoint, closing graduation is not idempotent: attempting to close graduation twice is a user error and should be rejected with a 409. The domain error is `WindowAlreadySettledError` with code `window_already_settled`. The error includes the previous settlement timestamp in the message so the operator can check the logs.

**Files**

- `src/routes/v2/graduation.ts` — NEW.
- `src/app.ts` — register.
- `tests/api/v2/graduation-close.test.ts` — NEW with three failing tests.

**Steps**

- [ ] RED: Write three tests. Test 1 (happy path): operator header present; POST with empty body `{}`; `fakePeriodLifecycle.closeGraduation` returns `{ finalWindowId: "w-FINAL", settled: true }`; assert 200 `{ ok: true, finalWindowId: "w-FINAL", settled: true }`. Test 2 (already settled): `closeGraduation` throws `new WindowAlreadySettledError("window_already_settled", "FINAL already settled at 2026-04-03T10:00:00Z")`; assert 409 and body echoes the code and message. Test 3 (student header): 403 `not_admin`.

- [ ] GREEN: Create `src/routes/v2/graduation.ts`. Schema: `z.object({}).strict()`. Handler calls `deps.periodLifecycle.closeGraduation(request.currentAdmin!)` passing the trainer's identity for audit logging. Wrap in try/catch. Register with `adminGuard`.

- [ ] GREEN: Import into `src/app.ts`. Run `npm test -- tests/api/v2/graduation-close.test.ts` — green.

- [ ] REFACTOR: Add a brief comment explaining that `/api/v2/graduation/close` exists because period 12 has no "next /开期" to trigger the FINAL window settlement (spec section 8.3). The comment helps future readers understand why this endpoint is separate from `/api/v2/windows/open`.

- [ ] REFACTOR: Run `npm run build` and the G6 test file.

**Commit**

`feat(v2-api): add POST /api/v2/graduation/close admin route`

### Task G7 — GET /api/v2/board/ranking

**Intent**

Task G7 is the first read-side endpoint. It returns the camp-wide ranking, pre-sorted by cumulative AQ descending then by display name ascending, with a computed `rank` field that handles ties via "1224" standard competition ranking. The endpoint is the primary data source for the sub-project 3 dashboard leaderboard view.

**Eligibility gate**

The query must filter out operators, trainers, and hidden members. This is spec section 5.5 layer 4. The filter is implemented as a JOIN-level WHERE clause inside `fetchRankingByCamp` so the API handler does not need to know about `isEligibleStudent`. This design keeps the gate in one place (the repository layer) and avoids the failure mode where a handler forgets to apply the gate and leaks operator data.

**Row shape**

Each ranking row contains the following fields:

- `memberId`: the primary key of the member.
- `memberName`: the display name shown in the leaderboard.
- `avatarUrl`: the cached Feishu avatar URL, or null if not yet synced.
- `currentLevel`: the integer level (L0 through L5 or LFINAL).
- `cumulativeAq`: the total AQ earned across all settled windows, used as the primary sort key.
- `latestWindowAq`: the AQ earned in the most-recently-settled window, shown as a secondary metric.
- `dimensions`: an object with five fields `K, H, C, S, G`, each an integer. This drives the radar chart in the dashboard.
- `rank`: the computed rank integer using standard competition ranking.

**Ties and rank computation**

Standard competition ranking ("1224" ranking) means that when two members are tied, they both receive the same rank, and the next member receives a rank that accounts for the tied pair. For example, if members A and B are tied for rank 1, they both get rank 1, and the next member gets rank 3 (not rank 2). The test suite covers this edge case.

**Files**

- `src/routes/v2/board.ts` — NEW.
- `src/storage/sqlite-repository.ts` — extend with a `fetchRankingByCamp(campId: string)` method that joins `members`, `member_levels`, `member_dimension_scores`, and `window_snapshots` with the `isEligibleStudent` gate.
- `tests/api/v2/board-ranking.test.ts` — NEW with four failing tests.
- `tests/storage/sqlite-repository-v2-ranking.test.ts` — NEW unit test for the repository method.

**Steps**

- [ ] RED: Write the repository test first in `tests/storage/sqlite-repository-v2-ranking.test.ts`. Seed five members: four students with distinct cumulative AQ values (100, 75, 75, 50 — deliberately tied at 75 so the name-ASC tiebreak is exercised), and one operator with cumulative AQ 200 (to prove the operator is excluded). Populate fake `window_snapshots` rows and `member_levels` rows. Assert that `repo.fetchRankingByCamp("c-1")` returns exactly four rows in the correct order: the 100-AQ student at rank 1, then the two 75-AQ students in name-ASC order at rank 2 (both tied), then the 50-AQ student at rank 4. The operator row is excluded. The rank array is `[1, 2, 2, 4]` using standard competition ranking. Red because the method does not exist.

- [ ] RED: Write four tests in `tests/api/v2/board-ranking.test.ts`. Test 1 (empty): no members; GET `/api/v2/board/ranking?campId=c-1`; assert 200 body `{ ok: true, campId: "c-1", rows: [] }`. Test 2 (single student): seed one student with snapshot data; assert 200 body has one row with all seven fields: `memberId, memberName, avatarUrl, currentLevel, cumulativeAq, latestWindowAq, dimensions: { K, H, C, S, G }, rank: 1`. Test 3 (five-member ordering): seed five students with known cum AQ values with a deliberate name-ASC tiebreak; assert `rows` is ordered cum AQ DESC then name ASC, and the `rank` array matches standard competition ranking. Test 4 (operator excluded): seed a student plus an operator with higher cum AQ; assert the operator does not appear in the response.

- [ ] GREEN: Implement `fetchRankingByCamp` in `src/storage/sqlite-repository.ts` using the JOIN described above. The query is approximately: `SELECT m.id, m.display_name, m.avatar_url, ml.current_level, mds.cumulative_aq, mds.latest_window_aq, mds.dim_k, mds.dim_h, mds.dim_c, mds.dim_s, mds.dim_g FROM members m JOIN member_levels ml ON ml.member_id = m.id JOIN member_dimension_scores mds ON mds.member_id = m.id WHERE m.camp_id = ? AND m.role_type = 'student' AND m.is_participant = 1 AND m.is_excluded_from_board = 0 AND m.hidden_from_board = 0 ORDER BY mds.cumulative_aq DESC, m.display_name ASC`. Return rows with the exact shape asserted by the tests. The rank assignment is hand-written in the repository (or through a small helper `assignRanks(rows)`) so the API layer stays thin. The helper sorts by `cumulativeAq` DESC, then `memberName` ASC, then walks the sorted list assigning standard competition ranks: rank starts at 1, increments by the count of equal-AQ members when moving to the next distinct AQ value.

- [ ] GREEN: Implement `src/routes/v2/board.ts` with a `registerV2BoardRoutes(app, deps)` function. Schema: querystring `z.object({ campId: z.string().min(1) }).strict()`. Handler: `const rows = await deps.repository.fetchRankingByCamp(query.campId); return reply.send({ ok: true, campId: query.campId, rows });` wrapped in the standard try/catch. Register both board routes (G7 plus the upcoming G8) from the same file so related logic lives together.

- [ ] GREEN: Run `npm test -- tests/api/v2/board-ranking.test.ts tests/storage/sqlite-repository-v2-ranking.test.ts` — all green.

- [ ] REFACTOR: Move the `assignRanks` helper to `src/domain/v2/rank.ts` and write one unit test for it with a ties scenario. The helper must be pure and deterministic so both Phase F snapshots and Phase G API reuse it without drift. Run `npm run build`.

- [ ] REFACTOR: Verify the JOIN in `fetchRankingByCamp` returns a single row per member even when multiple window snapshots exist. Use `GROUP BY members.id` and a subquery for the latest window snapshot per member. Add a test assertion for a member with two settled windows that only the latest window's AQ is used as `latestWindowAq`.

- [ ] REFACTOR: Profile the query on a seeded database with 50 members across 5 settled windows to confirm it runs in under 50 milliseconds. If it exceeds that, add a composite index on `(camp_id, role_type, hidden_from_board)` to `members` and re-profile.

**Commit**

`feat(v2-api): add GET /api/v2/board/ranking with camp-scoped eligibility gate`

### Task G8 — GET /api/v2/board/member/:id

**Intent**

Task G8 returns the per-member detail panel shown on the sub-project 3 dashboard: current level badge, promotion history, dimension time series, and window-snapshot timeline. It must return 404 for any member that is not an eligible student (operator, trainer, hidden, excluded, or unknown).

**Why 404 for operators**

An operator's member id is a valid DB row, but returning their detail panel would leak scoring data that was recorded before they were promoted (per spec section 5.8, historical data is preserved but hidden from the dashboard). The 404 response hides the existence of operator rows from the API surface, which matches the "data silently disappears" guarantee in spec section 5.8.

**Detail panel shape**

The response wraps the detail object inside `{ ok: true, detail: {...} }` so the response envelope stays consistent with the ranking endpoint. The `detail` object has the following fields:

- `memberId`
- `memberName`
- `avatarUrl`
- `currentLevel`
- `promotions`: array of `{ fromLevel, toLevel, windowId, promotedAt }` objects.
- `dimensionSeries`: array of per-window dimension snapshots, one per settled window, in window-code order (W1, W2, W3, W4, W5, FINAL).
- `windowSnapshots`: array of per-window AQ totals, also in window-code order.

**Files**

- `src/routes/v2/board.ts` — extend.
- `src/storage/sqlite-repository.ts` — add `fetchMemberBoardDetail(memberId: string): MemberBoardDetail | null`.
- `tests/api/v2/board-member-detail.test.ts` — NEW with four failing tests.
- `tests/storage/sqlite-repository-v2-member-detail.test.ts` — NEW.

**Steps**

- [ ] RED: Write the repository test first. Seed one student with a promotion record and two settled window snapshots; assert `fetchMemberBoardDetail("m-1")` returns `{ memberId, memberName, avatarUrl, currentLevel, promotions: [...], dimensionSeries: [...], windowSnapshots: [...] }` with the expected array lengths and field names. Also assert `fetchMemberBoardDetail("m-999")` returns `null`. Also assert that calling with an operator id returns `null` because the query JOINs the eligibility gate.

- [ ] RED: Write four tests in `tests/api/v2/board-member-detail.test.ts`. Test 1 (existing student): GET `/api/v2/board/member/m-1` returns 200 with the full payload wrapped in `{ ok: true, detail: {...} }`. Test 2 (unknown id): GET `/api/v2/board/member/m-ghost` returns 404 `{ ok: false, code: "not_found" }`. Test 3 (operator id): GET `/api/v2/board/member/op-1` returns 404 because the repository method also gates on `isEligibleStudent`. Test 4 (URL encoding): GET `/api/v2/board/member/m%2D1` (URL-encoded dash) returns 200 and the route correctly decodes the id.

- [ ] GREEN: Implement the repository method. Use a single query that LEFT JOINs `promotion_records`, `member_dimension_scores`, and `window_snapshots` for the given member id, aggregated into arrays via a result-builder pattern because SQLite does not support native JSON aggregation without an extension. The result-builder walks the rows and folds them into the `MemberBoardDetail` shape. Return `null` if the member does not exist or does not pass the eligibility gate.

- [ ] GREEN: Implement the route in `src/routes/v2/board.ts`. Schema: params `z.object({ id: z.string().min(1) }).strict()`. Handler returns the detail payload wrapped in `{ ok: true, detail }` on success, or `reply.code(404).send({ ok: false, code: "not_found" })` on null. Wrap in try/catch.

- [ ] GREEN: Run `npm test -- tests/api/v2/board-member-detail.test.ts` — green.

- [ ] REFACTOR: Extract a `MemberBoardDetail` TypeScript interface into `src/domain/v2/types.ts` so sub-project 3 can import it directly when rendering the dashboard. This avoids duplication between the repository return type, the route return type, and the frontend consumption type. The interface is exported from the domain layer, not the API layer, because it describes a domain concept (a member's dashboard view) rather than an API shape.

- [ ] REFACTOR: Run `npm run build` and the G8 tests.

- [ ] REFACTOR: Verify the repository method's behaviour on a member with zero promotions and one settled window. The `promotions` array should be empty, not null. The `dimensionSeries` and `windowSnapshots` arrays should each have one entry. Add a dedicated test for this edge case.

**Commit**

`feat(v2-api): add GET /api/v2/board/member/:id with 404 on non-eligible members`

### Task G9 — Admin Review Queue

**Intent**

Task G9 is the LLM complaint desk. When the LLM worker marks an event `review_required` (either because the LLM rejected the content or because the worker exhausted retries), the event lands in this queue. Trainers and operators see it through the admin dashboard and decide approve or reject. The GET endpoint lists pending reviews; the POST endpoint commits a decision.

**Why the POST body has both a decision and a note**

The note is mandatory because spec section 5.5 layer 2 requires audit tagging for every admin decision. A decision without a note is less useful than a decision with a note for the biweekly compliance review. The note also helps the LLM prompt team debug why a particular kind of input keeps getting rejected.

**Decision propagation**

`aggregator.applyDecision(eventId, { decision, note }, operator)` flips the event status from `review_required` to either `approved` or `rejected`, updates the `reviewed_by_op_id` and `review_note` columns, and, on approval, increments the member's dimension score. The aggregator handles the cap-checking and deduplication, so the API route does not need to worry about those concerns.

**Files**

- `src/routes/v2/admin-review.ts` — NEW.
- `src/storage/sqlite-repository.ts` — extend with `listReviewRequiredEvents({ campId? })` and a lightweight `findReviewEvent(eventId)`.
- `tests/api/v2/admin-review-queue.test.ts` — NEW with six failing tests.

**Steps**

- [ ] RED: Write six tests. Test 1 (GET happy): three `review_required` events seeded; GET `/api/v2/admin/review-queue` with operator header returns 200 body `{ ok: true, rows: [...] }` with exactly three entries that include `eventId, memberId, memberName, itemCode, dimension, scoreDelta, createdAt, llmTaskId`. Test 2 (GET empty): no events; returns 200 `{ ok: true, rows: [] }`. Test 3 (GET student header): returns 403. Test 4 (POST approved): `fakeAggregator.applyDecision` accepts `("evt-1", { decision: "approved", note: "looks good" }, operator)`; POST body `{ decision: "approved", note: "looks good" }`; assert 200 `{ ok: true }` and the fake was called with the correct third argument. Test 5 (POST rejected): same shape with `decision: "rejected"`; asserts the fake was called with the reject decision. Test 6 (POST invalid decision): body `{ decision: "banana", note: "x" }` returns 400 `invalid_body`.

- [ ] GREEN: Implement `listReviewRequiredEvents({ campId? })` and `findReviewEvent(eventId)` on the repository. The listing query JOINs `scoring_item_events` with `members` to pull `memberName` and with `llm_scoring_tasks` to pull `llmTaskId`. The `campId` filter is applied as `WHERE members.camp_id = ?` if provided, otherwise listed across all camps (single-camp deployments do not care).

- [ ] GREEN: Create `src/routes/v2/admin-review.ts`. GET schema: query `z.object({ campId: z.string().min(1).optional() }).strict()`. POST body schema: `z.object({ decision: z.enum(["approved", "rejected"]), note: z.string().min(1) }).strict()`. POST params schema: `z.object({ eventId: z.string().min(1) }).strict()`. GET handler lists events and returns them. POST handler calls `deps.aggregator.applyDecision(params.eventId, body, request.currentAdmin!)` and returns 200 on success. Both handlers wrapped with `adminGuard`.

- [ ] GREEN: Register in `src/app.ts`. Run `npm test -- tests/api/v2/admin-review-queue.test.ts` — green.

- [ ] REFACTOR: Verify that the POST handler forwards the `currentAdmin` identity to `aggregator.applyDecision` so the decision is audit-tagged correctly (see spec section 5.5 layer 2). Add a dedicated assertion in test 4 that captures the third argument passed to `fakeAggregator.applyDecision.mock.calls[0][2]` and checks it equals the operator member object.

- [ ] REFACTOR: Run `npm run build` and all G9 tests.

- [ ] REFACTOR: Add a test that attempts to POST a decision for an event that is not in `review_required` state. The aggregator should throw a domain error (for example `InvalidDecisionStateError`) and the route should return 409. If the error type does not exist in the current domain layer, document the gap in a code comment and skip the test until Phase D provides the error.

**Commit**

`feat(v2-api): add GET /api/v2/admin/review-queue and POST decide routes`

### Task G10 — Admin Member Management

**Intent**

Task G10 lets operators edit member metadata from the admin dashboard. The GET endpoint lists every member (admin sees everything, including operators and trainers). The PATCH endpoint applies a partial update to a single member. The PATCH body is dynamic: every field is optional, and any combination is valid as long as at least one field is set.

**Security constraint: SQL injection**

The PATCH handler must use parameter binding for the dynamic UPDATE. A naive string-concatenation approach would let an operator inject SQL through `displayName`. Because the PATCH endpoint is admin-gated, the attack surface is small, but the coding-standard rule against SQL injection is absolute: every query uses parameter binding regardless of the trust level of the caller.

**Partial update pattern**

The PATCH handler walks the parsed body object, builds a list of `${column} = ?` fragments for each present key, and passes the corresponding values as a parameter array. The column names are hard-coded inside the repository method, not taken from the body keys, so a malicious body cannot inject a column name like `id = 'admin'; DROP TABLE users`. The hard-coded column list is a whitelist of editable columns: `role_type`, `is_participant`, `is_excluded_from_board`, `hidden_from_board`, `display_name`.

**Role type enum**

The PATCH schema validates `roleType` against the enum `["student", "operator", "trainer", "observer"]`. A value outside the enum is rejected with 400 `invalid_body`. This ensures that an operator cannot accidentally set a member to an undefined role like "superadmin" or "admin".

**Files**

- `src/routes/v2/admin-members.ts` — NEW.
- `src/storage/sqlite-repository.ts` — extend with `listMembersForAdmin()` and `patchMemberForAdmin(id, patch)`.
- `tests/api/v2/admin-members.test.ts` — NEW with five failing tests.
- `tests/storage/patch-member-for-admin.test.ts` — NEW. Stand-alone test for the SQL-injection guarantee.

**Steps**

- [ ] RED: Write five tests in `tests/api/v2/admin-members.test.ts`. Test 1 (GET happy): three members seeded (one student, one operator, one trainer); GET `/api/v2/admin/members` with operator header returns 200 with all three rows and fields `{ id, displayName, roleType, isParticipant, isExcludedFromBoard, hiddenFromBoard }`. Test 2 (GET student header): 403. Test 3 (PATCH happy): PATCH `/api/v2/admin/members/m-1` with body `{ roleType: "operator", hiddenFromBoard: true }`; assert 200 `{ ok: true, member: {...updated} }` and the repository was called. Test 4 (PATCH partial): body `{ displayName: "Alice v2" }` only; assert the other fields are not touched by re-fetching the member and verifying the other columns are unchanged. Test 5 (PATCH unknown field): body `{ roleType: "superadmin" }` returns 400 (enum reject), and body `{ unknownKey: true }` returns 400 (strict reject).

- [ ] RED: Write the SQL-injection test in `tests/storage/patch-member-for-admin.test.ts`. Seed one member. Call `patchMemberForAdmin("m-1", { displayName: "'; DROP TABLE members; --" })`. Assert that the `members` table still exists (query `sqlite_master` for the row) and the member's `displayName` is literally the injection string (not interpreted as SQL). This guarantees parameter binding is in effect.

- [ ] GREEN: Implement `listMembersForAdmin()` — a SELECT with no filter because admin sees everything. Implement `patchMemberForAdmin(id, patch)` that builds a dynamic UPDATE from the set keys using parameter binding only. Pattern: walk the patch object, push `${column} = ?` into a `setFragments` array and the value into a `params` array, then call `db.prepare(\`UPDATE members SET ${setFragments.join(", ")} WHERE id = ?\`).run(...params, id)`. The column names are hard-coded to prevent table-name injection.

- [ ] GREEN: Create `src/routes/v2/admin-members.ts`. GET handler lists and returns members. PATCH schema: `z.object({ roleType: z.enum(["student","operator","trainer","observer"]).optional(), isParticipant: z.boolean().optional(), isExcludedFromBoard: z.boolean().optional(), hiddenFromBoard: z.boolean().optional(), displayName: z.string().min(1).optional() }).strict().refine((data) => Object.keys(data).length > 0, { message: "empty_patch" })`. Handlers wrapped with `adminGuard`.

- [ ] GREEN: Register in `src/app.ts`. Run `npm test -- tests/api/v2/admin-members.test.ts tests/storage/patch-member-for-admin.test.ts` — all green.

- [ ] REFACTOR: Verify the PATCH response actually echoes the updated member shape by re-fetching the row after the UPDATE. The naive implementation would return the pre-update object; the correct implementation calls `findMemberById(id)` after the UPDATE completes and returns the fresh row.

- [ ] REFACTOR: Run `npm run build` and all G10 tests.

- [ ] REFACTOR: Audit the `findMemberById` method used by the re-fetch. It must return a non-null row for a member that exists and null for a member that does not. Add a test for the PATCH-then-404 case: if the member id in the URL does not exist, the route returns 404 `not_found` rather than 200 with an empty member.

**Commit**

`feat(v2-api): add GET /api/v2/admin/members and PATCH /:id admin routes`

### Task G11 — GET /api/v2/llm/worker/status

**Intent**

Task G11 is the single monitoring endpoint for the LLM worker. It lets the admin dashboard show a running indicator, current queue depth, and last heartbeat. It is not admin-gated because it exposes only non-sensitive operational metrics.

**Status shape**

The status object has five fields:

- `running`: boolean. True if the worker loop is active.
- `concurrency`: integer. The configured concurrency level (from `LLM_CONCURRENCY`).
- `activeTasks`: integer. The number of tasks currently being processed by the worker.
- `queueDepth`: integer. The number of tasks in `pending` or `retrying` state in the DB.
- `lastHeartbeatAt`: ISO-8601 timestamp. The most recent time the worker loop completed a tick.

**Why it is not admin-gated**

Operational metrics (is the worker alive, how deep is the queue) are not sensitive enough to require admin authentication. They do not expose PII or scoring decisions. Making the endpoint public lets monitoring tools (health check probes, Prometheus exporters) poll without needing a service account.

**Files**

- `src/routes/v2/llm-status.ts` — NEW.
- `src/app.ts` — register.
- `tests/api/v2/llm-worker-status.test.ts` — NEW with two failing tests.

**Steps**

- [ ] RED: Write two tests. Test 1 (running): `fakeLlmWorker.getStatus()` returns `{ running: true, concurrency: 3, activeTasks: 1, queueDepth: 4, lastHeartbeatAt: "2026-04-10T10:00:00Z" }`; GET `/api/v2/llm/worker/status` returns 200 body `{ ok: true, status: {...} }`. Test 2 (stopped): `getStatus` returns `{ running: false, concurrency: 3, activeTasks: 0, queueDepth: 0, lastHeartbeatAt: null }`; returns 200 with echoed status.

- [ ] GREEN: Create `src/routes/v2/llm-status.ts` with `registerV2LlmStatusRoute(app, deps)`. Handler calls `deps.llmWorker.getStatus()` and returns it directly wrapped in `{ ok: true, status }`. Wrap in try/catch. Register from `createApp`. Run tests — green.

- [ ] REFACTOR: Add a JSDoc block explaining that the status shape mirrors the interface defined in the Phase E plan and must stay in sync with `LlmScoringWorker.getStatus()`. Link the comment to the relevant Phase E task by filename.

- [ ] REFACTOR: Run `npm run build` and all G11 tests. Then run the full `npm test -- tests/api/v2/` folder to confirm Phase G is holistically green before moving on to Phase H. The full folder should have approximately 54 passing tests and zero skipped.

**Commit**

`feat(v2-api): add GET /api/v2/llm/worker/status monitoring route`

### Phase G Exit Checkpoint

Before moving on to Phase H, all of the following must be true. This list is the strict gate — if any one item is not satisfied, Phase G is not done.

- [ ] `npm test -- tests/api/v2/` is green with zero skipped tests.
- [ ] `npm run build` compiles the full tree without TypeScript errors.
- [ ] `src/app.ts` stays under 800 lines (route registration is delegated to modules under `src/routes/v2/*`).
- [ ] Every admin route rejects missing `x-feishu-open-id` with 401 and non-admin roles with 403.
- [ ] Every public route uses Zod strict parsing and returns 400 on unknown keys.
- [ ] `mapDomainErrorToHttp` is the single catch-block helper used by all v2 routes.
- [ ] No route contains `console.log` or a hard-coded camp id.
- [ ] `git status` shows no uncommitted test fixtures or scratch files.
- [ ] The eleven Task G commits are in place, each on its own line of `git log --oneline`.
- [ ] The Phase G task summary table at the top of this phase accurately reflects what was shipped. Update the table if any deviations occurred during implementation.
- [ ] The `requireAdmin` middleware has been exercised by at least one test from each of tasks G4, G5, G6, G9, and G10 to confirm the middleware composes correctly with every admin route type.
- [ ] The `mapDomainErrorToHttp` helper has been exercised by at least one test from each of tasks G2, G3, G6 (the three routes that deliberately throw domain errors in their test suites) to confirm the mapper handles every code in spec section 6.4.
- [ ] The total count of new files under `src/routes/v2/*` is nine: `common.ts`, `events.ts`, `periods.ts`, `windows.ts`, `graduation.ts`, `board.ts`, `admin-review.ts`, `admin-members.ts`, `llm-status.ts`.
- [ ] Every route file is under 200 lines.
- [ ] `vitest --list` shows no duplicate test names inside `tests/api/v2/`.
- [ ] The type augmentation in `src/types/fastify.d.ts` is picked up by `tsconfig.json` include and produces no "implicit any" warnings in strict mode.
- [ ] Every new test file uses `createApp({ databaseUrl: ":memory:" })` and never touches the real DB.
- [ ] Every new test file imports `FastifyInstance` from `fastify` rather than declaring a custom type alias.
- [ ] Every new test file uses `app.inject` and does not call `app.listen`.
- [ ] No test file uses a sleep timer or a polling loop that can flake.
- [ ] Every fake service in the test files is constructed with `vi.fn()` so call-count and call-order assertions are possible.

---

## Phase H — Startup, Seed, and End-to-End Bootstrap (4 tasks)

Phase H makes the new scoring-v2 surface usable in development and production. It extends `.env.example` with the LLM worker knobs from the spec, teaches `server.ts` to spin up the LLM worker alongside Fastify with clean shutdown, upgrades the bootstrap seed script so it backfills W1/W2 shells and promotes bootstrap operators, and closes the loop with a single end-to-end test that exercises the whole v2 pipeline through `fastify.inject`.

### Why Phase H Exists

Phase G shipped the HTTP surface. Phase H connects the HTTP surface to the operational lifecycle of the process. Without Phase H the scoring v2 surface is technically complete but practically unusable: the LLM worker would not start at boot, the bootstrap seed would not backfill the new window shells, the `.env.example` would be out of sync with the code, and there would be no single test that proves the whole pipeline works end-to-end. Each of these gaps would be a blocker for sub-project 2 and sub-project 3 because they would have to guess at the production configuration.

Phase H is also the phase where we prove the system can restart cleanly. A naive implementation might start the LLM worker but never stop it, leaving a dangling timer that prevents `process.exit` from running. The lifecycle test in Task H2 catches exactly that bug.

### Phase H Task Summary

| Task | Scope | New Files | Tests |
|---|---|---|---|
| H1 | `.env.example` extension | none (edit existing) | `tests/config/env-example-shape.test.ts` |
| H2 | LLM worker lifecycle in `server.ts` | `src/services/v2/llm-scoring-client-factory.ts` | `tests/server/llm-lifecycle.test.ts` |
| H3 | bootstrap seed refactor | none (edit existing) | `tests/scripts/ensure-bootstrap-data-v2.test.ts` |
| H4 | full-pipeline E2E | `tests/api/v2/helpers.ts` | `tests/api/v2/end-to-end.test.ts` |

### Task H1 — Extend .env.example

**Intent**

Task H1 documents the six new environment keys introduced by Phase E (LLM worker knobs) and spec section 5.9 (bootstrap operator list). The `.env.example` file is the canonical source of documented env keys. Every key shipped by the codebase must appear here with a comment explaining its purpose and default value. A missing key in `.env.example` means a developer spinning up a fresh clone will not know the key exists, which leads to silent production-time surprises.

**Keys introduced**

- `LLM_CONCURRENCY` — maximum concurrent LLM scoring requests (default 3). Higher values trade latency for cost. A typical production value is 3 to 5.
- `LLM_RATE_LIMIT_PER_SEC` — max requests per second across the whole worker (default 5). This is a global limit, not per-task. The worker applies a token-bucket algorithm.
- `LLM_POLL_INTERVAL_MS` — worker poll interval when the queue is empty (default 1500). Lower values reduce latency at the cost of CPU.
- `LLM_TASK_TIMEOUT_MS` — per-task timeout before retry (default 30000). Individual LLM calls that exceed this timeout are cancelled and requeued.
- `LLM_MAX_ATTEMPTS` — total attempts per task before surrendering to review_required (default 3). Each attempt uses exponential backoff.
- `BOOTSTRAP_OPERATOR_OPEN_IDS` — comma-separated list of Feishu open ids to auto-promote to operator at seed time (default empty). Used to give initial admin access to the system.

**Why these defaults**

The defaults are chosen to give a working dev environment without additional configuration. `LLM_CONCURRENCY=3` is low enough that local dev on a laptop does not saturate a paid LLM endpoint. `LLM_RATE_LIMIT_PER_SEC=5` matches the rate limit of most free-tier LLM providers. `LLM_POLL_INTERVAL_MS=1500` is fast enough that a developer testing the system sees near-real-time scoring but slow enough that a background worker does not thrash the CPU. `LLM_TASK_TIMEOUT_MS=30000` is generous — most LLM scoring calls complete in under 5 seconds, so a 30-second timeout catches only genuinely broken requests.

**Files**

- `.env.example` — extend with the six new keys.
- `src/config/load-env.ts` — no behaviour change, but update the JSDoc at the top to list the new keys.
- `tests/config/env-example-shape.test.ts` — NEW. Parses `.env.example` and asserts the six new keys are present and commented.

**Steps**

- [ ] RED: Write `tests/config/env-example-shape.test.ts` that reads `.env.example` via `fs.readFileSync`, splits into lines, and asserts each of the six keys is present on its own line with a comment on the line immediately above it. Use a helper `findKeyWithComment(lines, key)` that walks the lines in pairs and returns `{ key, comment }` or `null`. Assert each of the six lookups is non-null. The test should also confirm that the key names appear in the correct case: `LLM_CONCURRENCY` not `llm_concurrency`. Red because the file does not yet contain any of the new keys.

- [ ] GREEN: Edit `.env.example`. Preserve every existing key and the ordering of Step 5 (which must still be present — the bootstrap step is load-bearing for the legacy seed path and is still referenced by `ensure-bootstrap-data.ts`). Below the existing Step 5 block, add the six new keys with an explanatory comment above each. Example format: `# Maximum concurrent LLM scoring requests (default 3). Higher values trade latency for cost.` followed by `LLM_CONCURRENCY=3`. Do the same for rate limit per second (default 5), poll interval in ms (default 1500), task timeout in ms (default 30000), max attempts (default 3), and the bootstrap operator CSV (default empty).

- [ ] GREEN: Update the JSDoc at the top of `src/config/load-env.ts` to list the new keys. This does not change the runtime behaviour of `loadLocalEnv`, which already reads every key from `process.env`, but it documents the contract for future readers. The JSDoc should be a bullet list with one line per key: `// - LLM_CONCURRENCY: max concurrent LLM scoring requests (default 3)`.

- [ ] GREEN: Run `npm test -- tests/config/env-example-shape.test.ts` — green.

- [ ] REFACTOR: Reorder the new block so it is grouped under a clear `# --- LLM Worker (sub-project 1 Phase E) ---` section header followed by a `# --- Bootstrap Operators (spec section 5.9) ---` header. Re-run the test to confirm the shape-checking tolerates the header lines. If the test fails because the shape checker is too strict about the blank lines around headers, relax the helper to skip blank lines and comment-only lines when walking pairs.

- [ ] REFACTOR: Run `node -e "require('dotenv').config({ path: '.env.example' })"` to verify the file still parses cleanly as a dotenv document. Fix any syntax errors the parser reports. Common pitfalls: values with spaces must be quoted, values with `#` are interpreted as comments unless quoted, and line continuations must be avoided entirely.

- [ ] REFACTOR: Run `npm run build` (no effect expected because the file is not imported) and confirm nothing regressed. Also run the full `npm test` to confirm the env file change did not break any existing test that reads env values at import time.

**Commit**

`chore(v2): document LLM worker and bootstrap operator env keys`

### Task H2 — Extend src/server.ts For LLM Worker Lifecycle

**Intent**

Task H2 makes the LLM worker a first-class citizen of the Fastify server lifecycle. The worker starts after `app.ready()` and stops before `app.close()` on SIGTERM or SIGINT. A small factory `buildLlmScoringClient` decides whether to wire the fake client (dev, test) or the real OpenAI-compatible client (when `LLM_ENABLED=true` and an API key is present). The factory is extracted into its own file so the test harness can stub it.

**Clean shutdown semantics**

Shutdown order matters. The worker must drain its in-flight tasks before Fastify closes, otherwise in-flight tasks would be lost and their events would remain stuck in `pending` forever. The correct sequence is: stop accepting new tasks (`llmWorker.stop()` awaits the in-flight drain) → close Fastify (`app.close()`). Reversing the order means Fastify stops accepting new requests first, which would allow the worker to continue processing — but the HTTP API for `POST /api/v2/events` is already closed, so no new tasks enter the queue. The ordering we chose is still correct, but it is worth documenting why it matters.

**Idempotent signal handling**

If SIGTERM fires twice in rapid succession (for example because a supervisor retries the signal), the second signal must be a no-op. A `let stopping = false` latch at the top of the handler guarantees idempotency. Without the latch, the second signal would call `worker.stop()` a second time, which is a domain error in the worker (it expects to be stopped exactly once per lifetime).

**Why the factory is extracted**

The `buildLlmScoringClient` factory is in its own file so that tests can stub the factory without touching the worker. Tests that want to verify the worker lifecycle do not want to test the factory's branching logic, and tests that want to verify the factory's branching logic do not want to start a real worker. Splitting the two concerns into two files makes each test focused.

**Files**

- `src/server.ts` — extend.
- `src/services/v2/llm-scoring-client-factory.ts` — NEW. Tiny factory.
- `tests/server/llm-lifecycle.test.ts` — NEW with two failing tests.

**Steps**

- [ ] RED: Write two tests in `tests/server/llm-lifecycle.test.ts`. Test 1 asserts `startLlmWorker(app, deps)` calls `deps.llmWorker.start` exactly once. The test uses a minimal Fastify app and a vitest `vi.fn()` mock for `llmWorker.start`. After calling `startLlmWorker`, the test asserts `mock.calls.length === 1`. Test 2 asserts `stopLlmWorker(app, deps)` calls `deps.llmWorker.stop` exactly once, calls `app.close` exactly once, and resolves only after both have completed — verified via call-order assertions on the vitest `vi.fn()` mocks. Use `mock.calls` with the recorded call order to assert `stop` was called before `close`. Include a third assertion in test 2: sending SIGTERM twice (simulated by calling the helper twice) does not double-invoke `stop`. Red because the helpers do not exist.

- [ ] GREEN: Create `src/services/v2/llm-scoring-client-factory.ts` exporting `function buildLlmScoringClient(env: NodeJS.ProcessEnv): LlmScoringClient`. Inside: if `env.LLM_ENABLED !== "true"` or no API key is present, return `new FakeLlmScoringClient()`. Otherwise call `readLlmProviderConfig(env)` and return `new OpenAICompatibleLlmScoringClient(providerConfig)`. The factory is also the only place that ever constructs a client, so tests can stub the factory without touching the worker. Add a second exported helper `isRealLlmEnabled(env): boolean` that encapsulates the decision logic for reuse.

- [ ] GREEN: Update `src/server.ts`. Export `async function startLlmWorker(app, deps)` that calls `deps.llmWorker.start()` and returns once the worker has reached the "running" state. Export `async function stopLlmWorker(app, deps)` that awaits `deps.llmWorker.stop()` then `app.close()`, guarded by a module-level `let stopping = false` latch. Inside the default bootstrap block at the bottom of the file, construct the worker with the configured knobs from `process.env`, call `await startLlmWorker(app, { llmWorker })` after `app.ready()`, and register `process.on("SIGTERM", () => stopLlmWorker(app, { llmWorker }))` plus the same for `SIGINT`.

- [ ] GREEN: Run `npm test -- tests/server/llm-lifecycle.test.ts` — all tests green.

- [ ] REFACTOR: Verify the signal-handler guard is idempotent by sending SIGTERM twice in a tight loop inside the test. Add a third assertion to confirm that `deps.llmWorker.stop` was still called exactly once. Implement the guard if it was missing. The guard pattern is `if (stopping) return; stopping = true; await ...`.

- [ ] REFACTOR: Run `npm run build` and `npm test -- tests/server/llm-lifecycle.test.ts`. Verify `src/server.ts` stays under 200 lines. If the file grows beyond 200 lines, extract the worker construction into a separate `src/server-v2.ts` file and re-export from `src/server.ts`.

- [ ] REFACTOR: Add a JSDoc comment at the top of `src/services/v2/llm-scoring-client-factory.ts` explaining that the factory exists to keep tests stubbable and to keep the real OpenAI client import out of the test bundle. Cold-start time matters for CI: importing the OpenAI client unconditionally would add several hundred milliseconds to every test file's module graph.

- [ ] REFACTOR: Add a test that verifies `buildLlmScoringClient({ LLM_ENABLED: "false" })` returns an instance of `FakeLlmScoringClient`, and a second test that verifies `buildLlmScoringClient({ LLM_ENABLED: "true", LLM_API_KEY: "sk-test" })` returns an instance of `OpenAICompatibleLlmScoringClient`. These tests live in `tests/services/llm-scoring-client-factory.test.ts`.

**Commit**

`chore(v2): boot LLM scoring worker with Fastify lifecycle and signal handling`

### Task H3 — Refactor ensure-bootstrap-data.ts For Window Shells And Operator Bootstrap

**Intent**

Task H3 makes the bootstrap seed script v2-aware. Two new behaviours are required by the spec. First, after the camp is seeded, W1 and W2 window shells must exist with `settlement_state='open'` (spec section 2.2.2 "懒加载策略"). Second, any member whose `source_feishu_open_id` appears in `BOOTSTRAP_OPERATOR_OPEN_IDS` must be promoted to `role_type='operator'` and `hidden_from_board=1` (spec section 5.9).

**Testability refactor**

The current script is a top-level imperative file with no exports. This task refactors it into a `runEnsureBootstrap(options)` function that accepts an injected repository and env. The top-level block becomes `await runEnsureBootstrap({ env: process.env })` so `npm run seed:ensure` continues to work. The new shape lets tests inject a `:memory:` repository and an in-memory env map, which is essential for deterministic testing.

**Idempotency is non-negotiable**

Running the script twice in a row must produce identical state. The test suite covers this explicitly. The window-shell insert uses `INSERT OR IGNORE` semantics (or a pre-check with `SELECT`). The operator promotion checks `roleType !== 'operator'` before writing, so running twice does not double-write the promotion audit trail.

**Files**

- `src/scripts/ensure-bootstrap-data.ts` — refactor and extend.
- `tests/scripts/ensure-bootstrap-data-v2.test.ts` — NEW with four failing tests.

**Steps**

- [ ] RED: Write four tests in `tests/scripts/ensure-bootstrap-data-v2.test.ts`. Each test boots a `:memory:` `SqliteRepository`, optionally pre-seeds data, and calls the new signature `runEnsureBootstrap({ repository, env })`. Test 1 (fresh DB): empty SQLite; after running, assert `defaultCampId` is set, W1 and W2 rows exist with `settlement_state='open'`, and no bootstrap operators were promoted because the env var is empty. Test 2 (existing DB): already seeded; assert the function is idempotent — running twice produces identical row counts and no errors. Test 3 (windows already present): pre-insert W1 and W2; assert no duplicate and no error. Test 4 (bootstrap operators): seed two students with `source_feishu_open_id = "ou_a"` and `"ou_b"`; pass env `{ BOOTSTRAP_OPERATOR_OPEN_IDS: "ou_a,ou_b" }`; assert both members were promoted to `role_type="operator"` and `hidden_from_board=1`. Also assert the return value `{ mutated: true, campId: "c-default" }` on the first run and `{ mutated: false, campId: "c-default" }` on the second run.

- [ ] GREEN: Refactor `src/scripts/ensure-bootstrap-data.ts`. Export `async function runEnsureBootstrap(options: { repository?: SqliteRepository; env?: NodeJS.ProcessEnv; databaseUrl?: string }): Promise<{ mutated: boolean; campId: string | null }>`. The function uses the injected repository when provided, otherwise constructs one from `options.databaseUrl ?? options.env?.DATABASE_URL ?? "./data/app.db"`. Reuse existing logic for legacy seeding, then add a new block: after the camp is ensured, fetch the `v2_windows` rows for that camp; insert W1 if missing; insert W2 if missing. Finally, if `options.env?.BOOTSTRAP_OPERATOR_OPEN_IDS` is non-empty, split on commas, trim, filter out empty strings, look up each open id via `repository.findMemberByFeishuOpenId`, and if the member's `roleType !== 'operator'`, call `repository.patchMemberForAdmin(member.id, { roleType: "operator", hiddenFromBoard: true })`. Return `{ mutated, campId }`.

- [ ] GREEN: Wire a top-level `await runEnsureBootstrap({ env: process.env })` call at the bottom of the file so `npm run seed:ensure` still works. Guard the top-level call with `if (import.meta.url === \`file://${process.argv[1]}\`)` so importing the module from a test does not trigger the top-level side effect. Without this guard, importing the module from a test file would run the bootstrap logic against whatever DB `DATABASE_URL` points to, which is catastrophic.

- [ ] GREEN: Run `npm test -- tests/scripts/ensure-bootstrap-data-v2.test.ts` — all four tests green.

- [ ] REFACTOR: Factor the window-shell logic into a private helper `ensureWindowShell(repository, campId, code)` inside the same file and call it twice. The helper must be idempotent: if the row already exists, it is a no-op; if it does not, insert with `settlement_state='open'`, `first_period_id=null`, `last_period_id=null`.

- [ ] REFACTOR: Factor the operator promotion logic into a private helper `promoteBootstrapOperators(repository, openIds)` that accepts a pre-parsed array of open ids (not the raw env string) so the caller controls the parsing. Write a test that passes an array directly to the helper, bypassing the env parsing.

- [ ] REFACTOR: Run `npm run build` and the H3 tests.

- [ ] REFACTOR: Run `npm run seed:ensure` against a fresh throwaway DB to confirm the script still works end-to-end from the command line. Verify that the second run prints a "no changes" message rather than an error.

**Commit**

`chore(v2): refactor ensure-bootstrap to seed W1/W2 shells and apply bootstrap operators`

### Task H4 — End-To-End Integration Test

**Intent**

Task H4 is the crown-jewel test that exercises the entire v2 pipeline through `fastify.inject`. It does not use a real HTTP listener. It seeds a `:memory:` repository, boots the app with real service implementations (not fakes), drives the pipeline through HTTP calls, and asserts the final state of every table. It is the single test that proves Phase 1 sub-project 1 is internally consistent.

**Why it is expensive but necessary**

This test takes approximately 2 to 5 seconds to run, which is longer than a typical unit test. It is worth the cost because it catches integration bugs that unit tests miss. For example: a mismatched column name between `WindowSettler` and `fetchRankingByCamp`, or a forgotten eligibility filter in a downstream query, or a deadlock between the LLM worker and the aggregator when they both touch the same row. Unit tests mock these interactions away. Only an end-to-end test can catch them.

**Fake LLM client**

The test uses `FakeLlmScoringClient` configured to always return "approved". This makes the LLM branch deterministic and avoids any network calls. The fake client is not a mock — it is a real implementation of the `LlmScoringClient` interface that always returns a canned response. Tests that want to exercise the reject branch use a second fake configured to always return "rejected".

**Drainable worker**

The LLM worker provides a testing hook `drainOnce()` that processes all pending tasks synchronously and returns when the queue is empty. This is not the production API (production uses a background poll loop). The hook exists purely so the test can advance the worker without waiting for the poll interval. Without this hook the test would need to sleep for `LLM_POLL_INTERVAL_MS` between each step, which would make the test flaky and slow.

**Files**

- `tests/api/v2/end-to-end.test.ts` — NEW.
- `tests/api/v2/helpers.ts` — NEW. Shared helpers for seeding fixtures, building operator headers, and polling the LLM worker.

**Steps**

- [ ] RED: Write the full E2E test skeleton in `tests/api/v2/end-to-end.test.ts`. Import `createApp`, `FakeLlmScoringClient`, `SqliteRepository`, `runEnsureBootstrap`, and every domain service type. In `beforeAll`: construct a `:memory:` repository; call `runEnsureBootstrap({ repository, env: { BOOTSTRAP_OPERATOR_OPEN_IDS: "" } })`; seed five students (`m-1` through `m-5`) plus one operator (`op-1`); construct real implementations of every service; construct `LlmScoringWorker` with `FakeLlmScoringClient` that always returns pass; call `await createApp({ databaseUrl: ":memory:", ingestor, aggregator, periodLifecycle, windowSettler, llmWorker, reactionTracker, memberSync })`; call `await startLlmWorker(app, { llmWorker })`. All of these will fail at first because `runEnsureBootstrap` (from H3) and `startLlmWorker` (from H2) may still be in-flight when this task starts.

- [ ] RED: Write the assertions in a single `it("runs the full period → window → promotion pipeline", async () => {...})` block. The assertions run in sequence as a narrative. Step 1: `POST /api/v2/windows/open` with `{ code: "W1" }` and an operator header → assert 201. Step 2: `POST /api/v2/periods/open` with `{ number: 1 }` → assert 201 and the returned `periodId` starts with `period-` and is tagged ice-breaker in the DB. Step 3: attempt to `POST /api/v2/events` for member `m-1` item `K1` during the ice breaker → assert 409 `ice_breaker_no_scoring`. Step 4: `POST /api/v2/periods/open` with `{ number: 2 }` → assert 201 with `assignedWindowId` equal to the W1 window id. Step 5: ingest ten legitimate events for five members across K1, H1, C1, S1, G1 → assert each returns 202. Step 6: `POST /api/v2/periods/open` with `{ number: 3 }` → assert 201. Step 7: ingest a K3 event for `m-1` and poll the LLM worker until the task status is `approved` using `await llmWorker.drainOnce()`. Step 8: `POST /api/v2/windows/open` with `{ code: "W3" }` → assert 201, and `POST /api/v2/periods/open` with `{ number: 4 }` → assert 201 and `shouldSettleWindowId` equals the W1 id. Step 9: trigger `windowSettler.settleWindow(shouldSettleWindowId)` (or assert it was called from the lifecycle). Step 10: assert `member_dimension_scores` rows exist for every eligible student for W1. Step 11: assert `window_snapshots` rows exist for every eligible student for W1 with the correct rank order. Step 12: assert `member_levels` shows at least one student promoted from L0 to L1 via `promotion_records`. Step 13: `GET /api/v2/board/ranking?campId=c-1` returns 200 with exactly five rows (the operator is excluded). Step 14: `GET /api/v2/board/member/m-1` returns 200 with `currentLevel >= 1`. Step 15: `GET /api/v2/admin/review-queue` with the operator header returns 200 with zero rows because the fake LLM client auto-passes everything. Step 16: `GET /api/v2/llm/worker/status` returns 200 with `running: true`. Step 17: assert `GET /api/v2/board/member/m-ghost` returns 404. Step 18: assert a repeat ingest with the same `sourceRef` for `m-1 K1` returns 400 `duplicate`. Step 19: assert `POST /api/v2/events` with a student header and no `currentAdmin` still works (the events route is not admin-gated). Step 20: call `await stopLlmWorker(app, { llmWorker })` and confirm the worker stopped cleanly.

- [ ] GREEN: Implement any missing glue needed for the assertions to pass. Likely missing: the `drainOnce()` testing hook on `LlmScoringWorker` (if not already provided by Phase E), a small fixture helper for seeding five students with open ids, and a `makeOperatorHeader()` helper that returns `{ "x-feishu-open-id": "ou-operator" }`. These helpers live in `tests/api/v2/helpers.ts` so they can be reused by future v2 tests.

- [ ] GREEN: Run `npm test -- tests/api/v2/end-to-end.test.ts` — green.

- [ ] REFACTOR: Split the assertions into logically named helper functions (`setupWindowsAndPeriods`, `ingestLegitimateEvents`, `assertRankingShape`, `assertLevelPromotion`) inside `tests/api/v2/helpers.ts` so the test reads linearly. Keep the top-level `it` block under 150 lines.

- [ ] REFACTOR: Run `npm run build` and the full `npm test -- tests/api/v2/` folder once more to ensure the new E2E test does not flake when run alongside the G-phase unit tests. If any previous test suddenly fails, the most likely cause is test-file-order dependency (two tests sharing a `:memory:` DB). Fix by ensuring every test file constructs its own fresh repository.

- [ ] REFACTOR: Measure the E2E test runtime with `npm test -- tests/api/v2/end-to-end.test.ts --reporter=verbose`. If it exceeds 10 seconds, investigate which pipeline step is slow. Likely candidates are the LLM worker poll interval (reduce in test to 50 ms) and the window settler (ensure it uses a single transaction, not per-row commits).

- [ ] REFACTOR: Add a second `it` block that tests the reject branch of the LLM worker. Use a `FakeLlmScoringClient` configured to always return "rejected". Assert that the event lands in `review_required` state and appears in the admin review queue. This doubles the test coverage of the LLM worker pipeline.

**Commit**

`test(v2): add end-to-end integration test covering the full period → settlement pipeline`

### Phase H Exit Checkpoint

- [ ] `.env.example` contains the six new keys and still boots with `dotenv`.
- [ ] `src/server.ts` starts the LLM worker after `app.ready()` and stops it cleanly on SIGTERM/SIGINT.
- [ ] `npm run seed:ensure` works and is idempotent on a fresh DB.
- [ ] `tests/api/v2/end-to-end.test.ts` passes and exercises every v2 route, domain service, and repository method touched by Phases A through G.
- [ ] `npm run build` is green.
- [ ] `npm test` is green across the full suite, including legacy tests that still exist before Phase I runs.
- [ ] The Phase H task summary table at the top of this phase accurately reflects the shipped work.
- [ ] `src/services/v2/llm-scoring-client-factory.ts` is the only place that constructs an `LlmScoringClient`.
- [ ] The signal handlers in `src/server.ts` are idempotent and have been tested to confirm a double-SIGTERM does not crash.
- [ ] The E2E test in `tests/api/v2/end-to-end.test.ts` runs in under 10 seconds.
- [ ] The bootstrap seed script runs in under 500 milliseconds on a `:memory:` DB.
- [ ] `git log --oneline` shows four Phase H commits in sequence.
- [ ] The `runEnsureBootstrap` function is importable from test files without triggering the top-level side effect.

---

## Phase I — Legacy Cleanup and Phase 1 Sign-off (2 tasks)

Phase I is the smallest and most surgical phase. Task I1 removes the legacy v1 scoring surface that is now strictly dead code. It does so carefully, unhooking imports first and running the build between deletions so no dangling reference reaches `git rm`. Task I2 adds a coverage script if missing, runs the final gate, and records that sub-project 1 Phase 1 is complete.

### Why Phase I Is Two Tasks, Not One

Task I1 and Task I2 could be combined into a single "wrap up Phase 1" task. They are kept separate because I1 is a destructive change (it deletes real files) while I2 is an additive change (it adds scripts and a README note). Keeping them separate means a reviewer can inspect the deletion diff in isolation, which is much easier to review than a combined deletion-plus-addition diff. The git history is also cleaner: the `chore: drop legacy v1 scoring surface` commit stands alone as a reference for "what was in the v1 scoring surface" if we ever need to go back and check.

### Phase I Task Summary

| Task | Scope | Commit |
|---|---|---|
| I1 | delete v1 scoring surface per spec section 6.2 | `chore: drop legacy v1 scoring surface` |
| I2 | test coverage script, README note, final gate | `chore(v2): mark phase 1 complete` |

### Task I1 — Drop Legacy v1 Scoring Surface

**Intent**

Task I1 removes every file listed under "完全删除" in spec section 6.2. The file list is final — no compatibility shim is kept, no "deprecated" comment is added to any kept file. The scoring v2 surface is the only scoring surface after this task. Keeping dead code around is a maintenance burden that accumulates interest over time; the rule from the coding-style guide is clear: prefer deletion.

**Execution strategy**

The task follows a strict order. First, edit `src/app.ts` to remove all imports and route registrations that depend on the legacy files. Second, run `npm run build` to confirm the edit is clean. Third, `git rm` the legacy files in batches. Fourth, run `npm run build` after each batch to catch any residual references. Fifth, run `npm test` at the end and delete any test files that depend on deleted modules. The Edit-first order is critical because `git rm` on a file that is still imported produces a broken build, which complicates debugging.

**Why deletion beats deprecation**

The alternative to deletion is to leave the files in place and mark them deprecated with a comment. That approach was rejected for three reasons. First, deprecated files continue to consume CI time (they are still compiled and tested). Second, deprecated files are still imported transitively, which means they cannot be safely ignored during a code audit. Third, deprecated files rot over time — a bug fix in the live code may break the deprecated path without anyone noticing, which produces confusing error messages. Deletion is cleaner.

**Files to edit first**

- `src/app.ts` — remove all imports, route registrations, and helper functions that depend on the legacy files.

**Files to delete after app.ts is clean**

The following files are listed in spec section 6.2 "完全删除":

- `src/domain/scoring.ts` — legacy heuristic plus binary LLM scoring; conflicts with the v2 fifteen-item dimension model.
- `src/domain/warnings.ts` — warning/elimination semantics are obsolete; the new rule does not demote or eliminate members.
- `src/domain/ranking.ts` — pure cumulative scoring sort; does not support the segment/radar/cumulative ranking required by v2.
- `src/domain/session-windows.ts` — legacy session definition tag matching; the new rule does not use hashtags.
- `src/domain/submission-aggregation.ts` — legacy single-file submission aggregation; obsolete semantics.
- `src/domain/tag-parser.ts` — the new rule uses card buttons, not hashtag parsing.
- `src/services/llm/glm-file-parser.ts` — the new rule does not parse PDF or DOCX files.
- `src/services/llm/llm-evaluator.ts` — replaced by the v2 `llm-scoring-worker`.
- `src/services/documents/extract-text.ts` — the new rule does not extract text from documents.
- `src/services/documents/file-format.ts` — same reason.
- `src/services/scoring/evaluate-window.ts` — replaced by the v2 `window-settler`.
- `src/services/feishu/base-sync.ts` — the new architecture does not use Feishu Base for data mirroring.
- `web/src/**` — entire frontend surface. Sub-project 3 will rewrite this.

**Test files to delete**

- `tests/domain/scoring*.test.ts`
- `tests/domain/warnings*.test.ts`
- `tests/domain/ranking*.test.ts`
- `tests/domain/session-windows*.test.ts`
- `tests/domain/submission-aggregation*.test.ts`
- `tests/domain/tag-parser*.test.ts`
- `tests/services/glm-file-parser*.test.ts`
- `tests/services/llm-evaluator*.test.ts`
- `tests/services/documents/*.test.ts`
- `tests/services/scoring/evaluate-window*.test.ts`
- `tests/services/feishu-base-sync*.test.ts`
- `tests/api/*dashboard*.test.ts`
- `tests/api/*submissions*.test.ts`
- `tests/api/*operator-warnings*.test.ts`
- Any `tests/web/**/*` files.

**Files explicitly preserved**

The following files are explicitly preserved per spec section 6.2 "保留复用":

- `src/services/feishu/client.ts` — Feishu API client.
- `src/services/feishu/ws-runtime.ts` — long-connection runtime.
- `src/services/feishu/config.ts` — Feishu config loader.
- `src/services/feishu/messenger.ts` — bot message sender.
- `src/services/feishu/bootstrap.ts` — bootstrap flow.
- `src/services/feishu/normalize-message.ts` — message normaliser (file-message branch is dead but the rest is used).
- `src/storage/sqlite-repository.ts` — data access layer.
- `src/db/*` — schema management.
- `src/config/*` — config loading.
- `src/domain/types.ts` — legacy types kept for non-breaking purposes.
- `src/app.ts` — main entry point, extended with v2 routes.
- `src/server.ts` — startup entry point.

**Steps**

- [ ] Unhook imports in `src/app.ts` first. Use the Edit tool to remove every import line referencing `LocalDocumentTextExtractor`, `DocumentTextExtractor`, `FeishuBaseSyncService`, `NoopBaseSyncService`, `evaluateMessageWindow`, and the entire set of `scoring | warnings | ranking | session-windows | submission-aggregation | tag-parser` modules. Also remove any helper function inside `src/app.ts` that depends on them. Then remove the four legacy route blocks: `GET /api/dashboard/ranking`, `POST /api/submissions/:id/review`, `GET /api/members` (the v1 shape), and `GET /api/operator/warnings`. Also remove the now-unreferenced local declarations: `documentTextExtractor`, `baseSync`, `memberPatchSchema`, `reviewSchema`, `announcementSchema`, and any others that become dead code. Leave the Feishu messenger, WS runtime, `normalize-message`, and client code untouched per spec section 6.2 "保留复用".

- [ ] Run `npm run build`. Fix every remaining type error by deleting the offending reference — never restore a deleted file. The goal is a clean build before `git rm` touches disk. If the build fails because of a type error in a test file, that is acceptable because the test file itself will be deleted in a later step. Document the expected failure in a code comment if you need to skip the test file temporarily.

- [ ] Run `git rm` on the web frontend first: `git rm -r web/src`. Then run `npm run build`. Any residual error comes from a barrel file or test fixture that re-exports the deleted modules — trim those files using Edit, then re-run the build.

- [ ] Run `git rm` on the six domain files (`scoring.ts`, `warnings.ts`, `ranking.ts`, `session-windows.ts`, `submission-aggregation.ts`, `tag-parser.ts`) in one command. Run `npm run build`. Fix residual references. Common sources of residual references: a barrel file `src/domain/index.ts` that re-exports deleted modules, or a type import in a file that was supposed to be kept.

- [ ] Run `git rm` on the six service files (`glm-file-parser.ts`, `llm-evaluator.ts`, `extract-text.ts`, `file-format.ts`, `evaluate-window.ts`, `base-sync.ts`) in one command. Run `npm run build`. Fix residual references. This is the batch most likely to surface unexpected imports — pay special attention to the `src/app.ts` diff here because the Feishu `base-sync` import is easy to miss.

- [ ] Run `npm test`. Any failing test that depends on a deleted module must be deleted as well — use Edit to find the file reference, then `git rm` the file. Do not try to "fix" the test by stubbing the deleted module. The rule from spec section 6.2 is absolute: these modules are gone, not replaced.

- [ ] Run `git rm` on every test file in the deletion list. Use a single command per group. Then run `npm test` once more and confirm the suite is green.

- [ ] Run `npm run build && npm test` one more time. Both must exit green. If a legacy test file is still referenced by a fixture or snapshot, delete it too. If a snapshot file is stale, delete it rather than regenerating.

- [ ] Final sanity sweep: `git status` should show only deletions and the `src/app.ts` edit. No stray untracked files. Run `git diff --cached --stat` to review the deletion count; it should be a single large removal diff with approximately 15 to 20 file deletions and a single edit.

- [ ] Verify with `git grep` that no reference remains to any of the deleted module names. Commands to run: `git grep -l "LocalDocumentTextExtractor"` (should return nothing), `git grep -l "evaluateMessageWindow"` (should return nothing), `git grep -l "FeishuBaseSyncService"` (should return nothing), `git grep -l "tag-parser"` (should return nothing), `git grep -l "submission-aggregation"` (should return nothing).

- [ ] Commit as a single atomic commit. Do not split this into multiple commits, because the intermediate states would have broken builds and the commit history would be confusing to navigate.

**Commit**

`chore: drop legacy v1 scoring surface`

### Task I2 — Mark Phase 1 Complete

**Intent**

Task I2 closes Phase 1. It ensures the coverage script exists, runs the final gate (`npm test && npm run build && npm run test:coverage`), and appends a short note to `README.md` recording that sub-project 1 Phase 1 is complete.

**Coverage configuration**

The spec section 6.5 thresholds are `lines >= 85` and `branches >= 90` for `src/domain/v2/**`, and `lines >= 80` for `src/services/v2/**`. If `vitest.config.ts` does not already have these thresholds, this task adds them. The thresholds are not lowered even if tests are slightly below — the fix is to write more tests, not to relax the gate. A relaxed threshold is technical debt that compounds over time.

**Why a README note**

The README note is important because it signals to future contributors (and to sub-projects 2 and 3) that Phase 1 is complete and the `/api/v2/*` surface is ready to consume. Without the note, a later contributor reading the README would see only the pre-Phase-1 description and might assume the v2 routes are experimental.

**Files**

- `package.json` — add `test:coverage` script if missing.
- `vitest.config.ts` — add coverage thresholds if missing.
- `README.md` — append a short note under a new heading.

**Steps**

- [ ] Inspect `package.json` scripts. If `test:coverage` is missing, add it with the shape `"test:coverage": "vitest run --coverage"`. Preserve the existing `test`, `build`, and `seed:ensure` scripts exactly. Do not touch dependencies unless the coverage provider is missing.

- [ ] Inspect `vitest.config.ts`. If no coverage provider is configured, add the `v8` (or `c8`) provider plus the thresholds from spec section 6.5. The `include` patterns should cover `src/**`. The `exclude` patterns should cover `tests/**`, `dist/**`, `node_modules/**`, and the legacy paths that were removed by Task I1 (though those paths are already non-existent at this point, so the exclude is defensive rather than necessary).

- [ ] If `@vitest/coverage-v8` is not listed in `devDependencies`, run `npm install --save-dev @vitest/coverage-v8` and commit the updated `package.json` and `package-lock.json` together in this task's commit.

- [ ] Run `npm test`. Must be green.

- [ ] Run `npm run build`. Must be green.

- [ ] Run `npm run test:coverage`. Must be green and must report >= 85% lines for the v2 domain. If it fails to meet the threshold, write the missing tests before continuing — do not lower the threshold. Missing coverage is a signal that the test suite is incomplete, not that the threshold is wrong.

- [ ] Append a short note at the bottom of `README.md` under a new heading `## Scoring v2 — Phase 1 Complete (2026-04)`. The note is three or four lines summarising the delivered surface: sub-project 1 Phase 1 delivered the v2 domain model, the scoring aggregator, the window settler, the LLM worker, the `/api/v2/*` routes, the end-to-end tests, and the legacy cleanup. Sub-projects 2 and 3 consume this layer. Do not delete or rewrite any existing README content.

- [ ] Commit.

**Commit**

`chore(v2): mark phase 1 complete`

### Phase I Exit Checkpoint

- [ ] `git log --oneline` shows the two Phase I commits (`chore: drop legacy v1 scoring surface`, `chore(v2): mark phase 1 complete`) on top of the Phase G and H commits.
- [ ] `npm test && npm run build && npm run test:coverage` is green.
- [ ] `src/app.ts` no longer imports any file listed under "完全删除" in spec section 6.2.
- [ ] `web/src/` is removed from the tree.
- [ ] `README.md` has the Phase 1 complete note and the existing content is untouched.
- [ ] The git working tree is clean.
- [ ] `git grep -l "LocalDocumentTextExtractor"` returns zero hits.
- [ ] `git grep -l "evaluateMessageWindow"` returns zero hits.
- [ ] `git grep -l "FeishuBaseSyncService"` returns zero hits.
- [ ] `git grep -l "tag-parser"` returns zero hits.
- [ ] `git grep -l "submission-aggregation"` returns zero hits.
- [ ] The coverage report meets or exceeds the thresholds from spec section 6.5.
- [ ] The README note is present and preserves existing content.
- [ ] The `chore: drop legacy v1 scoring surface` commit is a single, atomic, build-green commit.

---

## Self-Review Checklist

Before declaring Phases G, H, and I done and handing off to sub-project 2, verify each of the following. This list is additive to the per-phase exit checkpoints above and covers cross-cutting concerns that do not fit into a single phase.

**Routes and middleware**

- [ ] Every v2 route file under `src/routes/v2/` is under 200 lines and has a single responsibility.
- [ ] Every v2 route file imports `parseStrict` and `mapDomainErrorToHttp` from `src/routes/v2/common.ts` rather than re-implementing either helper.
- [ ] No v2 route contains a `console.log`, `console.error`, or debug print statement. Logging goes through `request.log` only.
- [ ] All admin routes (`/api/v2/admin/*`, `/api/v2/periods/close`, `/api/v2/windows/open`, `/api/v2/graduation/close`) register `onRequest: adminGuard(repository)`.
- [ ] Every body schema uses `z.object({...}).strict()` so a typo field returns 400 rather than silently passing through.

**Dependency injection**

- [ ] The seven dependency-injection points on `createApp` are optional and default to real implementations — tests can swap fakes in, production wires real services, and the wiring code is a single `buildV2Runtime` helper.
- [ ] No route handler reads from `app.decorate` or from module-level globals. All handler dependencies come from the `createApp` closure.
- [ ] No test uses a shared `:memory:` DB across test files. Each test file constructs its own repository.

**Error handling**

- [ ] `mapDomainErrorToHttp` covers every `DomainError` subclass listed in spec section 6.3 and maps them per section 6.4. A future developer adding a new subclass will see a `never` reminder at the end of the switch.
- [ ] Unknown errors log through `reply.request.log.error` and return 500 with `{ ok: false, code: "internal_error" }` — no stack trace leakage.
- [ ] `llm_exhausted` is never surfaced to the HTTP layer (the worker handles it before the API sees it).

**Middleware semantics**

- [ ] `requireAdmin` reads the header exactly once and attaches the member to `request.currentAdmin` without any additional DB roundtrip per route.
- [ ] `requireAdmin` returns 401 for missing header and 403 for non-admin role. The order matters.
- [ ] `requireAdmin` trims whitespace from the header value before looking up the member.

**Server lifecycle**

- [ ] `src/server.ts` signal handlers are idempotent and call `llmWorker.stop` before `app.close`.
- [ ] The double-SIGTERM test asserts `llmWorker.stop` was called exactly once.
- [ ] The LLM worker construction reads all six env knobs with sensible defaults.

**Bootstrap**

- [ ] `runEnsureBootstrap` is idempotent — running it twice in a row on the same DB produces identical state, with no duplicate rows, no errors, and the same `{ mutated, campId }` tuple on the second run (`mutated: false`).
- [ ] `runEnsureBootstrap` inserts W1 and W2 shells with `settlement_state='open'`.
- [ ] `runEnsureBootstrap` promotes matching bootstrap operators without double-promoting on a second run.

**End-to-end coverage**

- [ ] The end-to-end test in `tests/api/v2/end-to-end.test.ts` exercises ice-breaker rejection, event ingest, LLM worker draining, window settlement, promotion, ranking, admin review queue, LLM worker status, 404 on unknown members, duplicate rejection, and clean shutdown.
- [ ] The end-to-end test runs in under 10 seconds.
- [ ] The second `it` block tests the LLM reject branch via a fake client configured to always reject.

**Coverage thresholds**

- [ ] Coverage thresholds in `vitest.config.ts` match spec section 6.5 — do not weaken them.
- [ ] The `test:coverage` script runs and meets the thresholds.
- [ ] The coverage report is not generated to a location that is committed to git.

**Legacy cleanup**

- [ ] The `chore: drop legacy v1 scoring surface` commit is a single, atomic, build-green commit. `git show --stat` on that commit shows only deletions and the minimal `src/app.ts` edit.
- [ ] No file listed under spec section 6.2 "完全删除" is still present in the tree.
- [ ] The Phase 1 complete note in README is under five lines and does not delete existing content.
- [ ] `git status` is clean after Phase I.

**Commit discipline**

- [ ] The total number of commits produced by Phases G, H, and I equals exactly 17 (11 + 4 + 2).
- [ ] Every commit message follows the conventional-commits shape and matches the "Commit" line in this plan.
- [ ] No commit uses `--amend` to modify a previous commit.
- [ ] No commit uses `--no-verify` to skip hooks.

**Type safety**

- [ ] The type augmentation in `src/types/fastify.d.ts` is picked up by `tsconfig.json` include and produces no "implicit any" warnings in strict mode.
- [ ] No test uses `@ts-ignore` or `@ts-expect-error` to work around a type mismatch.
- [ ] No source file uses `any` except where explicitly documented as necessary.

**Security**

- [ ] No hardcoded secrets in the new code.
- [ ] The PATCH endpoint for `admin/members/:id` uses parameter binding and is tested against SQL injection.
- [ ] The `x-feishu-open-id` header is never logged in plaintext (it is sent to `findMemberByFeishuOpenId` and not to the log).

**Documentation**

- [ ] `.env.example` documents every new env key with a comment.
- [ ] `README.md` has the Phase 1 complete note.
- [ ] `src/app-v2-errors.ts` has a JSDoc block listing every `DomainError` subclass and its HTTP mapping.

---

## Execution Handoff

This plan supports two execution strategies. Pick one before starting.

### Option A — Subagent-Driven Execution (recommended for Phase G)

Phase G is eleven mostly-independent route tasks that share a small amount of common infrastructure (Task G1). The cleanest path is:

1. Execute Task G1 inline or with a single subagent. Task G1 must complete first because every later task depends on the `requireAdmin` middleware, the `mapDomainErrorToHttp` helper, and the extended `createApp` options. Attempting to parallelise G1 with the other tasks would cause merge conflicts in `src/app.ts`.

2. After G1 is committed, dispatch Tasks G2 through G11 in parallel via the `superpowers:dispatching-parallel-agents` skill. Each subagent gets a single task, its file list, the five checkbox steps, and the commit message. Give each subagent explicit instructions to rebase on top of the latest Phase G head before committing, so the history is linear.

3. Execute Phase H sequentially in a single session. H1 through H4 each depend on the previous commit because they share `src/server.ts`, `src/scripts/ensure-bootstrap-data.ts`, and the runtime wiring. Parallelising H would cause merge conflicts in these three files.

4. Execute Phase I inline. Task I1 requires a careful, iterative loop of (edit app.ts → build → rm files → build → rm tests → test). This is not subagent-friendly; it must be done in a single session with continuous read-eval-print on `npm run build` and `npm test` outputs. A subagent executing I1 would produce a broken intermediate state and then fail to recover.

5. After I2 commits, run the `superpowers:finishing-a-development-branch` skill to wrap up, draft a PR, and hand the branch to the reviewer.

**Parallelism ceiling**

Ten subagents in Phase G step 2 — one per route task G2 through G11 — with a strict gate that no subagent may merge until its `npm test -- tests/api/v2/<its-file>.test.ts` is green locally. A subagent that tries to merge without passing its own tests fails the gate and must rework.

**Conflict resolution**

If two subagents both edit `src/app.ts` to register their respective routes, the second one to merge will hit a conflict. The conflict resolution is mechanical: accept both registration calls, sort them alphabetically, and re-run the tests. If the sort breaks anything, the registrations are not actually independent and the parallel strategy should be abandoned for that pair.

### Option B — Fully Inline Execution (recommended for Phase H and I, and for small teams)

If you prefer a single developer, single session, single context window strategy, execute every task in order: G1 → G2 → ... → G11 → H1 → H2 → H3 → H4 → I1 → I2. Commit after each task. Run `npm test -- tests/api/v2/` after every Phase G task and `npm test && npm run build` after every Phase H task to catch regressions early.

This strategy is slower but simpler — no rebasing, no merge conflicts, no subagent coordination overhead. Use it when the route shapes or the dependency wiring are not fully settled and you expect to iterate mid-phase. Use it also when the context window of the primary executor is generous enough to hold the entire codebase in working memory.

**Estimated time**

Under Option B, a single developer with good context coverage can complete Phase G in approximately 4 to 6 hours, Phase H in approximately 2 to 3 hours, and Phase I in approximately 1 to 2 hours. Total: 7 to 11 hours of focused work. Parallelising under Option A can reduce the Phase G portion to approximately 2 hours but adds coordination overhead.

### Hybrid Execution

A third option is a hybrid: execute G1 inline, then execute G2 through G11 inline but in a tight loop without context switching, then switch to Phase H and I inline. This keeps the "no coordination overhead" benefit of Option B while still taking advantage of the fact that G2 through G11 are mechanical once the pattern is established.

### Definition of Done for Sub-project 1 Phase 1

Sub-project 1 Phase 1 is done when all of the following are simultaneously true:

1. All seventeen Phase G plus H plus I tasks are committed.
2. `npm test && npm run build && npm run test:coverage` is green on the head commit.
3. The branch is rebased onto `main` cleanly with no merge conflicts.
4. The `chore: drop legacy v1 scoring surface` commit is a single atomic commit that builds cleanly.
5. `README.md` contains the Phase 1 complete note and the existing README content is preserved.
6. No legacy file from spec section 6.2 "完全删除" is still present in the tree.
7. The PR description lists every new route, the removed legacy files, and a link to this plan.
8. The PR has passed automated CI.
9. A reviewer has approved the PR or it has been explicitly marked for self-merge by the developer.
10. The dashboard in sub-project 3 can be bootstrapped against the new `/api/v2/*` surface without modifying the routes.
11. Sub-project 2 can call `/api/v2/events`, `/api/v2/periods/open`, `/api/v2/windows/open`, and `/api/v2/graduation/close` from its Feishu slash-command handler without needing any wrapper or adapter.
12. The `.env.example` file is up to date with every env key the code reads.
13. The `LlmScoringWorker` starts and stops cleanly alongside the Fastify server.
14. The bootstrap seed script produces a working dev environment from an empty DB.
15. The end-to-end test in `tests/api/v2/end-to-end.test.ts` passes without flakiness over 10 consecutive runs.

### Handoff Notes For Sub-project 2

Sub-project 2 (Feishu cards) consumes the Phase 1 HTTP surface. The critical integration points are:

- `POST /api/v2/events` — called from the card-action handler when a student taps a button.
- `POST /api/v2/periods/open` — called from the `/开期` slash-command handler.
- `POST /api/v2/windows/open` — called from the `/开窗` slash-command handler.
- `POST /api/v2/graduation/close` — called from the `/结业` slash-command handler.
- `GET /api/v2/board/ranking` — called from the `/排行榜` slash-command handler.
- `GET /api/v2/board/member/:id` — called from the "我的段位" card button handler.

Sub-project 2 must also implement the `reactionTracker` interface referenced in Phase G Task G1. The stub implementation in sub-project 1 is a no-op; sub-project 2 replaces it with the real Feishu reaction listener.

### Handoff Notes For Sub-project 3

Sub-project 3 (dashboard UI) consumes the Phase 1 HTTP surface for read-only views and admin management. The critical integration points are:

- `GET /api/v2/board/ranking?campId=` — drives the leaderboard view.
- `GET /api/v2/board/member/:id` — drives the member detail panel.
- `GET /api/v2/admin/review-queue` — drives the LLM review inbox.
- `POST /api/v2/admin/review-queue/:eventId/decide` — commits a review decision.
- `GET /api/v2/admin/members` — drives the member management view.
- `PATCH /api/v2/admin/members/:id` — commits a member edit.
- `GET /api/v2/llm/worker/status` — drives the worker health indicator.

Sub-project 3 must inject the `x-feishu-open-id` header on every admin request. The header is obtained from the Feishu H5 application context and passed through a middleware layer on the sub-project 3 side. This is the responsibility of sub-project 3 per spec section 7.

### Handoff Notes For Sub-project 4

Sub-project 4 (LLM provider selection) has no direct integration points with Phase 1. Its responsibility is to pick the production LLM provider and configure `LLM_ENABLED=true` plus the relevant API key. The Phase 1 factory `buildLlmScoringClient` will automatically wire the real client when the env is set. No code changes are required in Phase 1 to support sub-project 4.

---

## Appendix A — Detailed Implementation Notes Per Task

This appendix expands on each Phase G, H, and I task with additional context, failure modes, and sanity checks. It is structured as a set of deep-dives that would otherwise clutter the main task descriptions. Consult this appendix when a task's primary description is not enough to debug a specific failure.

### A.1 Task G1 Deep Dive — Middleware and Wiring

The Task G1 middleware and wiring task is the most complex task in Phase G because it touches the dependency-injection contract for every later task. A mistake in G1 cascades into failures in every downstream task, so it deserves special care.

**Why the seven deps are optional**

The seven new `createApp` options (`ingestor`, `aggregator`, `periodLifecycle`, `windowSettler`, `llmWorker`, `reactionTracker`, `memberSync`) are all marked optional with a `?`. This is deliberate. Making them required would force every test file to construct every dep, even the ones it does not care about. Making them optional with sensible defaults means a test that only cares about `ingestor` can pass `{ ingestor: fakeIngestor }` and let the rest default to real implementations.

The defaults are constructed inside `buildV2Runtime(options, repository)`. This helper takes the options object and the repository, and returns a fully-populated runtime bundle. The helper is a pure function — it has no side effects beyond allocating new objects. This purity matters because tests can call the helper directly to inspect the default wiring without booting Fastify.

**Why the defaults use real implementations**

The defaults are real implementations, not fakes. This is a deliberate choice. Using fakes as defaults would mean that a production invocation of `createApp()` with no options would silently boot a non-functional system. A developer starting the server in dev mode would see every HTTP request succeed with fake data and would have no signal that the real services are not wired. Using real implementations as defaults means that a production invocation of `createApp()` with no options is indistinguishable from a fully-wired production invocation.

**Middleware composition**

The `requireAdmin` factory returns a Fastify `onRequest` hook. Fastify runs `onRequest` hooks before the route handler. The hook's first act is to read the `x-feishu-open-id` header. If the header is missing, the hook calls `reply.code(401).send({...})` and returns — critically, it does not call `done()` because sending a reply implicitly signals that the hook chain is complete. If the header is present but the member lookup returns null or a non-admin role, the hook calls `reply.code(403).send({...})` and returns. If the member is an admin, the hook attaches the member to `request.currentAdmin` and returns, letting the next hook or the route handler run.

One subtle point: the hook must use `return reply.code(...).send(...)` rather than `reply.code(...).send(...)` on its own, because Fastify's hook contract expects the hook to return either a promise or a sentinel. Without the `return`, Fastify may invoke the next hook or the route handler after the reply has already been sent, causing a "reply already sent" error.

**Error mapper switch**

The `mapDomainErrorToHttp` function uses a `switch` statement on `err.code`. Each case calls `reply.code(status).send(...)` and returns the reply. The switch is exhaustive: every `DomainError` subclass from spec section 6.3 has a corresponding case. The `default` case at the end uses a `const _never: never = err.code;` assignment that forces the TypeScript compiler to error if a future developer adds a new `DomainError` subclass without updating the switch. This is a standard exhaustiveness check pattern.

**Test harness for requireAdmin**

The G1 test harness registers a throwaway route `GET /_test/admin-required` inside a test-only option hook. The hook is exposed only when the `createApp` options include a `testHooks` field, which is never set in production. This approach keeps the test infrastructure out of the production bundle while still letting tests exercise the middleware through `app.inject`.

**Common failure modes**

- Forgetting to `return` in the hook body, causing "reply already sent" errors.
- Assigning `request.currentAdmin = null` instead of leaving it `undefined` when the member is missing, which confuses downstream handlers.
- Reading the header with `request.headers["X-Feishu-Open-Id"]` (case-sensitive) instead of `request.headers["x-feishu-open-id"]` (lowercase). Fastify normalises header keys to lowercase.
- Attempting to read `request.currentAdmin` in a handler where the guard was not applied, which produces undefined and a cryptic null-dereference error.

### A.2 Task G2 Deep Dive — POST /api/v2/events

Task G2 is the first real route after the infrastructure task. It sets the pattern that every subsequent route follows. Pay attention to the details here because G3 through G11 copy this pattern.

**Schema design**

The body schema has five fields: `memberId` (required string), `itemCode` (required string), `scoreDelta` (optional integer), `sourceRef` (required string), `payload` (optional record). The `scoreDelta` is optional because most items have a fixed score delta defined in the scoring-items config, and the API caller does not need to specify it. The `payload` is an opaque JSON object that the ingestor forwards to the LLM worker for LLM-scored items.

The `payload` type is `z.record(z.string(), z.unknown())`. This is a Zod idiom for "an object with string keys and any values". Using `z.unknown()` instead of `z.any()` forces the downstream consumer to narrow the type before using it, which prevents accidental property access on untrusted input.

**HTTP 202 vs HTTP 200**

The route returns 202 Accepted rather than 200 OK because the ingestor may enqueue an LLM scoring task that will be processed asynchronously. From the client's perspective, the event has been accepted for processing but the final scoring decision may not be available yet. 202 is the correct HTTP semantic for "accepted for later processing".

**Error mapping**

The six domain errors map as follows. `NotEligibleError` → 400 because the caller can fix the input by passing a valid member id. `PerPeriodCapExceededError` → 400 because the caller can wait until the next period. `DuplicateEventError` → 400 because the caller sent the same `sourceRef` twice. `NoActivePeriodError` → 409 because the system is not in a state where events can be ingested. `IceBreakerPeriodError` → 409 because the current period is the ice breaker and does not score. These are all tested explicitly.

**Test 7 and Test 8 distinction**

Test 7 covers the case where a field has the wrong type (number instead of string). Test 8 covers the case where an extra unknown field is present. Both return 400 `invalid_body` but the underlying Zod error is different. The `details` field in the response distinguishes them: test 7 has `details.fieldErrors.memberId` populated; test 8 has `details.unrecognizedKeys` populated. The test assertions do not need to check the details field shape — they only need to check the HTTP status and the top-level `code`.

**Why parseStrict returns null on failure**

The `parseStrict` helper returns the parsed body on success or `null` on failure. When it returns `null`, it has already called `reply.send` on the failure path, so the caller must not call `reply.send` again. The early-return pattern in the handler (`if (!parsed) return;`) enforces this. A common bug is to forget the early return, which causes a "reply already sent" error when the handler tries to call `reply.send` after `parseStrict` has already sealed the reply.

**Common failure modes**

- Forgetting the `.strict()` modifier, which lets unknown keys pass through silently.
- Using `z.number()` instead of `z.number().int()` for `scoreDelta`, which would allow fractional values.
- Forgetting the early return after `parseStrict` returns null, causing a "reply already sent" error.
- Wrapping the `await deps.ingestor.ingest(...)` call in a `try/catch` that catches generic `Error` instead of `DomainError`, which would catch unrelated runtime errors and swallow them.

### A.3 Task G3 Deep Dive — POST /api/v2/periods/open

Task G3 exposes the `/开期` command. This is the trainer-initiated command that advances the camp forward one period.

**Why number is required**

The `number` field is required even though the service could auto-compute the next period number. Requiring the caller to specify the number makes the API explicit and catches off-by-one errors. If the trainer tries to open period 5 when the camp is only on period 3, the service will return a domain error (likely `NoActiveWindowError` because W3 has not been opened yet), which is much easier to debug than a silent skip.

**shouldSettleWindowId semantics**

When opening a new period triggers settlement of the previous window, the service returns `shouldSettleWindowId` as the ID of the window that was just settled. The route echoes this back so the trainer-facing confirmation message can say "Period 4 opened. W1 has been settled." The trainer uses this signal to announce the settlement to the camp chat.

**Why not admin-gated**

The endpoint is not admin-gated because the `/开期` slash-command flow in sub-project 2 already gates it inside Feishu. Only trainers can invoke the slash command in the first place. Adding another admin gate at the HTTP layer would be redundant and would break the test harness because tests would need to inject a trainer header.

However, if sub-project 3 exposes this endpoint through the admin dashboard, a later refactor should add `adminGuard` at that point. The current absence is a deliberate choice, not an oversight.

**Common failure modes**

- Forgetting to validate the `number` range (1 to 12), which would allow invalid period numbers.
- Assuming `openNewPeriod` is synchronous, which it is not.
- Forgetting to echo `shouldSettleWindowId` in the response.

### A.4 Task G4 Deep Dive — POST /api/v2/periods/close

Task G4 exposes the manual-close escape hatch. The endpoint is admin-gated because closing a period commits its scoring without waiting for the next period's trigger.

**Why the reason field is required**

The `reason` field is a free-text string that the operator types. It is stored in the `closed_reason` column of the `periods` table for the biweekly compliance review. Common values are `manual_close`, `force_close_by_timeout`, and custom descriptions. Making the reason required forces the operator to think about why they are closing the period, which reduces accidental closes.

**Audit trail**

The repository method `closePeriod(periodId, reason, openId)` writes all three fields to the DB. The `openId` is pulled from `request.currentAdmin.sourceFeishuOpenId` so the audit trail records which operator performed the close. If the operator has no Feishu open id (for example, a bootstrap operator created from a CSV), the fallback is `request.currentAdmin.id`.

**Common failure modes**

- Forgetting to fall back to `request.currentAdmin.id` when `sourceFeishuOpenId` is null, causing a "null inserted into non-null column" error.
- Using `request.currentAdmin` without the `!` non-null assertion, causing a TypeScript compile error.
- Forgetting to register the `adminGuard` on the route, which would allow any caller to close periods.

### A.5 Task G5 Deep Dive — POST /api/v2/windows/open

Task G5 exposes the `/开窗` command. Windows W3, W4, W5, and FINAL are lazy-loaded and must be explicitly opened before the period range that uses them.

**Regex design**

The regex `/^W[1-5]$|^FINAL$/` accepts exactly six values: W1, W2, W3, W4, W5, FINAL. Any other string is rejected. The anchors `^` and `$` are critical — without them, a string like `xxxW1yyy` would match the character class and pass through.

**Idempotency**

Opening a window that already exists is not an error. The service returns `{ windowId, created: false }` to signal idempotency. The HTTP route maps `created: true` to 201 and `created: false` to 200. This distinction matters for sub-project 2's retry logic: a 201 means "a new window was created" and a 200 means "the window already existed". Both are success responses, but the semantic difference tells the caller whether its retry actually changed any state.

**Common failure modes**

- Forgetting the `$` anchor in the regex, allowing strings like `W1x` to pass.
- Forgetting the alternation for `FINAL`, rejecting the final window code.
- Mapping both `created: true` and `created: false` to 201, losing the idempotency signal.

### A.6 Task G6 Deep Dive — POST /api/v2/graduation/close

Task G6 is the `/结业` command. It is the only way to close the FINAL window because period 12 has no "next /开期" to trigger settlement.

**Empty body**

The route accepts an empty body `{}` because there are no parameters to supply. The schema is `z.object({}).strict()`, which accepts only the empty object and rejects any other shape. Technically the route could omit the body entirely, but requiring an empty object forces the caller to be explicit about the absence of parameters.

**Already-settled error**

Attempting to close graduation twice triggers a `WindowAlreadySettledError`. The error message includes the previous settlement timestamp so the operator can check the logs. The HTTP status is 409 because the system is not in a state where the close can be processed (the final window is already settled).

**Common failure modes**

- Passing a non-empty body, which the schema rejects.
- Calling close graduation before the final window has been opened, which triggers a different error.
- Forgetting to echo `finalWindowId` in the response.

### A.7 Task G7 Deep Dive — GET /api/v2/board/ranking

Task G7 is the first read-side endpoint. It drives the leaderboard view in the sub-project 3 dashboard.

**Query complexity**

The ranking query joins four tables: `members`, `member_levels`, `member_dimension_scores`, and `window_snapshots`. The JOIN conditions filter on the eligibility gate (`role_type = 'student' AND is_participant = 1 AND is_excluded_from_board = 0 AND hidden_from_board = 0`). The result is a single row per eligible student with all the fields needed by the leaderboard view.

The query does not do any client-side filtering because every filter is expressed in SQL. This is deliberate: filtering in SQL is faster than filtering in application code, and it ensures that the eligibility gate is applied consistently.

**Rank computation**

Standard competition ranking ("1224") means tied members get the same rank and the next member's rank accounts for the tied pair. For example, if A and B are tied at cum AQ 100, they both get rank 1. The next member (at cum AQ 75) gets rank 3, not rank 2. This matches the common sports ranking convention.

The rank assignment is done in the repository, not in SQL, because SQLite's `RANK()` window function requires a version of SQLite that may not be installed on all production systems. The application-level rank assignment is portable and testable.

**Radar chart support**

The `dimensions` field on each row is an object `{ K, H, C, S, G }` with one integer per dimension. This is the exact shape expected by the sub-project 3 radar chart component. Returning the dimensions as an object instead of an array makes the frontend code simpler because it does not need to map array indices to dimension names.

**Common failure modes**

- Forgetting the eligibility gate in the JOIN, leaking operator data.
- Using `RANK()` instead of application-level ranking, causing portability issues.
- Returning the dimensions as an array instead of an object, breaking the radar chart.
- Using `ORDER BY` on the wrong columns, producing incorrect sort order.

### A.8 Task G8 Deep Dive — GET /api/v2/board/member/:id

Task G8 returns the per-member detail panel. It must return 404 for non-eligible members.

**Why 404 and not 403**

Returning 404 for an operator's member id (instead of 403) hides the existence of the operator row from the API surface. This matches the "data silently disappears" guarantee in spec section 5.8. A 403 would leak the information that the operator exists, which violates the principle that operators should be invisible to the student dashboard.

**Detail panel assembly**

The repository method `fetchMemberBoardDetail` uses a single query that LEFT JOINs `promotion_records`, `member_dimension_scores`, and `window_snapshots`. The result is a denormalised row set that the application folds into the `MemberBoardDetail` shape. The folding is done in the repository method so the API handler is kept thin.

**URL decoding**

The route handler receives the URL param `:id` already decoded by Fastify. A member id with special characters (for example, a UUID with dashes) passes through correctly. Test 4 of the G8 test suite verifies this by passing a URL-encoded dash `%2D`.

**Common failure modes**

- Returning 403 instead of 404 for operators, leaking their existence.
- Forgetting to fold the denormalised rows into the nested `MemberBoardDetail` shape, returning a flat row list.
- Double-decoding the URL param, corrupting ids with legitimate `%` characters.

### A.9 Task G9 Deep Dive — Admin Review Queue

Task G9 is the LLM complaint desk. It lists `review_required` events and lets admins decide approve or reject.

**Why the note is required**

The `note` field in the POST body is mandatory because spec section 5.5 layer 2 requires audit tagging for every admin decision. A decision without a note is less useful than a decision with a note for the biweekly compliance review. The note is also a forcing function: it makes the operator pause and think about the decision before committing.

**Decision propagation**

`aggregator.applyDecision(eventId, { decision, note }, operator)` flips the event status from `review_required` to either `approved` or `rejected`, updates the `reviewed_by_op_id` and `review_note` columns, and, on approval, increments the member's dimension score. The aggregator handles the cap-checking and deduplication internally.

**Why the aggregator is called, not the repository**

The POST decision handler calls `aggregator.applyDecision` instead of directly writing to the DB. This is because the aggregator is the single source of truth for scoring logic: it knows how to apply the per-period caps, how to deduplicate, and how to update the member dimension scores. Bypassing the aggregator and writing directly to the DB would require reimplementing all of that logic in the route, which is a recipe for drift.

**Common failure modes**

- Allowing an empty note (forgetting the `.min(1)` constraint).
- Forgetting to forward `currentAdmin` to the aggregator, losing the audit trail.
- Calling the repository directly instead of the aggregator, bypassing the cap logic.

### A.10 Task G10 Deep Dive — Admin Member Management

Task G10 lets admins edit member metadata. It is the most security-sensitive route in Phase G because it constructs dynamic SQL.

**SQL injection defence**

The PATCH handler uses parameter binding for every value. The column names are hard-coded inside the repository method. This two-layer defence means that no user input can influence either the column list or the values list — both are taken from a whitelist.

The hard-coded column list is: `role_type`, `is_participant`, `is_excluded_from_board`, `hidden_from_board`, `display_name`. These are the only columns that an admin can edit. Any other column name in the patch object is rejected by the Zod schema before reaching the repository.

**Dynamic UPDATE pattern**

The dynamic UPDATE is constructed by walking the patch object keys, pushing `${column} = ?` into a `setFragments` array, and pushing the value into a `params` array. The final SQL is `UPDATE members SET ${setFragments.join(", ")} WHERE id = ?`. The params are `[...values, id]`. This pattern is safe because the column names are from a whitelist (the Zod enum or schema) and the values are bound via parameters.

**The SQL-injection test**

The dedicated test in `tests/storage/patch-member-for-admin.test.ts` exercises the worst-case input: a `displayName` value that contains a SQL fragment. After the PATCH, the test asserts that the `members` table still exists and the `displayName` column literally contains the injection string. This proves that parameter binding is in effect.

**Common failure modes**

- Using string concatenation for values, allowing SQL injection.
- Using user input to build column names, allowing column-name injection.
- Forgetting the `.refine((data) => Object.keys(data).length > 0)` constraint, allowing empty patches that would produce `UPDATE members SET  WHERE id = ?` (invalid SQL).
- Allowing `roleType: "superadmin"` via a wider enum, breaking the role-type invariant.

### A.11 Task G11 Deep Dive — GET /api/v2/llm/worker/status

Task G11 is the worker monitoring endpoint. It is the simplest route in Phase G but it is also the most frequently polled.

**Why it is not admin-gated**

Operational metrics are not sensitive. A public worker status endpoint lets monitoring tools (Prometheus, health check probes, uptime monitors) poll without needing a service account. The endpoint does not expose PII or scoring decisions.

**Polling frequency**

Monitoring tools typically poll every 15 to 60 seconds. The `getStatus()` method is designed to be cheap: it returns a snapshot of the worker's internal state without hitting the database. This means that frequent polling does not impact the worker's throughput.

**Heartbeat timestamp**

The `lastHeartbeatAt` field records the most recent time the worker loop completed a tick. A stale heartbeat (more than a few seconds old) indicates a stuck worker. Monitoring tools use this field to trigger alerts.

**Common failure modes**

- Polling the database inside `getStatus()`, making the endpoint slow.
- Returning `lastHeartbeatAt` as a number instead of an ISO-8601 string, breaking JSON clients.
- Forgetting to initialise `lastHeartbeatAt` to null when the worker has not ticked yet.

### A.12 Task H1 Deep Dive — .env.example

Task H1 extends the `.env.example` file. It is the simplest task in Phase H but it is also the most error-prone because the file format has no schema validation.

**dotenv quirks**

The `dotenv` package has some quirks that can bite unsuspecting developers. Values with spaces must be quoted. Values with `#` are interpreted as comments unless quoted. Line continuations are not supported. The `dotenv` parser is liberal — it accepts almost any input and produces some kind of result — but the result may not be what the developer intended.

The test `tests/config/env-example-shape.test.ts` guards against the common mistakes by parsing the file with the real `dotenv` library and asserting the expected keys are present.

**Comment conventions**

Each new key is preceded by a single-line comment that explains its purpose and default value. The comment uses the format `# KEY_NAME — one-line description (default VALUE).` This format is chosen because it is concise and machine-parseable. A future tool could auto-generate documentation from the comments.

**Common failure modes**

- Using two-line comments, which the shape test does not expect.
- Forgetting to specify the default value in the comment.
- Using inline comments on the same line as the key, which dotenv does not parse correctly.

### A.13 Task H2 Deep Dive — LLM Worker Lifecycle

Task H2 wires the LLM worker into the Fastify server lifecycle. It is the most lifecycle-sensitive task in Phase H because a mistake here produces a stuck process that cannot exit.

**The stop-before-close ordering**

The shutdown sequence is: stop the worker first, then close Fastify. The worker's `stop()` method awaits the in-flight task drain, which ensures that no LLM call is interrupted. Once the worker has stopped, Fastify's `close()` is safe to call because there are no more background promises pending on the worker.

Reversing the order (close Fastify first, then stop the worker) would work in practice because no new HTTP requests can enqueue worker tasks after Fastify is closed. But the reversed order is less explicit about the intent, and it depends on an implicit assumption about the HTTP API being the only task source. The explicit order documents the intent.

**The stopping latch**

The `let stopping = false` latch prevents double-stop. If SIGTERM fires twice in rapid succession, the second signal checks the latch, sees `stopping === true`, and returns immediately. Without the latch, the second signal would call `worker.stop()` a second time, which throws because the worker expects to be stopped exactly once.

**The factory extraction**

The `buildLlmScoringClient` factory is extracted into its own file so that tests can stub it without touching the worker. This is a standard dependency-injection pattern. The factory decides between the fake client (dev, test) and the real client (production with `LLM_ENABLED=true`).

**Common failure modes**

- Forgetting the latch, causing double-stop errors.
- Closing Fastify before stopping the worker, leaking in-flight tasks.
- Importing the real OpenAI client unconditionally, bloating the test bundle.
- Registering signal handlers inside `createApp`, which would register them for every test invocation.

### A.14 Task H3 Deep Dive — Bootstrap Seed Refactor

Task H3 refactors the bootstrap seed script to be v2-aware and testable.

**The testability refactor**

The original script is a top-level imperative file with no exports. Tests cannot import it without triggering its side effects. The refactor wraps the logic in an exported `runEnsureBootstrap(options)` function and guards the top-level invocation with `if (import.meta.url === file://${process.argv[1]})`. This pattern lets the file serve both as a CLI script and as a library module.

**Idempotency**

The script is idempotent: running it twice produces identical state. This is essential because the seed script is typically run during deployment, and a deployment hiccup may cause the script to run twice. Each insert is guarded by a pre-check (SELECT first, INSERT only if missing) or uses `INSERT OR IGNORE` semantics. Each update is guarded by a precondition check (UPDATE only if the current value is different).

**The operator promotion step**

The operator promotion step reads `BOOTSTRAP_OPERATOR_OPEN_IDS` from the env, splits on commas, trims, filters empty strings, and looks up each open id via `findMemberByFeishuOpenId`. For each matched member whose `roleType !== 'operator'`, it calls `patchMemberForAdmin(id, { roleType: "operator", hiddenFromBoard: true })`. The `patchMemberForAdmin` call reuses the method added in Task G10, which is admin-gated via the repository method's whitelist.

**Common failure modes**

- Forgetting the top-level guard, causing tests to trigger side effects.
- Not splitting the env value, treating the whole string as one open id.
- Not trimming whitespace, failing to match open ids with leading or trailing spaces.
- Not guarding the promotion with `roleType !== 'operator'`, double-promoting on the second run.

### A.15 Task H4 Deep Dive — End-to-End Test

Task H4 is the crown-jewel integration test. It is the single test that proves Phase 1 is internally consistent.

**Why a single large test**

The E2E test is a single `it` block with twenty assertions because the assertions form a narrative: each step depends on the previous step's state. Splitting the test into twenty separate `it` blocks would require either a shared setup (which breaks test isolation) or twenty separate full-pipeline bootstraps (which is prohibitively slow).

The twenty assertions are grouped into logical steps by the helper functions in `tests/api/v2/helpers.ts`. The top-level `it` block reads as a linear narrative: `setupWindowsAndPeriods`, `ingestLegitimateEvents`, `assertRankingShape`, `assertLevelPromotion`, `assertReviewQueueEmpty`, `teardown`.

**The fake LLM client**

The test uses `FakeLlmScoringClient` configured to always return "approved". This makes the LLM branch deterministic. Without the fake, the test would depend on a real LLM provider, which is too slow and too expensive for CI. A second `it` block uses a different fake configured to always return "rejected" to exercise the reject branch.

**The drainOnce hook**

The worker provides a testing hook `drainOnce()` that processes all pending tasks synchronously. This is not the production API (production uses a background poll loop). The hook exists purely so the test can advance the worker without waiting for `LLM_POLL_INTERVAL_MS`. Without this hook, the test would sleep between steps, which is flaky and slow.

**Common failure modes**

- Sharing a `:memory:` DB across test files, causing order-dependent failures.
- Using `setTimeout` instead of `drainOnce()`, causing flaky tests.
- Forgetting to call `stopLlmWorker` at the end, leaking a dangling timer.
- Asserting on object identity instead of value equality, failing on serialisation round trips.

### A.16 Task I1 Deep Dive — Legacy Cleanup

Task I1 is the surgical cleanup task. It requires careful ordering to avoid broken builds.

**Why edit app.ts first**

Editing `src/app.ts` first removes all imports and references to the legacy files. After the edit, `npm run build` must be green — this proves that the legacy files are truly orphaned. Only then is it safe to `git rm` them.

If we reversed the order (rm first, then edit app.ts), the intermediate state would have a broken build because app.ts would reference files that no longer exist. Git history would contain a commit with a broken build, which violates the git-workflow rule that every commit must be green.

**Batch deletion**

The deletion is done in batches: web frontend first, then domain files, then service files, then test files. Each batch is followed by `npm run build` to catch residual references. This approach minimises the debugging effort when a residual reference is found — the surface area is small because only one batch has been deleted.

**Why delete tests, not stub them**

The tests for deleted modules are also deleted. Stubbing them would leave behind "ghost tests" that pretend the legacy modules exist. Stubs accumulate technical debt: a future reader sees the stubs and wonders whether they are important. Deletion is cleaner.

**Common failure modes**

- Rm before edit, causing broken intermediate states.
- Forgetting to delete the test files, leaving references to deleted modules.
- Stubbing tests instead of deleting them, accumulating technical debt.
- Missing a barrel file that re-exports deleted modules, causing residual references.

### A.17 Task I2 Deep Dive — Phase 1 Sign-off

Task I2 is the final task. It closes Phase 1 with a coverage gate and a README note.

**Why the README note**

The README note is important because it is the public-facing signal that Phase 1 is complete. Without the note, a future contributor reading the README would see the pre-Phase-1 description and might assume the v2 routes are experimental. The note is three or four lines so it does not overwhelm the rest of the README.

**Coverage thresholds**

The coverage thresholds from spec section 6.5 are enforced via `vitest.config.ts`. The thresholds are not lowered even if tests are slightly below — the fix is to write more tests, not to relax the gate.

**Common failure modes**

- Lowering the thresholds instead of writing tests.
- Deleting existing README content by accident.
- Forgetting to install the coverage provider, causing the script to fail with "provider not found".

---

## Appendix B — Test Fixture Reference

This appendix lists the test fixtures used across Phase G, H, and I tests. Each fixture has a stable identifier so that tests can reference them by name.

### B.1 Member Fixtures

- `m-1` through `m-5`: students. Each has a unique `sourceFeishuOpenId` of the form `ou-student-N`.
- `op-1`: operator. `sourceFeishuOpenId: "ou-operator-1"`.
- `op-2`: operator. `sourceFeishuOpenId: "ou-operator-2"`.
- `tr-1`: trainer. `sourceFeishuOpenId: "ou-trainer-1"`.
- `obs-1`: observer. `sourceFeishuOpenId: "ou-observer-1"`.
- `ghost-1`: excluded from board (`is_excluded_from_board=1`). Used to test the eligibility gate.
- `hidden-1`: hidden from board (`hidden_from_board=1`). Used to test the eligibility gate.

### B.2 Camp Fixtures

- `c-1`: default camp. Used by most tests.
- `c-2`: secondary camp. Used to test camp-scoped queries.

### B.3 Period Fixtures

- `p-1`: ice-breaker period. `is_ice_breaker=1`. Used to test the ice-breaker rejection path.
- `p-2` through `p-12`: scoring periods. `is_ice_breaker=0`.

### B.4 Window Fixtures

- `w-W1` through `w-W5`: pre-seeded window shells.
- `w-FINAL`: FINAL window. Lazy-loaded in tests.

### B.5 Event Fixtures

- `evt-1` through `evt-10`: scoring events in `approved` state.
- `evt-review-1` through `evt-review-3`: scoring events in `review_required` state. Used to test the review queue.

---

## Appendix C — Error Code Reference

This appendix is a quick-reference table for all domain error codes and their HTTP mappings. It is a condensed version of spec section 6.4.

| Code | HTTP | Source | Example Message |
|---|---|---|---|
| `not_eligible` | 400 | EventIngestor | "m-1 is not a student" |
| `cap_exceeded` | 400 | EventIngestor | "K1 cap reached for period p-1" |
| `duplicate` | 400 | EventIngestor | "sourceRef card-123 already ingested" |
| `no_active_period` | 409 | EventIngestor | "no open period for camp c-1" |
| `ice_breaker_no_scoring` | 409 | EventIngestor | "ice breaker period does not score" |
| `no_active_window` | 409 | PeriodLifecycle | "W3 has not been opened by trainer" |
| `window_already_settled` | 409 | PeriodLifecycle | "FINAL already settled at 2026-04-03T10:00:00Z" |
| `invalid_level_transition` | 500 | PromotionJudge | "cannot promote from L5 to L1" |
| `llm_retryable` | (worker only) | LlmScoringWorker | "network timeout" |
| `llm_non_retryable` | (worker only) | LlmScoringWorker | "4xx from provider" |
| `llm_exhausted` | (worker only) | LlmScoringWorker | "max attempts reached" |
| `internal_error` | 500 | (fallback) | (unlogged) |
| `invalid_body` | 400 | (Zod) | (structured details field) |
| `no_identity` | 401 | requireAdmin | (header missing) |
| `not_admin` | 403 | requireAdmin | (header present but non-admin) |
| `not_found` | 404 | board-member-detail | (unknown member id) |

---

## Appendix D — Commit Message Reference

This appendix is a quick-reference list of the 17 commit messages that Phase G, H, and I must produce. Use these exact strings as the first line of each commit.

1. `feat(v2-api): add requireAdmin middleware and wire v2 dependencies into createApp` (G1)
2. `feat(v2-api): add POST /api/v2/events route with ingestor integration and six-path error mapping` (G2)
3. `feat(v2-api): add POST /api/v2/periods/open route` (G3)
4. `feat(v2-api): add POST /api/v2/periods/close admin route` (G4)
5. `feat(v2-api): add POST /api/v2/windows/open admin route` (G5)
6. `feat(v2-api): add POST /api/v2/graduation/close admin route` (G6)
7. `feat(v2-api): add GET /api/v2/board/ranking with camp-scoped eligibility gate` (G7)
8. `feat(v2-api): add GET /api/v2/board/member/:id with 404 on non-eligible members` (G8)
9. `feat(v2-api): add GET /api/v2/admin/review-queue and POST decide routes` (G9)
10. `feat(v2-api): add GET /api/v2/admin/members and PATCH /:id admin routes` (G10)
11. `feat(v2-api): add GET /api/v2/llm/worker/status monitoring route` (G11)
12. `chore(v2): document LLM worker and bootstrap operator env keys` (H1)
13. `chore(v2): boot LLM scoring worker with Fastify lifecycle and signal handling` (H2)
14. `chore(v2): refactor ensure-bootstrap to seed W1/W2 shells and apply bootstrap operators` (H3)
15. `test(v2): add end-to-end integration test covering the full period → settlement pipeline` (H4)
16. `chore: drop legacy v1 scoring surface` (I1)
17. `chore(v2): mark phase 1 complete` (I2)

---

## Appendix E — File Size Budget

This appendix tracks the expected file sizes after Phase G, H, and I are complete. Each entry is an approximate line count. The budget is not hard — minor overages are acceptable — but any file that grows more than 20% beyond its budget should be investigated for possible refactoring.

### Phase G Files

| File | Budget | Rationale |
|---|---|---|
| `src/app.ts` | 700 | Pre-Phase G baseline approximately 610 lines. Phase G adds approximately 90 lines for options interface, buildV2Runtime, requireAdmin, and route imports. |
| `src/app-v2-errors.ts` | 70 | One switch case per DomainError subclass plus the default. |
| `src/routes/v2/common.ts` | 40 | Re-exports plus parseStrict helper. |
| `src/routes/v2/events.ts` | 80 | Single POST handler. |
| `src/routes/v2/periods.ts` | 120 | Two handlers: openNewPeriod and closePeriod. |
| `src/routes/v2/windows.ts` | 60 | Single POST handler. |
| `src/routes/v2/graduation.ts` | 50 | Single POST handler. |
| `src/routes/v2/board.ts` | 150 | Two handlers: ranking and member detail. |
| `src/routes/v2/admin-review.ts` | 100 | Two handlers: list and decide. |
| `src/routes/v2/admin-members.ts` | 120 | Two handlers: list and patch. |
| `src/routes/v2/llm-status.ts` | 40 | Single GET handler. |
| `src/types/fastify.d.ts` | 15 | Module augmentation only. |

### Phase G Test Files

| File | Budget | Rationale |
|---|---|---|
| `tests/api/v2/require-admin.test.ts` | 150 | Four test cases with setup. |
| `tests/api/v2/app-wiring.test.ts` | 120 | Four test cases with setup. |
| `tests/api/v2/events-post.test.ts` | 200 | Eight test cases. |
| `tests/api/v2/periods-open.test.ts` | 120 | Four test cases. |
| `tests/api/v2/periods-close.test.ts` | 100 | Three test cases. |
| `tests/api/v2/windows-open.test.ts` | 150 | Five test cases. |
| `tests/api/v2/graduation-close.test.ts` | 100 | Three test cases. |
| `tests/api/v2/board-ranking.test.ts` | 180 | Four test cases with fixture setup. |
| `tests/api/v2/board-member-detail.test.ts` | 150 | Four test cases. |
| `tests/api/v2/admin-review-queue.test.ts` | 200 | Six test cases. |
| `tests/api/v2/admin-members.test.ts` | 180 | Five test cases. |
| `tests/api/v2/llm-worker-status.test.ts` | 80 | Two test cases. |

### Phase H Files

| File | Budget | Rationale |
|---|---|---|
| `.env.example` | 50 | Existing content plus six new keys. |
| `src/server.ts` | 200 | Existing content plus worker lifecycle helpers. |
| `src/services/v2/llm-scoring-client-factory.ts` | 50 | Factory function plus helper. |
| `src/scripts/ensure-bootstrap-data.ts` | 150 | Refactored into runEnsureBootstrap function. |
| `tests/api/v2/end-to-end.test.ts` | 300 | Twenty assertions plus two `it` blocks (approve and reject). |
| `tests/api/v2/helpers.ts` | 150 | Fixture setup and assertion helpers. |
| `tests/config/env-example-shape.test.ts` | 80 | Single test with file parsing. |
| `tests/server/llm-lifecycle.test.ts` | 100 | Two test cases. |
| `tests/scripts/ensure-bootstrap-data-v2.test.ts` | 200 | Four test cases with fixture setup. |

### Phase I Files

No new source files are added in Phase I. The legacy cleanup removes approximately 2500 lines of source and test code. The Phase 1 complete note in README.md adds approximately 5 lines.

---

## Appendix F — Sanity Checks Before Each Task

Each task in this plan includes a "RED → GREEN → REFACTOR" cycle. This appendix adds a set of sanity checks that should be run before starting each task. Running these checks catches environment problems early.

### F.1 Before Any Task

- [ ] `git status` is clean.
- [ ] `git log --oneline -5` shows the expected head commit.
- [ ] `npm install` has been run since the last `package.json` change.
- [ ] `npm test` is green.
- [ ] `npm run build` is green.

### F.2 Before Task G1

- [ ] `src/domain/v2/errors.ts` exists and exports the full DomainError hierarchy from spec section 6.3.
- [ ] `src/domain/v2/eligibility.ts` exists and exports `isEligibleStudent`.
- [ ] `src/storage/sqlite-repository.ts` exposes `findMemberByFeishuOpenId`.

### F.3 Before Task G2

- [ ] Task G1 commit is on HEAD.
- [ ] `src/app-v2-errors.ts` exists and exports `mapDomainErrorToHttp`.
- [ ] `src/routes/v2/common.ts` exists and exports `parseStrict`.
- [ ] `src/services/v2/event-ingestor.ts` exists and exposes the `EventIngestor.ingest` method.

### F.4 Before Task G3

- [ ] Task G2 commit is on HEAD.
- [ ] `src/services/v2/period-lifecycle.ts` exists and exposes `openNewPeriod`.

### F.5 Before Task G4

- [ ] Task G3 commit is on HEAD.
- [ ] `src/storage/sqlite-repository.ts` exposes `closePeriod(periodId, reason, openId)`.

### F.6 Before Task G5

- [ ] Task G4 commit is on HEAD.
- [ ] `src/services/v2/period-lifecycle.ts` exposes `openWindow(code)`.

### F.7 Before Task G6

- [ ] Task G5 commit is on HEAD.
- [ ] `src/services/v2/period-lifecycle.ts` exposes `closeGraduation(admin)`.

### F.8 Before Task G7

- [ ] Task G6 commit is on HEAD.
- [ ] `src/storage/sqlite-repository.ts` already has joins between `members`, `member_levels`, `member_dimension_scores`, `window_snapshots` (from Phase F).

### F.9 Before Task G8

- [ ] Task G7 commit is on HEAD.
- [ ] `fetchRankingByCamp` is implemented and tested.

### F.10 Before Task G9

- [ ] Task G8 commit is on HEAD.
- [ ] `src/services/v2/scoring-aggregator.ts` exposes `applyDecision(eventId, decision, admin)`.

### F.11 Before Task G10

- [ ] Task G9 commit is on HEAD.
- [ ] `src/storage/sqlite-repository.ts` exposes `findMemberById(id)` that returns the full member shape.

### F.12 Before Task G11

- [ ] Task G10 commit is on HEAD.
- [ ] `src/services/v2/llm-scoring-worker.ts` exposes `getStatus()`.

### F.13 Before Task H1

- [ ] Task G11 commit is on HEAD.
- [ ] `.env.example` file exists and is tracked by git.

### F.14 Before Task H2

- [ ] Task H1 commit is on HEAD.
- [ ] `src/services/v2/llm-scoring-worker.ts` exposes `start()` and `stop()` methods.
- [ ] `src/services/v2/fake-llm-scoring-client.ts` exists.

### F.15 Before Task H3

- [ ] Task H2 commit is on HEAD.
- [ ] `src/scripts/ensure-bootstrap-data.ts` exists and currently runs the legacy seed logic.

### F.16 Before Task H4

- [ ] Task H3 commit is on HEAD.
- [ ] Every Phase G route is registered and tested.
- [ ] `startLlmWorker` and `stopLlmWorker` are exported from `src/server.ts`.

### F.17 Before Task I1

- [ ] Task H4 commit is on HEAD.
- [ ] `npm test` is green with all legacy tests still passing.
- [ ] `git grep -l "legacy"` does not return unexpected files.

### F.18 Before Task I2

- [ ] Task I1 commit is on HEAD.
- [ ] `npm test` is green.
- [ ] `npm run build` is green.
- [ ] `git status` is clean.

---

## Appendix G — Rollback Strategy

If Phase G, H, or I produces a regression that cannot be fixed quickly, the rollback strategy is:

1. **Identify the offending commit.** Use `git log --oneline` to find the commit that introduced the regression. Each task is a single commit, so the rollback unit is one task.

2. **Revert the commit.** Use `git revert <sha>` to produce a revert commit. Do not use `git reset --hard` because it rewrites history.

3. **Re-run the test suite.** After the revert, `npm test && npm run build` must be green. If they are not, the revert conflicted with a later commit and requires manual resolution.

4. **Document the regression.** File an issue describing the regression, the reverted commit, and the path forward.

5. **Plan the fix.** The fix may require re-landing the task with corrections, or it may require a deeper refactor. Document the plan before attempting the fix.

**Rollback boundaries**

- Phase G rollbacks are always safe: each task is an isolated route with its own tests.
- Phase H rollbacks may require coordination: H2, H3, and H4 share `src/server.ts` and `src/scripts/ensure-bootstrap-data.ts`, so reverting one may leave the others in an inconsistent state.
- Phase I rollbacks are dangerous because I1 deletes files. Reverting I1 restores the deleted files, but the revert commit will be large and may conflict with subsequent changes. If I1 must be rolled back, consider instead writing a new "re-add v1 scoring surface" commit with a clear explanation.

---

## Appendix H — CI Configuration

The CI pipeline must run the following steps after any Phase G, H, or I change:

1. `npm install --frozen-lockfile`
2. `npm run build`
3. `npm test`
4. `npm run test:coverage` (only after Task I2)
5. Lint check: verify no `console.log` in `src/`
6. Size check: verify no file in `src/` exceeds 800 lines

The CI pipeline must fail if any step fails. The pipeline must not be configured to skip coverage or size checks; those are the primary gates for the phase.

---

## Appendix I — Glossary

- **AQ**: Advancement Quotient. The per-window score that drives promotion.
- **Dimension**: One of K (Knowledge), H (Habit), C (Communication), S (Support), G (Growth). The five dimensions sum to AQ.
- **Eligibility gate**: The five-layer defence from spec section 5.5 that ensures only eligible students appear in rankings and receive scoring.
- **Ice breaker**: Period 1 of each camp. Does not score.
- **Level**: The student's current segment (L0 through L5 or LFINAL). Advances based on window AQ.
- **Promotion**: The transition from one level to the next.
- **Review required**: An event status that indicates manual admin review is needed.
- **Settlement**: The process of closing a window and computing per-member AQ and promotion status.
- **Window**: A grouping of two or more periods over which AQ is computed.

---

## Appendix J — Open Questions

The following questions are not blocking for Phase 1 but should be revisited when sub-projects 2, 3, or 4 begin:

1. **Review queue SLA.** Should the review queue have a time budget? If so, what happens when a review sits unprocessed for more than the budget?

2. **LLM prompt multilingual support.** The current prompts are hardcoded Chinese. If an English-language camp runs, how do we support multilingual prompts?

3. **C2 reaction concurrency.** If multiple students react to the same message simultaneously, is the C2 cap enforced atomically? The current design assumes a single-threaded reaction tracker.

4. **Operator self-promotion.** Should an existing operator be able to promote another student to operator through the admin dashboard? The current design only supports bootstrap-time promotion via `BOOTSTRAP_OPERATOR_OPEN_IDS`.

5. **Camp dissolution.** What happens if a camp is dissolved mid-season? The current design assumes camps run to completion.

---

## Appendix K — Known Risks

The following risks were identified during plan review and are documented here for future reference:

1. **LLM worker starvation.** If the LLM provider becomes unavailable, the worker will retry forever (up to `LLM_MAX_ATTEMPTS`). Tasks exceeding the max attempt count become `review_required`, which shifts the burden to human reviewers. A prolonged LLM outage could flood the review queue.

2. **SQLite contention.** The bootstrap seed script, the LLM worker, and the HTTP API all write to the same SQLite file. Under high concurrency, SQLite's writer lock could cause delays. Phase 1 does not address this because the expected load is 14 students per camp, which is well below SQLite's ceiling.

3. **Feishu API rate limits.** The member sync service (stubbed in Phase 1) will hit Feishu API rate limits if it calls the API too frequently. Sub-project 2 needs to implement rate limiting on the client side.

4. **Dashboard read performance.** The ranking query reads from multiple tables and is not cached. If the dashboard polls every 5 seconds and there are many concurrent viewers, the DB could become a bottleneck. Sub-project 3 should consider adding a short-lived cache.

5. **Audit trail drift.** If an operator edits a member's metadata, the audit trail is captured via `patch_audit` (a table that Phase 1 does not implement). Without audit logging, a contested edit cannot be traced. Sub-project 3 should add audit logging.

---

## Appendix L — Reviewer Checklist

When reviewing a Phase G, H, or I pull request, the reviewer should verify:

1. The PR title matches the commit message of the top commit.
2. Every task's checkbox list has been marked complete in the PR description.
3. The PR does not squash the seventeen commits into one.
4. The PR does not rebase the commits in a way that changes their contents.
5. Every new file is under the size budget in Appendix E.
6. Every new test uses `app.inject` instead of a real HTTP listener.
7. Every admin route is gated by `adminGuard`.
8. Every route handler wraps its body in a try/catch with `mapDomainErrorToHttp`.
9. No file in `src/` contains `console.log`.
10. The coverage thresholds in `vitest.config.ts` are not weakened.
11. `README.md` has the Phase 1 complete note.
12. No legacy file from spec section 6.2 "完全删除" is still present.

---

## Appendix M — Final Gate

Before merging the Phase G, H, and I pull request, the following final gate must pass:

1. `npm install --frozen-lockfile` succeeds on a fresh clone.
2. `npm run build` is green.
3. `npm test` is green with zero skipped tests.
4. `npm run test:coverage` meets the thresholds from spec section 6.5.
5. `git grep -l "LocalDocumentTextExtractor"` returns zero hits.
6. `git grep -l "console.log"` in `src/` returns zero hits.
7. `git log --oneline | head -20` shows exactly 17 Phase G/H/I commits.
8. The PR has at least one approving review.
9. The dashboard in sub-project 3 can bootstrap against the new surface (manual verification).
10. Sub-project 2's card-action handler can POST to `/api/v2/events` (manual verification).

---

## Appendix N — Schema Reference

This appendix describes the Zod 4 schemas used by every Phase G route. Each schema is described in prose because including literal code would exceed the file size budget. Use this as a checklist when writing the schemas.

### N.1 POST /api/v2/events Body Schema

The body schema has five fields. The `memberId` field is a required string with a minimum length of 1. The `itemCode` field is a required string with a minimum length of 1. The `scoreDelta` field is an optional integer. The `sourceRef` field is a required string with a minimum length of 1. The `payload` field is an optional record where keys are strings and values are unknown. The schema uses `.strict()` to reject unknown top-level keys.

The `memberId` is validated against a minimum length rather than a UUID pattern because member ids may be Feishu open ids, internal UUIDs, or legacy identifiers depending on the seed path. A loose validation is safer than a strict pattern that would reject valid ids.

The `itemCode` is validated against a minimum length rather than an enum of known items because the scoring item catalog may grow in Phase 2 and beyond. A loose validation means new items can be added without touching this schema.

The `scoreDelta` is optional because most items have a fixed score defined in the scoring-items config. Callers that know the exact delta can specify it; callers that do not can omit it and let the ingestor look up the default.

The `payload` is a generic record type because each item has its own payload shape. The ingestor inspects the `itemCode` to determine how to interpret the payload. This is a runtime polymorphism pattern that avoids a massive discriminated union at the schema level.

### N.2 POST /api/v2/periods/open Body Schema

The body schema has one field: `number`, a required integer between 1 and 12. The schema uses `.strict()`. Period numbers outside the 1-to-12 range are rejected at the schema layer, saving the service from validating them separately.

The choice of min 1 and max 12 is driven by the camp structure: each camp has exactly 12 periods (one ice breaker plus 11 scoring periods). Any number outside this range is a trainer mistake and should be rejected immediately.

### N.3 POST /api/v2/periods/close Body Schema

The body schema has two fields: `periodId`, a required string with minimum length 1; and `reason`, a required string with minimum length 1. The schema uses `.strict()`. The `reason` field is free text, not an enum, because operators may need to specify custom reasons for manual closes. The most common values are `manual_close`, `force_close_by_timeout`, and freeform descriptions.

### N.4 POST /api/v2/windows/open Body Schema

The body schema has one field: `code`, a required string matching the regex `/^W[1-5]$|^FINAL$/`. The schema uses `.strict()`. The regex enforces that only six values are accepted: W1, W2, W3, W4, W5, FINAL.

The regex anchors `^` and `$` are critical. Without them, a string like `W1xxx` would match the first part of the regex (`W[1-5]`) and pass through. The anchors force the entire string to match.

### N.5 POST /api/v2/graduation/close Body Schema

The body schema is an empty object `{}`. The schema uses `.strict()`, which means that the only valid body is literally the empty object. Any additional field is rejected with 400.

The empty object schema is used instead of no schema at all because Fastify requires a body for POST requests. An empty object is the minimal valid body.

### N.6 GET /api/v2/board/ranking Query Schema

The query schema has one field: `campId`, a required string with minimum length 1. The schema uses `.strict()`. The `campId` is required because most deployments support multiple camps and the ranking must be scoped to a single camp at a time.

### N.7 GET /api/v2/board/member/:id Params Schema

The params schema has one field: `id`, a required string with minimum length 1. The schema uses `.strict()`. Fastify decodes URL params before the schema runs, so a URL-encoded dash passes through as a regular dash.

### N.8 GET /api/v2/admin/review-queue Query Schema

The query schema has one field: `campId`, an optional string with minimum length 1. The schema uses `.strict()`. The `campId` is optional because single-camp deployments do not need to scope the review queue, and the admin typically wants to see all pending reviews regardless of camp.

### N.9 POST /api/v2/admin/review-queue/:eventId/decide Body and Params Schemas

The params schema has one field: `eventId`, a required string with minimum length 1. The body schema has two fields: `decision`, a required enum of `["approved", "rejected"]`; and `note`, a required string with minimum length 1. Both schemas use `.strict()`.

The `note` field is required even for approvals. Some operators argue that approvals should not need a note because the approval is self-explanatory. The counter-argument, which this plan endorses, is that every decision needs a note for the biweekly compliance review. A note like "looks good" is sufficient.

### N.10 GET /api/v2/admin/members

This endpoint has no body or query parameters. The schema is omitted.

### N.11 PATCH /api/v2/admin/members/:id Body Schema

The params schema has one field: `id`, a required string with minimum length 1. The body schema has five optional fields: `roleType` (enum of student, operator, trainer, observer), `isParticipant` (boolean), `isExcludedFromBoard` (boolean), `hiddenFromBoard` (boolean), and `displayName` (string with minimum length 1). The schema uses `.strict()` and `.refine((data) => Object.keys(data).length > 0, { message: "empty_patch" })`. The refine clause ensures that at least one field is set — an empty patch would produce an invalid SQL UPDATE.

### N.12 GET /api/v2/llm/worker/status

This endpoint has no body or query parameters. The schema is omitted.

---

## Appendix O — Handler Skeleton Reference

This appendix describes the handler shape used by every Phase G route. It is a template that each task instantiates. Use this as a reference when writing the handlers.

### O.1 Non-admin POST Handler Skeleton

The non-admin POST handler has five parts. First, the `parseStrict` call that validates the body and returns either the parsed body or null. Second, the early return if `parseStrict` returned null. Third, the `try` block that calls the service method. Fourth, the success reply with the computed status and body. Fifth, the `catch` block that calls `mapDomainErrorToHttp`.

The handler is always async. Fastify awaits the returned promise and uses its resolved value as the reply, unless the handler explicitly called `reply.send` (which it does for error responses).

### O.2 Non-admin GET Handler Skeleton

The non-admin GET handler is similar to the POST handler but does not call `parseStrict` because GET has no body. Query parameters are validated via a separate `parseStrict` call on the query schema. URL params are validated via a third `parseStrict` call on the params schema. All three validation calls use the same helper with different schemas.

### O.3 Admin POST Handler Skeleton

The admin POST handler is identical to the non-admin POST handler except that it registers the `adminGuard` hook. The hook runs before the handler and short-circuits with 401 or 403 if the caller is not an admin. Inside the handler, `request.currentAdmin` is guaranteed to be defined because the hook short-circuits otherwise. The handler can safely use `request.currentAdmin!.id` without a null check.

### O.4 Admin PATCH Handler Skeleton

The admin PATCH handler combines the PATCH body validation with the `adminGuard` hook. The body schema uses the `.refine()` clause to reject empty patches. The handler calls the repository method with the parsed body and the admin identity, then re-fetches the updated row and returns it.

---

## Appendix P — Test File Shape Reference

This appendix describes the shape of a typical Phase G test file. It is a template that each test file instantiates. Use this as a reference when writing tests.

### P.1 Imports and Setup

Every test file starts with imports: `describe`, `it`, `expect`, `vi`, and `beforeEach` from vitest; `createApp` from the app file; types from the domain layer. The setup block constructs the `:memory:` repository, seeds any fixtures, and boots the app via `createApp`. The setup runs inside `beforeEach` so each test gets a fresh app instance.

### P.2 Test Organisation

Tests are organised by `describe` blocks. Each `describe` block represents a route or a scenario. Inside each `describe`, the `it` blocks cover one assertion each. Tests that share setup can use a shared `beforeEach` inside the `describe`.

### P.3 Injection Pattern

The injection pattern is `const response = await app.inject({ method: "POST", url: "/api/v2/events", headers: { "x-feishu-open-id": "ou-op-1" }, payload: { ... } })`. The response object has `statusCode`, `body` (a string), and `json()` (a method that parses the body as JSON). Most assertions check `response.statusCode` and `response.json()`.

### P.4 Fake Dependencies

Fake dependencies are constructed with `vi.fn()`. The fake's return value is set via `fakeFn.mockResolvedValue(...)` for async methods or `fakeFn.mockReturnValue(...)` for sync methods. Call-count assertions use `expect(fakeFn).toHaveBeenCalledTimes(n)`. Call-argument assertions use `expect(fakeFn).toHaveBeenCalledWith(...)`.

### P.5 Error Path Assertions

Error path assertions check the HTTP status and the error code. The pattern is `expect(response.statusCode).toBe(400); expect(response.json().ok).toBe(false); expect(response.json().code).toBe("not_eligible");`. The message field is sometimes checked with `expect(response.json().message).toContain("m-1")` but it is not always strictly validated because the message text may change over time.

### P.6 Teardown

The teardown block is typically empty because vitest cleans up the worker process between test files. The `:memory:` repository is garbage collected when the app instance goes out of scope.

---

## Appendix Q — Test Runtime Budgets

This appendix sets expected runtime budgets for each test file. A test file that exceeds its budget by more than 2x should be investigated for performance problems.

| File | Budget | Rationale |
|---|---|---|
| `tests/api/v2/require-admin.test.ts` | 500ms | Four trivial cases. |
| `tests/api/v2/app-wiring.test.ts` | 500ms | Four trivial cases. |
| `tests/api/v2/events-post.test.ts` | 800ms | Eight cases, all fake dependencies. |
| `tests/api/v2/periods-open.test.ts` | 400ms | Four cases. |
| `tests/api/v2/periods-close.test.ts` | 300ms | Three cases. |
| `tests/api/v2/windows-open.test.ts` | 500ms | Five cases. |
| `tests/api/v2/graduation-close.test.ts` | 300ms | Three cases. |
| `tests/api/v2/board-ranking.test.ts` | 800ms | Real repository, four cases with fixture setup. |
| `tests/api/v2/board-member-detail.test.ts` | 600ms | Real repository, four cases. |
| `tests/api/v2/admin-review-queue.test.ts` | 700ms | Six cases. |
| `tests/api/v2/admin-members.test.ts` | 600ms | Five cases plus SQL injection test. |
| `tests/api/v2/llm-worker-status.test.ts` | 200ms | Two trivial cases. |
| `tests/api/v2/end-to-end.test.ts` | 5000ms | Full pipeline with twenty assertions. |
| `tests/config/env-example-shape.test.ts` | 100ms | Single file parse. |
| `tests/server/llm-lifecycle.test.ts` | 500ms | Two cases with mock lifecycle. |
| `tests/scripts/ensure-bootstrap-data-v2.test.ts` | 800ms | Four cases with fixture setup. |
| `tests/storage/sqlite-repository-v2-ranking.test.ts` | 400ms | Repository unit test. |
| `tests/storage/sqlite-repository-v2-member-detail.test.ts` | 400ms | Repository unit test. |
| `tests/storage/patch-member-for-admin.test.ts` | 200ms | SQL injection regression test. |

Total Phase G + H test suite runtime: approximately 13 seconds. This fits comfortably inside a CI pipeline with a 5-minute budget.

---

## Appendix R — Dependency Graph

This appendix describes the dependency graph between Phase G tasks. A task depends on another task if the dependent task cannot be started until the other task is committed.

### R.1 Phase G Dependencies

- G1 depends on: nothing within Phase G. (Assumes Phases A through F are complete.)
- G2 depends on: G1 (for `mapDomainErrorToHttp`, `parseStrict`, and `createApp` options).
- G3 depends on: G1.
- G4 depends on: G1 and G3 (extends the `src/routes/v2/periods.ts` file created by G3).
- G5 depends on: G1.
- G6 depends on: G1.
- G7 depends on: G1.
- G8 depends on: G1 and G7 (extends the `src/routes/v2/board.ts` file created by G7).
- G9 depends on: G1.
- G10 depends on: G1.
- G11 depends on: G1.

### R.2 Phase H Dependencies

- H1 depends on: G11 (the last Phase G commit).
- H2 depends on: H1.
- H3 depends on: H2.
- H4 depends on: H3 (and all Phase G routes).

### R.3 Phase I Dependencies

- I1 depends on: H4.
- I2 depends on: I1.

### R.4 Parallelisation Opportunities

Given the dependency graph, the following tasks can run in parallel:

- G2, G3, G5, G6, G7, G9, G10, G11 can all run in parallel after G1 commits.
- G4 must wait for G3.
- G8 must wait for G7.
- H1 through H4 must run sequentially.
- I1 and I2 must run sequentially.

This gives a maximum parallelism of eight simultaneous subagents in Phase G. In practice, the parallelism ceiling is limited by merge conflicts on `src/app.ts` (which every route task edits), so a more conservative ceiling of four or five subagents is more realistic.

---

## Appendix S — Historical Context

This appendix provides historical context for why Phase G, H, and I are structured the way they are. It is optional reading but may help future contributors understand the rationale behind specific decisions.

### S.1 Why fastify.inject instead of supertest

The v1 codebase used `supertest` for HTTP testing. `supertest` starts a real HTTP listener and makes real HTTP requests, which is more realistic but slower. The v2 codebase uses `fastify.inject`, which short-circuits the HTTP listener and directly invokes the handler chain. `fastify.inject` is faster (no port allocation, no socket overhead) and more deterministic (no network flakiness).

The downside of `fastify.inject` is that it does not test the transport layer. If a bug exists in how Fastify parses TCP packets, `fastify.inject` would not catch it. This is an acceptable trade-off because the transport layer is Fastify's responsibility, not ours, and we trust their test suite.

### S.2 Why closure-based DI instead of container DI

The v1 codebase used a simple singleton pattern for dependencies. Dependencies were stashed on `app.decorate` and accessed from every handler. This worked for a small codebase but became brittle as the v2 surface grew.

The v2 codebase uses closure-based DI: dependencies are captured in the `createApp` closure and passed to each route registration function as `deps`. This pattern has three advantages. First, dependencies are explicit at the function signature level, making the code easier to read. Second, tests can substitute fakes by passing them as `createApp` options. Third, there is no global state, so parallel test execution inside vitest workers does not cause cross-test interference.

The downside of closure-based DI is verbosity: every route registration function takes a `deps` parameter. This is an acceptable trade-off because the verbosity makes the data flow explicit.

### S.3 Why Zod 4 strict mode

The `.strict()` modifier on Zod schemas rejects unknown keys at parse time. The v1 codebase did not use strict mode, which meant that a typo in the API caller's payload would pass through silently. A `memberID` instead of `memberId` would result in a null dereference downstream.

Strict mode catches these typos at the API boundary, producing a clear 400 error with a `details` field that lists the unknown keys. This improves the API's ergonomics for callers at the cost of a small performance overhead (Zod has to compare each key against the schema).

### S.4 Why a single mapDomainErrorToHttp helper

The v1 codebase inlined error-to-HTTP mappings in every route handler. This led to drift: one route would map `not_eligible` to 400 while another would map it to 422. The v2 codebase centralises the mapping in a single helper, which guarantees consistency.

The helper also provides an exhaustiveness check via a `const _never: never = err.code;` assignment at the end of the switch. If a future developer adds a new `DomainError` subclass without updating the switch, the TypeScript compiler emits an error. This is a "fail closed" pattern that prevents silent omissions.

### S.5 Why the bootstrap script is both a CLI and a library

The v1 bootstrap script was a CLI-only file with no exports. Tests could not import it without triggering its side effects. The v2 refactor makes the bootstrap logic both a CLI and a library: the logic is in an exported `runEnsureBootstrap` function, and the top-level CLI invocation is guarded by `if (import.meta.url === file://${process.argv[1]})`.

This pattern lets tests import the function and call it with a `:memory:` repository, which is essential for deterministic testing. The CLI invocation still works when the file is run directly via `npm run seed:ensure`.

### S.6 Why we delete legacy files instead of deprecating them

The v1 codebase has accumulated dead code that is marked deprecated but not deleted. This accumulation is a maintenance burden: every rename or refactor must consider whether the deprecated code is affected. Over time, the deprecated code drifts away from the live code and becomes a source of confusion.

The v2 cleanup deletes legacy files outright. This is a cleaner approach because it leaves no ambiguity about which code is live. The downside is that reverting requires a restore from git history, but this is rarely needed in practice.

### S.7 Why the LLM worker is its own process-local service

The LLM worker runs inside the same Node process as the Fastify server. An alternative design would separate the worker into its own process (for example, a separate npm script or a Kubernetes sidecar). The same-process design was chosen for simplicity: one process is easier to deploy, monitor, and debug than two.

The trade-off is that a bug in the worker can bring down the HTTP server. This is mitigated by the worker's task timeout and the signal-handler's idempotent stop. If the worker hangs, SIGTERM will drain it before closing Fastify, preventing a stuck process.

### S.8 Why the end-to-end test uses a single it block

The end-to-end test has twenty assertions in a single `it` block because the assertions form a narrative. Splitting them into twenty separate `it` blocks would require either a shared setup (which breaks test isolation) or twenty separate full-pipeline bootstraps (which is prohibitively slow).

The single-block approach has a drawback: when one assertion fails, the test output does not tell you which assertion failed. The assertions are numbered with comments in the source so you can find the offending assertion by reading the test file. This is a small inconvenience for a large gain in runtime.

---

## Appendix T — Migration Path For Existing Deployments

This appendix describes the migration path for deployments that are currently running the v1 scoring surface. It is relevant to teams that deploy this codebase to an existing production environment.

### T.1 Pre-Migration Checklist

Before starting the migration:

1. Take a full database backup.
2. Verify that the backup can be restored to a fresh environment.
3. Schedule a maintenance window (approximately 30 minutes).
4. Notify users that the scoring surface will be updated.
5. Ensure that sub-project 2 and sub-project 3 are ready to consume the new `/api/v2/*` surface.

### T.2 Migration Steps

1. Deploy the new build (Phase G through I committed).
2. Run the database migrations (added in Phases A through F).
3. Run `npm run seed:ensure` to backfill W1 and W2 shells.
4. Run `npm run seed:ensure` again to verify idempotency.
5. Smoke-test the new endpoints with `curl` or a similar tool.
6. Route traffic to the new endpoints.
7. Monitor the LLM worker status endpoint for 24 hours.
8. Archive the old endpoints (they have been deleted, so this is a no-op).

### T.3 Rollback Path

If the migration fails:

1. Restore the database from the backup.
2. Deploy the previous build.
3. Verify that the old endpoints are reachable.
4. File an incident report describing the failure.

### T.4 Data Preservation

Spec section 5.8 establishes that historical data is preserved even when members change role. This means that a student promoted to operator retains all their scoring events in the DB — the events are simply hidden from the dashboard by the eligibility gate. This preservation makes the migration safer because no data is lost.

---

## Appendix U — Open Loops Inherited From Phases A Through F

This appendix lists any open loops that Phases A through F left for Phase G, H, or I to resolve. If a loop is not resolved by Phase I, it must be documented here and escalated to sub-project 2 or 3.

### U.1 No Open Loops

As of the writing of this plan, Phases A through F are assumed complete and all their open loops have been resolved. If an open loop is discovered during Phase G execution, document it here and include it in the Phase I sign-off.

---

## Appendix V — Phase 2 Roadmap Notes

This appendix is forward-looking. It describes work that is out of scope for Phase 1 but should be considered when Phase 2 begins.

### V.1 Dashboard Read Caching

The dashboard in sub-project 3 will poll `GET /api/v2/board/ranking` frequently. If the poll frequency is high and there are many concurrent viewers, the DB could become a bottleneck. Phase 2 should add a short-lived cache (for example, 30 seconds) with a cache-busting hook on write operations.

### V.2 Multi-Camp Support

The current design supports multiple camps but does not optimise for the multi-camp case. Phase 2 should add camp-scoped indexes and optimise the ranking query to use them.

### V.3 LLM Cost Tracking

The LLM worker does not track per-task cost. Phase 2 should add cost tracking so that operators can see how much each scoring run cost.

### V.4 Review Queue SLA

The review queue does not have an SLA. Phase 2 should add a time budget and escalation path for unreviewed items.

### V.5 Audit Logging

The PATCH endpoint for admin members does not log the change. Phase 2 should add an audit log that captures the operator, the changed fields, the old values, and the new values.

### V.6 Multi-Language LLM Prompts

The LLM prompts are hardcoded Chinese. Phase 2 should add multi-language support for teams running English-language camps.

---

## Appendix W — Troubleshooting Common Issues

This appendix lists common issues and their fixes. It is a living document — add new entries as they are discovered during implementation.

### W.1 "reply already sent" error

Symptom: A test fails with "reply already sent" when calling `app.inject`.

Cause: The handler called `reply.send` twice. This usually happens when `parseStrict` returns null (and has already sent a 400 response) but the handler does not early-return and continues to call `reply.send` with the success path.

Fix: Add `if (!parsed) return;` immediately after the `parseStrict` call.

### W.2 "Cannot find module" error

Symptom: A test fails with "Cannot find module" when importing `createApp`.

Cause: The import path is wrong. This usually happens when copying an import statement from another test file and forgetting to adjust the relative path.

Fix: Use the absolute path `../../../src/app.js` (note the `.js` extension — TypeScript files are imported with a `.js` extension in ESM mode).

### W.3 "TypeError: createApp is not a function" error

Symptom: A test fails with "TypeError: createApp is not a function".

Cause: The `createApp` export is not exported from `src/app.ts`. This usually happens when the export statement was accidentally deleted.

Fix: Verify that `src/app.ts` has `export async function createApp(...)` at the top level.

### W.4 "Unknown key 'extra'" error

Symptom: A POST request returns 400 with details `{ unrecognizedKeys: ["extra"] }`.

Cause: The request body has an unknown key and the schema uses `.strict()`. This is the expected behaviour.

Fix: Remove the unknown key from the request body. If the unknown key is a legitimate field that should be accepted, add it to the schema.

### W.5 "401 no_identity" error on an endpoint that should be public

Symptom: A GET request returns 401 `no_identity`.

Cause: The route is accidentally registered with `adminGuard`. Public routes should not have the guard.

Fix: Remove `{ onRequest: adminGuard(deps.repository) }` from the route registration.

### W.6 "403 not_admin" error for an operator

Symptom: An admin request with a valid operator header returns 403 `not_admin`.

Cause: The member's `roleType` is stored as something other than `operator` or `trainer` in the database. This usually happens when the fixture data is wrong.

Fix: Verify the seeded data by querying the `members` table directly. The `role_type` column should be `operator` or `trainer` for admin users.

### W.7 Flaky end-to-end test

Symptom: The end-to-end test passes sometimes and fails other times.

Cause: The test depends on the LLM worker's background poll, which has a variable delay. This is a classic flakiness pattern.

Fix: Use `await llmWorker.drainOnce()` to advance the worker deterministically. Do not use `setTimeout` to wait for the worker.

### W.8 Coverage below threshold

Symptom: `npm run test:coverage` fails with "lines coverage 83% below threshold 85%".

Cause: Some code paths are not exercised by the tests. This is usually a signal that the test suite is incomplete.

Fix: Run the coverage report and identify the uncovered lines. Write tests that exercise those lines. Do not lower the threshold.

### W.9 "SQL logic error" on SQLite

Symptom: A repository query fails with "SQL logic error".

Cause: The query has a syntax error or references a non-existent column. This usually happens when the schema evolves but the query is not updated.

Fix: Log the query via `db.prepare(sql).all(params)` with the SQL printed to the console, then inspect the SQL by hand. Verify that every column name is correct.

### W.10 "Dangling timer prevents process exit"

Symptom: After running tests, the process does not exit and the CI job times out.

Cause: A test did not clean up a timer (usually the LLM worker poll loop). The timer keeps the event loop alive.

Fix: Call `await stopLlmWorker(app, { llmWorker })` at the end of the test. Alternatively, use `vitest`'s built-in `afterEach` hook to clean up resources.

---

## Appendix X — Phase G, H, I Summary

Phases G, H, and I together deliver the HTTP surface for sub-project 1. Phase G ships eleven routes across nine files. Phase H wires the startup, seed, and end-to-end test. Phase I cleans up the legacy v1 surface and marks Phase 1 complete. The total deliverable is 17 commits.

The phases are structured to minimise risk: each task is an independent unit with its own tests and its own commit. A bug in one task can be reverted without touching the others. The plan supports both subagent-parallel execution (for Phase G) and fully inline execution (for Phase H and I).

The end state is a working `/api/v2/*` HTTP surface, a running LLM worker, a seeded dev environment, a passing end-to-end test, and a clean codebase with no legacy dead code. Sub-projects 2 and 3 can consume this surface without further modification.

This is the end of the Phase G, H, and I implementation plan.

---

## Appendix Y — Detailed Assertion Examples

This appendix provides extended examples of the assertion patterns used across Phase G, H, and I tests. Each example is written in prose rather than literal code to keep the file under the size budget. Use the examples as templates when writing new tests.

### Y.1 Happy Path Assertion For POST /api/v2/events

The happy path assertion verifies three things: the HTTP status is 202, the response body has `ok: true`, and the response body has the event id returned by the fake ingestor. The assertion pattern is: call `app.inject` with the POST method, the URL `/api/v2/events`, and a valid body; read `response.statusCode` and `response.json()`; assert `response.statusCode === 202`; assert `response.json().ok === true`; assert `response.json().eventId === "evt-123"`. The fake ingestor's `mockResolvedValue` must be set to `{ eventId: "evt-123" }` before the test runs.

### Y.2 Not Eligible Error Assertion For POST /api/v2/events

The not-eligible assertion verifies three things: the HTTP status is 400, the response body has `ok: false`, and the response body has the error code `not_eligible`. The assertion pattern is: mock the fake ingestor's `ingest` method to throw `new NotEligibleError("not_eligible", "m-1 is not a student")`; call `app.inject`; assert `response.statusCode === 400`; assert `response.json().ok === false`; assert `response.json().code === "not_eligible"`; optionally assert `response.json().message.includes("m-1")`.

### Y.3 Missing Header Assertion For An Admin Route

The missing-header assertion verifies two things: the HTTP status is 401 and the response body has the error code `no_identity`. The assertion pattern is: call `app.inject` without the `x-feishu-open-id` header; assert `response.statusCode === 401`; assert `response.json().code === "no_identity"`.

### Y.4 Strict Mode Rejection Assertion

The strict-mode rejection assertion verifies three things: the HTTP status is 400, the response body has the error code `invalid_body`, and the response body has a `details` field listing the unknown keys. The assertion pattern is: call `app.inject` with a body that has an extra key; assert `response.statusCode === 400`; assert `response.json().code === "invalid_body"`; assert `response.json().details` is defined and mentions the extra key.

### Y.5 Ranking Order Assertion For GET /api/v2/board/ranking

The ranking-order assertion verifies the sort order and the rank field. The pattern is: seed five students with known cum AQ values; call `app.inject` with the GET method; parse the response body; assert that `rows.length === 5`; assert that `rows[0].cumulativeAq >= rows[1].cumulativeAq` (descending); assert that `rows[0].rank === 1`; assert that tied members have the same rank; assert that the next non-tied member has a rank that accounts for the tied pair.

### Y.6 Operator Exclusion Assertion For GET /api/v2/board/ranking

The operator-exclusion assertion verifies that operator rows do not appear in the response. The pattern is: seed one student and one operator with higher cum AQ; call `app.inject`; assert that `rows.length === 1`; assert that `rows[0].memberId === "m-1"` (not the operator id).

### Y.7 404 Assertion For GET /api/v2/board/member/:id

The 404 assertion verifies that unknown or ineligible members return 404. The pattern is: call `app.inject` with a URL that references an unknown member id; assert `response.statusCode === 404`; assert `response.json().code === "not_found"`.

### Y.8 Decision Forwarding Assertion For POST /api/v2/admin/review-queue/:eventId/decide

The decision-forwarding assertion verifies that the admin identity is passed to the aggregator. The pattern is: call `app.inject` with an operator header and a valid decision body; assert the aggregator's fake was called once; inspect `fakeAggregator.applyDecision.mock.calls[0]`; assert the first argument is the event id; assert the second argument is the decision object; assert the third argument has `role_type === "operator"`.

### Y.9 SQL Injection Defence Assertion

The SQL injection assertion verifies that parameter binding prevents injection. The pattern is: seed one member; call `patchMemberForAdmin("m-1", { displayName: "'; DROP TABLE members; --" })`; query `sqlite_master` to verify the `members` table still exists; query the member row to verify the `displayName` column contains the injection string literally.

### Y.10 LLM Worker Lifecycle Assertion

The LLM worker lifecycle assertion verifies the start-stop order. The pattern is: construct a fake worker with vitest `vi.fn()` mocks for `start` and `stop`; call `startLlmWorker`; assert `fakeWorker.start.mock.calls.length === 1`; call `stopLlmWorker`; assert `fakeWorker.stop.mock.calls.length === 1`; assert `fakeWorker.stop` was called before `app.close`; assert a second call to `stopLlmWorker` does not double-invoke `stop`.

### Y.11 Bootstrap Idempotency Assertion

The bootstrap idempotency assertion verifies that running the seed twice produces identical state. The pattern is: boot a `:memory:` repository; call `runEnsureBootstrap` once; read the resulting state (camp id, window count, member count); call `runEnsureBootstrap` again; read the resulting state again; assert the two states are identical.

### Y.12 End-To-End Pipeline Assertion

The end-to-end pipeline assertion is the most complex and is described in full in Task H4. The pattern is a narrative: seed students, open W1, open period 1 (ice breaker), reject events during ice breaker, open period 2, ingest events, open period 3, ingest K3 event, drain LLM worker, open W3, open period 4 (triggers W1 settlement), assert state, query ranking, query member detail, query review queue, stop worker.

---

## Appendix Z — Final Notes

This appendix is a catch-all for any notes that did not fit into the other appendices. Use it sparingly; prefer the existing appendices.

### Z.1 Notes On The Commit Message Format

The commit messages in this plan follow the conventional-commits format: `type(scope): description`. The `type` is one of `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `perf`, or `ci`. The `scope` is either `v2-api` (for Phase G route commits), `v2` (for Phase H config and startup commits), or omitted (for Phase I cleanup commits).

The description is in the imperative mood and starts with a lowercase letter. For example: `add POST /api/v2/events route` (not `Added...` or `Adds...`). This convention matches the Angular commit style used by many open-source projects.

### Z.2 Notes On Type Definition Placement

New TypeScript interfaces and types that describe domain concepts go in `src/domain/v2/types.ts`. Types that describe HTTP shapes (request bodies, response envelopes) go in the route file or in `src/routes/v2/common.ts`. Types that describe test fixtures go in `tests/api/v2/helpers.ts`.

The split between domain types and HTTP types matters because the domain types are the source of truth for the business logic while the HTTP types are a projection of the domain types onto the wire format. Mixing them would blur the boundary and make refactoring harder.

### Z.3 Notes On Error Message Formatting

Error messages should be in English, written in a natural-language style, and include enough context to identify the problem. For example: `"m-1 is not a student"` (good) versus `"NOT_ELIGIBLE"` (bad — no context) versus `"member m-1 with roleType operator and isParticipant true failed eligibility check"` (bad — too much context).

Error messages are surfaced to the API client via the response body's `message` field. Clients may display the message to end users, so the message should be readable by a non-technical audience.

### Z.4 Notes On Logging Levels

Fastify's `request.log` has five levels: `fatal`, `error`, `warn`, `info`, `debug`. The conventions used in Phase G are:

- `fatal`: never used in handlers.
- `error`: unhandled errors logged by `mapDomainErrorToHttp`.
- `warn`: domain errors that are worth investigating (for example, frequent `cap_exceeded` errors from a single member).
- `info`: successful state-changing operations (for example, period opened or closed).
- `debug`: verbose per-request logging, disabled by default in production.

### Z.5 Notes On Dependency Ordering

When registering multiple routes on the same Fastify app instance, the order of registration matters for routes that share a URL prefix. Fastify matches routes in registration order, so a more specific route must be registered before a less specific route. For example, `GET /api/v2/board/member/:id` must be registered after `GET /api/v2/board/ranking` if both routes are in the same file, or Fastify may match the wrong route.

In practice, this rarely matters because Phase G routes have distinct URL prefixes. But it is worth knowing in case a future route adds ambiguity.

### Z.6 Notes On Fastify Version Compatibility

This plan assumes Fastify 4.x or later. Fastify 3.x has a different error-handler signature and may require adjustments to `mapDomainErrorToHttp`. If the project is stuck on Fastify 3.x, file an issue and plan an upgrade before proceeding.

### Z.7 Notes On Vitest Version Compatibility

This plan assumes Vitest 1.x or later. Vitest 0.x has a different mock API and may require adjustments to the test patterns. If the project is stuck on Vitest 0.x, file an issue and plan an upgrade before proceeding.

### Z.8 Notes On Zod Version Compatibility

This plan assumes Zod 4.x. Zod 3.x has a different `z.record` signature (`z.record(z.unknown())` instead of `z.record(z.string(), z.unknown())`). If the project is on Zod 3.x, adjust the schemas accordingly.

### Z.9 Notes On SQLite Version Compatibility

This plan assumes SQLite 3.40 or later. Older versions may not support all the SQL features used by the repository methods. If the project is on an older SQLite, file an issue and plan an upgrade before proceeding.

### Z.10 Notes On Node.js Version Compatibility

This plan assumes Node.js 20.x or later. Older versions may not support ESM imports with the `.js` extension in TypeScript files, and may not support the `import.meta.url` syntax used in the bootstrap script.

---

## Appendix AA — Cross-Task Consistency Checks

This appendix describes the consistency checks that should be run across all Phase G, H, and I tasks. These checks catch bugs that are introduced when two tasks drift out of sync.

### AA.1 Consistency Between Schema And Service Method

The body schema for a route must match the argument shape of the service method it calls. If the schema has `{ memberId, itemCode, scoreDelta, sourceRef, payload }` and the service method signature is `ingest({ memberId, itemCode, sourceRef })`, the `scoreDelta` and `payload` fields are silently dropped. To catch this, the test suite should include an assertion that the service method was called with the full schema shape.

### AA.2 Consistency Between Error Code And HTTP Status

The error code in the domain error must match the HTTP status in `mapDomainErrorToHttp`. If the domain error `NotEligibleError` has code `not_eligible` but the mapper has a case for `notEligible` (camelCase), the mapper misses the error and falls through to the internal error path. To catch this, the test suite should include an assertion that every domain error produces the expected HTTP status.

### AA.3 Consistency Between Test Fixture And Schema

The test fixture must match the schema. If the fixture has `memberId: 42` (a number) but the schema requires a string, the test will fail with a schema validation error. This is expected for negative tests but unexpected for happy-path tests. To catch this, the test harness should construct fixtures using typed helpers.

### AA.4 Consistency Between Route File And createApp Import

Every new route file exports a `registerV2*` function that must be imported and called inside `createApp`. If a route file is created but not imported, the route is never registered and the test fails with 404. To catch this, the test suite should include a smoke test that lists every registered route and asserts the expected count.

### AA.5 Consistency Between Spec Section And Implementation

Every behaviour in the implementation must trace to a spec section. If the implementation has a behaviour that is not in the spec, either the spec needs to be updated or the behaviour needs to be removed. To catch this, code comments should reference spec sections where the behaviour was decided.

---

## Appendix AB — Post-Implementation Validation

After Phase G, H, and I are complete, the following post-implementation validation should be run to confirm the system is in a known-good state.

### AB.1 Smoke Test

Start the server locally with `npm run dev`. Hit the health endpoint: `curl http://localhost:3000/_health`. Should return 200.

Hit the worker status endpoint: `curl http://localhost:3000/api/v2/llm/worker/status`. Should return 200 with `{ ok: true, status: { running: true, ... } }`.

Hit the ranking endpoint with a fake camp id: `curl http://localhost:3000/api/v2/board/ranking?campId=c-1`. Should return 200 with `{ ok: true, campId: "c-1", rows: [...] }`.

### AB.2 Load Test

Use `autocannon` or a similar tool to send 1000 requests to `GET /api/v2/board/ranking?campId=c-1`. Verify that the p99 latency is under 100ms and the error rate is 0.

### AB.3 Failure Injection

Stop the LLM worker manually. Verify that new events ingested via `POST /api/v2/events` still get accepted and enqueued. Verify that the worker status endpoint reports `running: false`. Restart the worker and verify that pending events are processed.

### AB.4 Database Restore Test

Backup the `:memory:` repository after a full E2E test run. Restore the backup into a fresh repository. Verify that `GET /api/v2/board/ranking` returns the same data as before the restore.

### AB.5 Cold Start Test

Delete the DB file. Run `npm run seed:ensure`. Verify that the DB is initialised with W1 and W2 shells and that the bootstrap operators are promoted. Run the smoke test again and verify that all endpoints work.

---

## Appendix AC — Phase 1 Completion Certificate

When all of the following are true, Phase 1 is officially complete. Record the completion in the team's tracking system (Jira, Linear, GitHub Projects) and notify sub-projects 2 and 3.

- [ ] All 17 Phase G, H, I commits are on the branch.
- [ ] `npm test` is green.
- [ ] `npm run build` is green.
- [ ] `npm run test:coverage` meets the thresholds from spec section 6.5.
- [ ] `npm run seed:ensure` works on a fresh DB.
- [ ] The smoke test in Appendix AB.1 passes.
- [ ] No file listed in spec section 6.2 "完全删除" is still present.
- [ ] `README.md` has the Phase 1 complete note.
- [ ] The PR has been reviewed and merged.
- [ ] Sub-project 2 has been notified that the HTTP surface is ready.
- [ ] Sub-project 3 has been notified that the HTTP surface is ready.
- [ ] Sub-project 4 has been notified that the LLM factory is ready.

Signed: _______________________ (Phase 1 lead)
Date: _______________________

---

## Appendix AD — Version History

| Date | Version | Changes |
|---|---|---|
| 2026-04-10 | 1.0 | Initial draft of Phase G, H, I plan. |

---

This is the true end of the Phase G, H, and I implementation plan. Execute with discipline. Commit atomically. Test aggressively. Delete fearlessly. And when in doubt, consult this plan.
