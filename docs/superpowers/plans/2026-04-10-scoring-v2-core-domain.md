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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/domain/v2/eligibility.test.ts`
Expected: PASS — all 7 assertions green.

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

*Phase B — Data Access Layer follows in the next section of this plan.*
