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

Phase G turns the domain services delivered in Phases A–F into a first-class HTTP surface under `/api/v2/*`. All routes are registered inside `createApp` in `src/app.ts`, validated with Zod 4 strict object schemas, and tested through `fastify.inject()` — there is no real HTTP listener in the test suite. A single helper `mapDomainErrorToHttp` in `src/app-v2-errors.ts` centralises the spec §6.4 error → HTTP status table so every route catch block stays one line. `createApp` options are extended with seven new dependency injection points (`ingestor`, `aggregator`, `periodLifecycle`, `windowSettler`, `llmWorker`, `reactionTracker`, `memberSync`) so tests can swap in fakes and production code can wire real implementations through `server.ts`.

**Design constraints that apply to every task in Phase G:**

- All Zod schemas use `z.object({...}).strict()` so unknown keys produce 400 responses.
- All admin routes (anything under `/api/v2/admin/*`, plus `/api/v2/periods/close`, `/api/v2/windows/open`, `/api/v2/graduation/close`) must use the `requireAdmin(repository)` Fastify `onRequest` hook delivered in Task G1.
- Error handling is uniform: every route body is `try { ... } catch (err) { return mapDomainErrorToHttp(err, reply) }`. Routes never let domain errors bubble up to Fastify's default handler.
- Route handler deps come from the closure captured inside `createApp`; the handlers do not read from `app.decorate` or from module-level globals.
- Test files live beside the spec files in `tests/api/v2/` and import `createApp` directly with a `:memory:` SQLite URL.
- The spec §6.4 mapping is the single source of truth for HTTP codes: `not_eligible | cap_exceeded | duplicate → 400`; `no_active_period | no_active_window | ice_breaker_no_scoring | window_already_settled → 409`; `invalid_level_transition → 500 (untyped surface)`; `llm_exhausted` never reaches the HTTP layer; unknown errors → 500 with `{ ok: false, code: "internal_error" }` and no stack trace leakage.

### Task G1 — Admin Middleware + `createApp` Dependency Wiring

**Files**

- `src/app.ts` — extend the `createApp` options interface with the seven new deps, wire sensible defaults, and add the `requireAdmin(repository)` factory.
- `src/app-v2-errors.ts` — NEW. Export `mapDomainErrorToHttp(err: unknown, reply: FastifyReply): FastifyReply`. Holds the entire §6.4 mapping table in one place.
- `src/domain/v2/eligibility.ts` — read-only import; no edits, but the middleware references member shape from here.
- `tests/api/v2/require-admin.test.ts` — NEW. Unit-style tests that use `fastify.inject()` on a tiny route registered inside the test harness.
- `tests/api/v2/app-wiring.test.ts` — NEW. Asserts that `createApp` accepts the new options and exposes them on `request.server.v2` (or an equivalent closure hook) to every route.

**Steps**

- [ ] RED: write `tests/api/v2/require-admin.test.ts` with four failing cases. (1) No `x-feishu-open-id` header → 401 JSON body `{ ok: false, code: "no_identity" }`. (2) Header set but `repository.findMemberByFeishuOpenId` returns `null` → 403 JSON `{ ok: false, code: "not_admin" }`. (3) Header matches a student → 403. (4) Header matches an operator → 200 with a dummy payload echoed by the test-only route. The test harness registers a throwaway route `GET /_test/admin` decorated with `{ onRequest: requireAdmin(repository) }` that returns `{ ok: true, currentAdmin: request.currentAdmin }`. Running `npm test -- tests/api/v2/require-admin.test.ts` must fail with "requireAdmin is not a function".
- [ ] RED: write `tests/api/v2/app-wiring.test.ts`. Instantiate `createApp({ databaseUrl: ":memory:", ingestor: fakeIngestor, aggregator: fakeAggregator, periodLifecycle: fakePeriodLifecycle, windowSettler: fakeWindowSettler, llmWorker: fakeLlmWorker, reactionTracker: fakeReactionTracker, memberSync: fakeMemberSync })`. Then assert via `app.inject({ method: "GET", url: "/_health" })` that the app boots. Also register a second route `GET /_test/deps` inside the test harness (via a factory that you expose temporarily under `createApp` test hook) that returns the typeof each injected dep. This test must fail with "createApp does not accept property 'ingestor'".
- [ ] GREEN: edit `src/app.ts` and expand the `createApp` options interface. Add seven new optional fields, each a full TypeScript interface imported from the domain / services layer: `ingestor?: EventIngestor`, `aggregator?: ScoringAggregator`, `periodLifecycle?: PeriodLifecycleService`, `windowSettler?: WindowSettler`, `llmWorker?: LlmScoringWorker`, `reactionTracker?: ReactionTracker`, `memberSync?: MemberSyncService`. Provide default implementations inline: `options.ingestor ?? new EventIngestor({ repository, clock: options.clock ?? Date })`, and the analogous pattern for the other six. Defaults live behind a small `buildV2Runtime(options, repository)` helper near the top of `createApp` so route registration is not cluttered. Add `declare module "fastify"` augmentation for `request.currentAdmin: MemberRecord | undefined` in `src/types/fastify.d.ts` or an equivalent shared types file.
- [ ] GREEN: add the `requireAdmin` factory. It is a closure that takes a `Repository` and returns a Fastify `onRequest` hook. The hook reads `request.headers["x-feishu-open-id"]`, coerces to a trimmed string, calls `repository.findMemberByFeishuOpenId(openId)`, and short-circuits with 401 on missing header or 403 on missing / non-admin role. On success it assigns `request.currentAdmin = member` and calls `done()`. Also write `src/app-v2-errors.ts` with the `mapDomainErrorToHttp` helper — a simple switch on `err.code` (after narrowing `err` to `DomainError` via `instanceof`) that writes `reply.code(status).send({ ok: false, code, message })`. Unknown errors log via `reply.request.log.error` and return a 500 with `{ ok: false, code: "internal_error" }`. Run `npm test -- tests/api/v2/require-admin.test.ts tests/api/v2/app-wiring.test.ts` — all tests green.
- [ ] REFACTOR: DRY the middleware's header-read logic into a single helper `readOpenIdHeader(request): string | null` inside `src/app.ts`. Add a JSDoc block at the top of `src/app-v2-errors.ts` that lists every `DomainError` subclass and its HTTP mapping so a future reader sees the full table at a glance. Run `npm run build` to confirm the type augmentation compiles; fix any strict-mode gaps the compiler complains about.

**Commit:** `feat(v2-api): add requireAdmin middleware and wire v2 dependencies into createApp`

### Task G2 — `POST /api/v2/events`

**Files**

- `src/app.ts` — register the new route.
- `src/app-v2-errors.ts` — no changes; the route consumes the existing helper.
- `tests/api/v2/events-post.test.ts` — NEW with six failing tests.
- `src/routes/v2/events.ts` — NEW. Route registration module imported by `src/app.ts`. Keeps `src/app.ts` from ballooning past the 800-line limit in the coding-style rule. Exports `registerV2EventsRoute(app, deps)`.

**Steps**

- [ ] RED: write all six tests in `tests/api/v2/events-post.test.ts`. Each test boots `createApp({ databaseUrl: ":memory:", ingestor: fakeIngestor })` where `fakeIngestor.ingest` is a vitest `vi.fn()` with a scripted return value. The happy-path test asserts `app.inject({ method: "POST", url: "/api/v2/events", payload: { memberId: "m-1", itemCode: "K1", scoreDelta: 2, sourceRef: "card-123", payload: { note: "hi" } } })` returns 202 and body `{ ok: true, eventId: "evt-123" }`. The not_eligible test scripts `fakeIngestor.ingest` to throw `new NotEligibleError("not_eligible", "m-1 is not a student")` and asserts 400 + `{ ok: false, code: "not_eligible", message: "m-1 is not a student" }`. The cap_exceeded test throws `new PerPeriodCapExceededError("cap_exceeded", "K1 cap reached for period p-1")` → 400. The duplicate test throws `new DuplicateEventError("duplicate", "sourceRef already ingested")` → 400. The no_active_period test throws `new NoActivePeriodError("no_active_period", "no open period for camp c-1")` → 409. The ice_breaker test throws `new IceBreakerPeriodError("ice_breaker_no_scoring", "ice breaker period does not score")` → 409. Run `npm test -- tests/api/v2/events-post.test.ts` — all six red with "Cannot find /api/v2/events".
- [ ] RED: add a seventh test that asserts an unknown body shape `{ memberId: 42, itemCode: null }` returns 400 with `{ ok: false, code: "invalid_body" }`, and an eighth test that asserts `{ memberId: "m-1", itemCode: "K1", sourceRef: "s", extra: "forbidden" }` also returns 400 because of the `.strict()` modifier. Red.
- [ ] GREEN: create `src/routes/v2/events.ts`. Export `function registerV2EventsRoute(app, deps)`. Inside: declare `const bodySchema = z.object({ memberId: z.string().min(1), itemCode: z.string().min(1), scoreDelta: z.number().int().optional(), sourceRef: z.string().min(1), payload: z.record(z.string(), z.unknown()).optional() }).strict();` followed by `type PostEventBody = z.infer<typeof bodySchema>;`. Register with `app.post<{ Body: PostEventBody }>("/api/v2/events", async (request, reply) => { const parsed = bodySchema.safeParse(request.body); if (!parsed.success) return reply.code(400).send({ ok: false, code: "invalid_body", details: parsed.error.flatten() }); try { const result = await deps.ingestor.ingest(parsed.data); return reply.code(202).send({ ok: true, eventId: result.eventId }); } catch (err) { return mapDomainErrorToHttp(err, reply); } })`. Import and call `registerV2EventsRoute(app, v2Runtime)` from `createApp`. Run `npm test -- tests/api/v2/events-post.test.ts` — all eight green.
- [ ] REFACTOR: extract a private `parseStrict(schema, body, reply)` helper into `src/routes/v2/common.ts` that short-circuits with the invalid_body 400 payload. The new file also re-exports `mapDomainErrorToHttp` for convenience so every route file has a single import line. Thread the helper through Task G2 and leave a `// used by subsequent G-tasks` comment.
- [ ] REFACTOR: re-read `src/routes/v2/events.ts` and verify it is under 120 lines. Verify the `parseStrict` helper preserves the original Zod flattened error so the debug output is still useful. Run `npm run build`.

**Commit:** `feat(v2-api): add POST /api/v2/events route with ingestor integration and six-path error mapping`

### Task G3 — `POST /api/v2/periods/open`

**Files**

- `src/routes/v2/periods.ts` — NEW.
- `src/app.ts` — import and register.
- `tests/api/v2/periods-open.test.ts` — NEW with four failing tests.

**Steps**

- [ ] RED: write four tests in `tests/api/v2/periods-open.test.ts`. (1) Happy path — `fakePeriodLifecycle.openNewPeriod` returns `{ periodId: "p-2", assignedWindowId: "w-W1", shouldSettleWindowId: null }`; POST `/api/v2/periods/open` with body `{ number: 2 }`; assert 201 and body `{ ok: true, periodId: "p-2", assignedWindowId: "w-W1", shouldSettleWindowId: null }`. (2) Window-settle path — `openNewPeriod` returns `{ periodId: "p-4", assignedWindowId: "w-W3", shouldSettleWindowId: "w-W1" }`; assert 201 and body echoes `shouldSettleWindowId`. (3) NoActiveWindow — `openNewPeriod` throws `new NoActiveWindowError("no_active_window", "W3 has not been opened by trainer")`; assert 409 and body `{ ok: false, code: "no_active_window", message: "W3 has not been opened by trainer" }`. (4) Invalid body — POST `{ number: "two" }` → 400 `invalid_body`. All four red.
- [ ] GREEN: create `src/routes/v2/periods.ts`. `registerV2PeriodsOpenRoute(app, deps)`. Schema: `z.object({ number: z.number().int().min(1).max(12) }).strict()`. Handler calls `deps.periodLifecycle.openNewPeriod(body.number)`; wraps in try/catch → `mapDomainErrorToHttp`. Import into `src/app.ts`. Run `npm test -- tests/api/v2/periods-open.test.ts` — green.
- [ ] REFACTOR: pull the shared `parseStrict` usage from Task G2. Verify the file stays under 80 lines.
- [ ] REFACTOR: add a comment block above the route explaining that this endpoint is trainer-initiated and does not require `requireAdmin` because the broader `/开期` slash-command flow in sub-project 2 already gates it inside Feishu — but document that sub-project 3 may choose to add `requireAdmin` if exposed to the admin console. Run `npm run build`.

**Commit:** `feat(v2-api): add POST /api/v2/periods/open route`

### Task G4 — `POST /api/v2/periods/close` (admin-only)

**Files**

- `src/routes/v2/periods.ts` — extend with the close handler.
- `tests/api/v2/periods-close.test.ts` — NEW with three failing tests.

**Steps**

- [ ] RED: write three tests. (1) Happy path — admin header present, member is operator; POST body `{ periodId: "p-2", reason: "manual_close" }`; assert 200 and `fakeRepository.closePeriod` was called with `("p-2", "manual_close", "op-user-openid")`. (2) Missing header — 401 `no_identity`. (3) Student header — 403 `not_admin`. All red.
- [ ] GREEN: register `app.post("/api/v2/periods/close", { onRequest: requireAdmin(repository) }, handler)`. Schema: `z.object({ periodId: z.string().min(1), reason: z.string().min(1) }).strict()`. Handler calls `deps.repository.closePeriod(body.periodId, body.reason, request.currentAdmin.sourceFeishuOpenId ?? request.currentAdmin.id)` and returns 200 `{ ok: true }`. Wrap in try/catch. Run tests — green.
- [ ] REFACTOR: DRY the admin-guard import: update `src/routes/v2/common.ts` to re-export a `adminGuard(repository)` helper that is just a thin alias over `requireAdmin(repository)` but scoped to the v2 surface. The re-export gives every admin route a single import line and keeps the intent obvious.
- [ ] REFACTOR: run `npm run build` and `npm test -- tests/api/v2/periods-close.test.ts` to confirm all three green and that the type augmentation for `request.currentAdmin` propagates.

**Commit:** `feat(v2-api): add POST /api/v2/periods/close admin route`

### Task G5 — `POST /api/v2/windows/open` (admin-only)

**Files**

- `src/routes/v2/windows.ts` — NEW.
- `src/app.ts` — register.
- `tests/api/v2/windows-open.test.ts` — NEW with five failing tests.

**Steps**

- [ ] RED: write five tests. (1) New window — `fakePeriodLifecycle.openWindow("W3")` returns `{ windowId: "w-W3", created: true }`; POST body `{ code: "W3" }` with operator header; assert 201 body `{ ok: true, windowId: "w-W3", created: true }`. (2) Idempotent — `openWindow("W2")` returns `{ windowId: "w-W2", created: false }`; assert 200 body `{ ok: true, windowId: "w-W2", created: false }`. (3) Regex reject — POST `{ code: "W6" }` → 400 `invalid_body`. (4) Regex accept FINAL — POST `{ code: "FINAL" }` returns 201 when fake returns `{ created: true }`. (5) Admin missing — POST `{ code: "W3" }` with no header → 401.
- [ ] GREEN: create `src/routes/v2/windows.ts`. Schema: `z.object({ code: z.string().regex(/^W[1-5]$|^FINAL$/) }).strict()`. Handler calls `deps.periodLifecycle.openWindow(body.code)`. Picks 201 if `result.created` is true, else 200. Wrap in try/catch. Register on `createApp` with `{ onRequest: requireAdmin(repository) }`. Run `npm test -- tests/api/v2/windows-open.test.ts` — green.
- [ ] REFACTOR: move the `WINDOW_CODE_REGEX` constant to `src/domain/v2/window-codes.ts` and import both here and from Phase B/C code that already validates the pattern. Avoids two copies of the regex drifting.
- [ ] REFACTOR: run `npm run build` to confirm nothing else broke, then re-run the G5 test file.

**Commit:** `feat(v2-api): add POST /api/v2/windows/open admin route`

### Task G6 — `POST /api/v2/graduation/close` (admin-only)

**Files**

- `src/routes/v2/graduation.ts` — NEW.
- `src/app.ts` — register.
- `tests/api/v2/graduation-close.test.ts` — NEW with three failing tests.

**Steps**

- [ ] RED: write three tests. (1) Happy path — operator header present; POST with empty body `{}`; `fakePeriodLifecycle.closeGraduation` returns `{ finalWindowId: "w-FINAL", settled: true }`; assert 200 `{ ok: true, finalWindowId: "w-FINAL", settled: true }`. (2) Already settled — `closeGraduation` throws `new WindowAlreadySettledError("window_already_settled", "FINAL already settled at 2026-04-03T10:00:00Z")`; assert 409 and body echoes the code and message. (3) Student header — 403.
- [ ] GREEN: create `src/routes/v2/graduation.ts`. Schema: `z.object({}).strict()`. Handler calls `deps.periodLifecycle.closeGraduation(request.currentAdmin)` (the trainer's identity is passed for audit logging). Wrap in try/catch. Register with `requireAdmin`. Run tests — green.
- [ ] REFACTOR: add a brief comment explaining that `/api/v2/graduation/close` exists because period 12 has no "next /开期" to trigger the FINAL window settlement (spec §8.3). The comment helps future readers understand why this endpoint is separate from `/api/v2/windows/open`.
- [ ] REFACTOR: run `npm run build` and the G6 test file.

**Commit:** `feat(v2-api): add POST /api/v2/graduation/close admin route`

### Task G7 — `GET /api/v2/board/ranking`

**Files**

- `src/routes/v2/board.ts` — NEW.
- `src/storage/sqlite-repository.ts` — extend with a `fetchRankingByCamp(campId: string)` method that joins `members`, `member_levels`, `member_dimension_scores`, and `window_snapshots` with the `isEligibleStudent` gate (`role_type='student' AND is_participant=1 AND is_excluded_from_board=0 AND hidden_from_board=0`).
- `tests/api/v2/board-ranking.test.ts` — NEW with four failing tests.
- `tests/storage/sqlite-repository-v2-ranking.test.ts` — NEW unit test for the repository method.

**Steps**

- [ ] RED: write the repository test first. Seed five members (four students, one operator), populate fake window snapshots and member level records, and assert that `repo.fetchRankingByCamp("c-1")` returns exactly four rows in the correct order: cumAq DESC, then name ASC. The operator row is excluded. Red because the method does not exist.
- [ ] RED: write four tests in `tests/api/v2/board-ranking.test.ts`. (1) Empty — POST no members, GET `/api/v2/board/ranking?campId=c-1`; assert 200 body `{ ok: true, campId: "c-1", rows: [] }`. (2) Single student — seed one student with snapshot data; assert 200 body has one row with all seven fields: `memberId, memberName, avatarUrl, currentLevel, cumulativeAq, latestWindowAq, dimensions: { K, H, C, S, G }, rank: 1`. (3) Five-member ordering — seed five students with known cum AQ values (mixed with ties on cum AQ that force a name-ASC tiebreak); assert `rows` is ordered cumAq DESC then name ASC and the `rank` field is `[1,2,3,4,5]` with ties reflected correctly (use "1224" ranking — two tied members both get rank 2, the next gets rank 4). (4) Operator excluded — seed a student + an operator with higher cum AQ; assert the operator does not appear in the response.
- [ ] GREEN: implement `fetchRankingByCamp` in `sqlite-repository.ts` using the JOIN described above. Return rows with the exact shape asserted. Hand-write the rank assignment in the repository (or a small helper `assignRanks(rows)`) so the API layer stays thin.
- [ ] GREEN: implement `src/routes/v2/board.ts` with a `registerV2BoardRoutes(app, deps)` function. Schema: querystring `z.object({ campId: z.string().min(1) }).strict()`. Handler: `const rows = await deps.repository.fetchRankingByCamp(query.campId); return reply.send({ ok: true, campId: query.campId, rows });` wrapped in the standard try/catch. Register both board routes (G7 + G8) from the same file. Run `npm test -- tests/api/v2/board-ranking.test.ts tests/storage/sqlite-repository-v2-ranking.test.ts` — all green.
- [ ] REFACTOR: move the `assignRanks` helper to `src/domain/v2/rank.ts` and write one unit test for it with a ties scenario. The helper must be pure and deterministic so both Phase F snapshots and Phase G API reuse it without drift. Run `npm run build`.

**Commit:** `feat(v2-api): add GET /api/v2/board/ranking with camp-scoped eligibility gate`

### Task G8 — `GET /api/v2/board/member/:id`

**Files**

- `src/routes/v2/board.ts` — extend.
- `src/storage/sqlite-repository.ts` — add `fetchMemberBoardDetail(memberId: string)` that fetches a member plus `promotion_records`, `member_dimension_scores` series (one per settled window) and `window_snapshots` series.
- `tests/api/v2/board-member-detail.test.ts` — NEW with three failing tests.
- `tests/storage/sqlite-repository-v2-member-detail.test.ts` — NEW.

**Steps**

- [ ] RED: write the repository test — seed one student with a promotion record and two settled window snapshots; assert `fetchMemberBoardDetail("m-1")` returns `{ memberId, memberName, avatarUrl, currentLevel, promotions: [...], dimensionSeries: [...], windowSnapshots: [...] }`. Also assert `fetchMemberBoardDetail("m-999")` returns `null`.
- [ ] RED: write three tests in `tests/api/v2/board-member-detail.test.ts`. (1) Existing student — GET `/api/v2/board/member/m-1` returns 200 with the full payload. (2) Unknown id — GET `/api/v2/board/member/m-ghost` returns 404 `{ ok: false, code: "not_found" }`. (3) Operator id — GET `/api/v2/board/member/op-1` (operator exists in DB) returns 404 because the repository method also gates on `isEligibleStudent`.
- [ ] GREEN: implement the repository method and the route. Schema: `z.object({ id: z.string().min(1) }).strict()` for the URL params. Handler returns the detail payload or `reply.code(404).send({ ok: false, code: "not_found" })`. Wrap in try/catch.
- [ ] REFACTOR: extract a `MemberBoardDetail` type into `src/domain/v2/types.ts` so sub-project 3 can import it directly when rendering the dashboard. Run `npm run build` and the G8 tests.

**Commit:** `feat(v2-api): add GET /api/v2/board/member/:id with 404 on non-eligible members`

### Task G9 — Admin Review Queue (`GET` list + `POST` decide)

**Files**

- `src/routes/v2/admin-review.ts` — NEW.
- `src/storage/sqlite-repository.ts` — extend with `listReviewRequiredEvents({ campId? })` and a lightweight `findReviewEvent(eventId)`.
- `tests/api/v2/admin-review-queue.test.ts` — NEW with six failing tests.

**Steps**

- [ ] RED: write six tests. (1) GET happy — three `review_required` events seeded; GET `/api/v2/admin/review-queue` with operator header returns 200 body `{ ok: true, rows: [...] }` with exactly three entries that include `eventId, memberId, memberName, itemCode, dimension, scoreDelta, createdAt, llmTaskId`. (2) GET empty — no events; returns 200 `{ ok: true, rows: [] }`. (3) GET with student header — 403. (4) POST approved — `fakeAggregator.applyDecision` accepts `("evt-1", { decision: "approved", note: "looks good" }, operator)`; POST body `{ decision: "approved", note: "looks good" }`; assert 200 `{ ok: true }` and the fake was called. (5) POST rejected — same shape with `decision: "rejected"`; asserts the fake was called with the reject decision. (6) POST invalid decision — body `{ decision: "banana", note: "x" }` → 400 `invalid_body`.
- [ ] GREEN: implement the repository method and both routes. Schemas: GET query `z.object({ campId: z.string().min(1).optional() }).strict()`; POST body `z.object({ decision: z.enum(["approved", "rejected"]), note: z.string().min(1) }).strict()`; POST params `z.object({ eventId: z.string().min(1) }).strict()`. Handlers wrapped in try/catch. Register with `requireAdmin`. Run tests — green.
- [ ] REFACTOR: verify that the POST handler forwards the `currentAdmin` identity to `aggregator.applyDecision` so the decision is audit-tagged correctly (see spec §5.5 layer 2). Add a dedicated assertion in test (4) that captures the third argument passed to `fakeAggregator.applyDecision.mock.calls[0][2]` and checks it equals the operator member object.
- [ ] REFACTOR: run `npm run build` and all G9 tests.

**Commit:** `feat(v2-api): add GET /api/v2/admin/review-queue and POST decide routes`

### Task G10 — Admin Member Management

**Files**

- `src/routes/v2/admin-members.ts` — NEW.
- `src/storage/sqlite-repository.ts` — extend with `listMembersForAdmin()` and `patchMemberForAdmin(id, patch)`.
- `tests/api/v2/admin-members.test.ts` — NEW with five failing tests.

**Steps**

- [ ] RED: write five tests. (1) GET happy — three members seeded (one student, one operator, one trainer); GET `/api/v2/admin/members` with operator header returns 200 with all three rows and fields `{ id, displayName, roleType, isParticipant, isExcludedFromBoard, hiddenFromBoard }`. (2) GET student header — 403. (3) PATCH happy — PATCH `/api/v2/admin/members/m-1` with body `{ roleType: "operator", hiddenFromBoard: true }`; assert 200 `{ ok: true, member: {...updated} }` and the repository was called. (4) PATCH partial — body `{ displayName: "Alice v2" }` only; assert the other fields are not touched. (5) PATCH unknown field — body `{ roleType: "superadmin" }` → 400 `invalid_body` (enum reject), and body `{ unknownKey: true }` → 400 `invalid_body` (.strict).
- [ ] GREEN: implement `listMembersForAdmin()` (SELECT with no filter — admin sees everything) and `patchMemberForAdmin(id, patch)` that issues a dynamic UPDATE based on the set keys. Route schemas: PATCH body `z.object({ roleType: z.enum(["student","operator","trainer","observer"]).optional(), isParticipant: z.boolean().optional(), isExcludedFromBoard: z.boolean().optional(), hiddenFromBoard: z.boolean().optional(), displayName: z.string().min(1).optional() }).strict()` with `.refine((data) => Object.keys(data).length > 0, { message: "empty_patch" })`. Handlers wrapped with `requireAdmin`. Run tests — green.
- [ ] REFACTOR: audit the PATCH path for SQL injection risk. The dynamic UPDATE must use parameter binding only, not string concatenation. Write a separate test `patchMemberForAdmin.test.ts` in `tests/storage/` with a malicious `displayName: "'; DROP TABLE members; --"` asserting the table is intact after the PATCH.
- [ ] REFACTOR: run `npm run build` and all G10 tests.

**Commit:** `feat(v2-api): add GET /api/v2/admin/members and PATCH /:id admin routes`

### Task G11 — `GET /api/v2/llm/worker/status`

**Files**

- `src/routes/v2/llm-status.ts` — NEW.
- `src/app.ts` — register.
- `tests/api/v2/llm-worker-status.test.ts` — NEW with two failing tests.

**Steps**

- [ ] RED: write two tests. (1) Running — `fakeLlmWorker.getStatus()` returns `{ running: true, concurrency: 3, activeTasks: 1, queueDepth: 4, lastHeartbeatAt: "2026-04-10T10:00:00Z" }`; GET `/api/v2/llm/worker/status` returns 200 body `{ ok: true, status: {...} }`. (2) Stopped — `getStatus` returns `{ running: false, concurrency: 3, activeTasks: 0, queueDepth: 0, lastHeartbeatAt: null }`; returns 200 with echoed status.
- [ ] GREEN: create `src/routes/v2/llm-status.ts` with `registerV2LlmStatusRoute(app, deps)`. Handler calls `deps.llmWorker.getStatus()` and returns it directly. Wrap in try/catch. Register from `createApp`. Run tests — green.
- [ ] REFACTOR: add a JSDoc block explaining that the status shape mirrors the interface defined in the Phase E plan and must stay in sync with `LlmScoringWorker.getStatus()`. Link the comment to the relevant Phase E task by filename.
- [ ] REFACTOR: run `npm run build` and all G11 tests. Then run the full `npm test -- tests/api/v2/` folder to confirm Phase G is holistically green before moving on.

**Commit:** `feat(v2-api): add GET /api/v2/llm/worker/status monitoring route`

### Phase G Exit Checkpoint

Before moving on to Phase H, all of the following must be true:

- [ ] `npm test -- tests/api/v2/` is green with zero skipped tests.
- [ ] `npm run build` compiles the full tree without TypeScript errors.
- [ ] `src/app.ts` stays under 800 lines (route registration is delegated to modules under `src/routes/v2/*`).
- [ ] Every admin route rejects missing `x-feishu-open-id` with 401 and non-admin roles with 403.
- [ ] Every public route uses Zod strict parsing and returns 400 on unknown keys.
- [ ] `mapDomainErrorToHttp` is the single catch-block helper used by all v2 routes.
- [ ] No route contains `console.log` or a hard-coded camp id.
- [ ] `git status` shows no uncommitted test fixtures or scratch files.
- [ ] The eleven Task G commits are in place, each on its own line of `git log --oneline`.

---

## Phase H — Startup, Seed, and End-to-End Bootstrap (4 tasks)

Phase H makes the new scoring-v2 surface usable in development and production. It extends `.env.example` with the LLM worker knobs from the spec, teaches `server.ts` to spin up the LLM worker alongside Fastify with clean shutdown, upgrades the bootstrap seed script so it backfills W1/W2 and promotes bootstrap operators, and closes the loop with a single end-to-end test that exercises the whole v2 pipeline through `fastify.inject`.

### Task H1 — Extend `.env.example`

**Files**

- `.env.example` — extend with the LLM and bootstrap operator keys.
- `src/config/load-env.ts` — no changes to behaviour, but document the new keys in the JSDoc at the top.
- `tests/config/env-example-shape.test.ts` — NEW. Parses `.env.example` and asserts the six new keys are present and commented.

**Steps**

- [ ] RED: write `tests/config/env-example-shape.test.ts` that reads `.env.example` via `fs.readFileSync`, splits into lines, and asserts each of the six keys is present on its own line and the line immediately above it is a comment. Keys: `LLM_CONCURRENCY`, `LLM_RATE_LIMIT_PER_SEC`, `LLM_POLL_INTERVAL_MS`, `LLM_TASK_TIMEOUT_MS`, `LLM_MAX_ATTEMPTS`, `BOOTSTRAP_OPERATOR_OPEN_IDS`. Red.
- [ ] GREEN: edit `.env.example`. Preserve every existing key and the ordering of Step 5 (which must still be present — the coding-style rule demands we do not delete an ordered bootstrap step). Below the existing Step 5 block, add the six new keys with an explanatory comment above each. Example format: `# Maximum concurrent LLM scoring requests (default 3). Higher values trade latency for cost.` followed by `LLM_CONCURRENCY=3`. Do the same for rate limit per second (default 5), poll interval in ms (default 1500), task timeout in ms (default 30000), max attempts (default 3), and the bootstrap operator CSV (default empty). Run the test — green.
- [ ] REFACTOR: reorder the new block so it is grouped under a clear `# --- LLM Worker (sub-project 1 Phase E) ---` section header followed by a `# --- Bootstrap Operators (spec §5.9) ---` header. Re-run the test to confirm the shape-checking tolerates the header lines.
- [ ] REFACTOR: run `npm run build` (no effect expected) and make sure CI still parses the file correctly by running `node -e "require('dotenv').config({ path: '.env.example' })"`. Fix any syntax errors the dotenv parser complains about.

**Commit:** `chore(v2): document LLM worker and bootstrap operator env keys`

### Task H2 — Extend `src/server.ts` for LLM Worker Lifecycle

**Files**

- `src/server.ts` — extend.
- `src/services/v2/llm-scoring-client-factory.ts` — NEW. Tiny factory that picks `FakeLlmScoringClient` in dev / test and `OpenAICompatibleLlmScoringClient` when `LLM_ENABLED=true` and a key is present.
- `tests/server/llm-lifecycle.test.ts` — NEW with two failing tests.

**Steps**

- [ ] RED: write two tests in `tests/server/llm-lifecycle.test.ts`. The first test boots the server through the exported `startLlmWorker(app, deps)` helper (which the test must import) and asserts `deps.llmWorker.start` was called exactly once. The second test calls `stopLlmWorker(app, deps)` and asserts `deps.llmWorker.stop` was called once, in order, and that the promise resolves only after both `worker.stop()` and `app.close()` have completed. Use a vitest `vi.fn()` for each so call-order assertions are deterministic. Red because the helpers do not exist.
- [ ] GREEN: create `src/services/v2/llm-scoring-client-factory.ts` exporting `function buildLlmScoringClient(env: NodeJS.ProcessEnv): LlmScoringClient`. Inside: if `env.LLM_ENABLED !== "true"` or no API key is present, return `new FakeLlmScoringClient()`. Otherwise call `readLlmProviderConfig(env)` and return `new OpenAICompatibleLlmScoringClient(providerConfig)`. Export alongside the existing factory the type guards Phase E defined. Write a short comment explaining that we never auto-enable the real client in tests.
- [ ] GREEN: update `src/server.ts`. Export `async function startLlmWorker(app, deps)` that calls `deps.llmWorker.start()` and registers a SIGTERM/SIGINT handler that calls `stopLlmWorker(app, deps)` exactly once (guarded with a `let stopping = false` latch). Export `async function stopLlmWorker(app, deps)` that awaits `deps.llmWorker.stop()` then `app.close()`. Inside the default bootstrap block, construct the worker: `const llmClient = buildLlmScoringClient(process.env); const llmWorker = new LlmScoringWorker({ repository, llmClient, concurrency: Number(process.env.LLM_CONCURRENCY ?? 3), ratePerSec: Number(process.env.LLM_RATE_LIMIT_PER_SEC ?? 5), pollIntervalMs: Number(process.env.LLM_POLL_INTERVAL_MS ?? 1500), taskTimeoutMs: Number(process.env.LLM_TASK_TIMEOUT_MS ?? 30000), maxAttempts: Number(process.env.LLM_MAX_ATTEMPTS ?? 3) });`. Call `await startLlmWorker(app, { llmWorker })` after `app.ready()`. Register signal handlers once. Run the test — green.
- [ ] REFACTOR: verify the signal-handler guard is idempotent by sending SIGTERM twice in a tight loop from within the test. Add a third assertion that `deps.llmWorker.stop` was still called exactly once. Implement the guard if it was missing.
- [ ] REFACTOR: run `npm run build` and `npm test -- tests/server/llm-lifecycle.test.ts`. Verify `src/server.ts` stays under 200 lines.

**Commit:** `chore(v2): boot LLM scoring worker with Fastify lifecycle and signal handling`

### Task H3 — Refactor `ensure-bootstrap-data.ts` for Window Shells and Operator Bootstrap

**Files**

- `src/scripts/ensure-bootstrap-data.ts` — refactor and extend.
- `tests/scripts/ensure-bootstrap-data-v2.test.ts` — NEW with four failing tests.

**Steps**

- [ ] RED: write four tests in `tests/scripts/ensure-bootstrap-data-v2.test.ts`. Each test boots a `:memory:` `SqliteRepository`, optionally pre-seeds data, and calls the new signature `runEnsureBootstrap({ repository, env })`. (1) Fresh DB — empty SQLite; after running, assert `defaultCampId` is set, W1 and W2 rows exist with `settlement_state='open'`, and no bootstrap operators were promoted because the env var is empty. (2) Existing DB — already seeded; assert the function is idempotent (no duplicate W1, no duplicate camp). (3) Windows already present — pre-insert W1 and W2; assert no duplicate and no error. (4) Bootstrap operators — seed two students with `source_feishu_open_id = "ou_a"` and `"ou_b"`; pass env `{ BOOTSTRAP_OPERATOR_OPEN_IDS: "ou_a,ou_b" }`; assert both members were promoted to `role_type="operator"` and `hidden_from_board=1`.
- [ ] GREEN: refactor `src/scripts/ensure-bootstrap-data.ts`. Export `async function runEnsureBootstrap(options: { repository?: SqliteRepository; env?: NodeJS.ProcessEnv; databaseUrl?: string }): Promise<{ mutated: boolean; campId: string | null }>`. The function uses the injected repository when provided, otherwise constructs one from `options.databaseUrl ?? options.env?.DATABASE_URL ?? "./data/app.db"`. It reads existing logic for legacy seeding, then adds a new block: after the camp is ensured, fetch the `v2_windows` rows for that camp; insert W1 if missing; insert W2 if missing. Finally, if `options.env?.BOOTSTRAP_OPERATOR_OPEN_IDS` is non-empty, split on commas, trim, filter out empty strings, look up each open id via `repository.findMemberByFeishuOpenId`, and if the member's `roleType !== 'operator'`, call `repository.patchMemberForAdmin(member.id, { roleType: "operator", hiddenFromBoard: true })`. Return `{ mutated, campId }`.
- [ ] GREEN: wire a top-level `await runEnsureBootstrap({ env: process.env })` call at the bottom of the file so `npm run seed:ensure` still works. Run the tests — green.
- [ ] REFACTOR: factor the window-shell logic into a private helper `ensureWindowShell(repository, campId, code)` inside the same file and call it twice. The helper must be idempotent and raise no error if the row already exists.
- [ ] REFACTOR: run `npm run build` and the H3 tests.

**Commit:** `chore(v2): refactor ensure-bootstrap to seed W1/W2 shells and apply bootstrap operators`

### Task H4 — End-to-End Integration Test

**Files**

- `tests/api/v2/end-to-end.test.ts` — NEW. This is the crown-jewel test that exercises the entire v2 pipeline.

**Steps**

- [ ] RED: write the full E2E test. Import `createApp`, `FakeLlmScoringClient`, `SqliteRepository`, and the domain types. Use `beforeAll` to construct a `:memory:` repository, call `runEnsureBootstrap({ repository, env: { BOOTSTRAP_OPERATOR_OPEN_IDS: "" } })`, then seed five students (`m-1` through `m-5`), construct real implementations of every service (ingestor, aggregator, window settler, period lifecycle, reaction tracker, member sync stub, LLM worker with `FakeLlmScoringClient` that always returns pass), and finally call `await createApp({ databaseUrl: ":memory:", ingestor, aggregator, periodLifecycle, windowSettler, llmWorker, reactionTracker, memberSync })` with the real instances. Start the LLM worker inline.
- [ ] RED: write the assertions in a single `it("runs the full period → window → promotion pipeline", async () => {...})` block. Steps and assertions (the test contains roughly twenty assertions in total): (1) `app.inject POST /api/v2/windows/open` with `{ code: "W1" }` and an operator header → 201. (2) `POST /api/v2/periods/open` with `{ number: 1 }` → 201 and the returned `periodId` starts with `period-` and is tagged ice-breaker in the DB. (3) Attempt to `POST /api/v2/events` for member `m-1` item `K1` during the ice breaker → expect 409 `ice_breaker_no_scoring`. (4) `POST /api/v2/periods/open` with `{ number: 2 }` → 201 with `assignedWindowId` equal to the W1 window id. (5) Ingest ten legitimate events for five members across K1/H1/C1/S1/G1 → each returns 202. (6) `POST /api/v2/periods/open` with `{ number: 3 }` → 201. (7) Ingest a K3 event for `m-1` and poll the LLM worker until the task status is `approved` (use `await llmWorker.drainOnce()` to make the test deterministic; the fake client is auto-pass). (8) `POST /api/v2/windows/open` with `{ code: "W3" }` → 201, and `POST /api/v2/periods/open` with `{ number: 4 }` → 201 and `shouldSettleWindowId` equals the W1 id. (9) Trigger `windowSettler.settleWindow(shouldSettleWindowId)` (or assert it was called from the lifecycle). (10) Assert `member_dimension_scores` rows exist for every eligible student for W1. (11) Assert `window_snapshots` rows exist for every eligible student for W1 with the correct rank order. (12) Assert `member_levels` shows at least one student promoted from L0 to L1 via `promotion_records`. (13) `GET /api/v2/board/ranking?campId=c-1` returns 200 with exactly five rows (the operator is excluded). (14) `GET /api/v2/board/member/m-1` returns 200 with `currentLevel` ≥ 1. (15) `GET /api/v2/admin/review-queue` with the operator header returns 200 with zero rows because the fake LLM client auto-passes everything. (16) `GET /api/v2/llm/worker/status` returns 200 with `running: true`. (17) Assert `GET /api/v2/board/member/m-ghost` returns 404. (18) Assert a repeat ingest with the same `sourceRef` for `m-1 K1` returns 400 `duplicate`. (19) Assert `POST /api/v2/events` with a student header and no `currentAdmin` still works (the events route is not admin-gated). (20) Final assertion: call `await stopLlmWorker(app, { llmWorker })` and confirm the worker stopped cleanly.
- [ ] GREEN: implement any missing glue needed for the assertions to pass. Likely missing: the `drainOnce()` testing hook on `LlmScoringWorker` (if not already provided by Phase E), a small fixture helper for seeding five students with open ids, and a `makeOperatorHeader()` helper that returns `{ "x-feishu-open-id": "ou-operator" }` for tests. These helpers live in `tests/api/v2/helpers.ts` so they can be reused by future v2 tests. Run `npm test -- tests/api/v2/end-to-end.test.ts` — green.
- [ ] REFACTOR: split the assertions into logically named helper functions (`setupWindowsAndPeriods`, `ingestLegitimateEvents`, `assertRankingShape`, `assertLevelPromotion`) so the test reads linearly. Keep the top-level `it` block under 150 lines.
- [ ] REFACTOR: run `npm run build` and the full `npm test -- tests/api/v2/` folder once more to ensure the new E2E test does not flake with other suites.

**Commit:** `test(v2): add end-to-end integration test covering the full period → settlement pipeline`

### Phase H Exit Checkpoint

- [ ] `.env.example` contains the six new keys and still boots with `dotenv`.
- [ ] `src/server.ts` starts the LLM worker after `app.ready()` and stops it cleanly on SIGTERM/SIGINT.
- [ ] `npm run seed:ensure` works and is idempotent on a fresh DB.
- [ ] `tests/api/v2/end-to-end.test.ts` passes and exercises every v2 route, domain service, and repository method touched by Phases A–G.
- [ ] `npm run build` is green.
- [ ] `npm test` is green across the full suite (including legacy tests that still exist before Phase I runs).

---

## Phase I — Legacy Cleanup and Phase 1 Sign-off (2 tasks)

Phase I is the smallest and most surgical phase. Task I1 removes the legacy v1 scoring surface that is now strictly dead code — but it does so carefully, unhooking imports first and running the build between deletions so no dangling reference reaches `git rm`. Task I2 adds a coverage script if missing, runs the final gate, and records that sub-project 1 Phase 1 is complete.

### Task I1 — Drop Legacy v1 Scoring Surface

**Files (edit first)**

- `src/app.ts` — remove all imports, route registrations, and helper functions that depend on the legacy files listed in spec §6.2.

**Files (delete after app.ts is clean)**

- `src/domain/scoring.ts`
- `src/domain/warnings.ts`
- `src/domain/ranking.ts`
- `src/domain/session-windows.ts`
- `src/domain/submission-aggregation.ts`
- `src/domain/tag-parser.ts`
- `src/services/llm/glm-file-parser.ts`
- `src/services/llm/llm-evaluator.ts`
- `src/services/documents/extract-text.ts`
- `src/services/documents/file-format.ts`
- `src/services/scoring/evaluate-window.ts`
- `src/services/feishu/base-sync.ts`
- `web/src/**` (entire frontend surface, including `web/public/**` assets that are tied to it; keep `web/index.html` only if it is already a static placeholder)
- Corresponding test files listed below.

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

**Steps**

- [ ] Unhook imports in `src/app.ts` first. Use the Edit tool to remove every import line referencing `LocalDocumentTextExtractor`, `DocumentTextExtractor`, `FeishuBaseSyncService`, `NoopBaseSyncService`, `evaluateMessageWindow`, the entire `scoring` / `warnings` / `ranking` / `session-windows` / `submission-aggregation` / `tag-parser` modules, and any helper function that depends on them. Then remove the four legacy route blocks: `GET /api/dashboard/ranking`, `POST /api/submissions/:id/review`, `GET /api/members` (the v1 shape), and `GET /api/operator/warnings`. Also remove the `documentTextExtractor`, `baseSync`, `memberPatchSchema`, `reviewSchema`, and `announcementSchema` declarations if they are now unreferenced. Leave the Feishu messenger / WS runtime / normalize-message / client code untouched per spec §6.2 "保留复用". Run `npm run build`. Fix every remaining type error by deleting the offending reference — never restore a deleted file. The goal is a clean build before `git rm` touches disk.
- [ ] Run `git rm` on every file in the deletion list. Do them in this order so intermediate builds can still type-check: (1) delete the web frontend first (`git rm -r web/src`), (2) delete the domain files, (3) delete the service files, (4) delete the tests. After each deletion, run `npm run build` and fix any residual import leaks via `Edit` (for example, barrel `src/index.ts` files that re-export deleted modules must be trimmed).
- [ ] Run `npm test` once. Any failing test that depends on a deleted module must be deleted as well — use the Edit tool to remove the file references, then `git rm` the file. Do not try to "fix" the test by stubbing the deleted module. The rule from spec §6.2 is absolute: these modules are gone, not replaced.
- [ ] Run `npm run build && npm test` one more time. Both must exit green. If a legacy test file is still referenced by a fixture or snapshot, delete it too.
- [ ] Final sanity sweep: `git status` should show only deletions and the `src/app.ts` edit. No stray untracked files.

**Commit:** `chore: drop legacy v1 scoring surface`

### Task I2 — Mark Phase 1 Complete

**Files**

- `package.json` — add `test:coverage` script if missing. The script shape is `"test:coverage": "vitest run --coverage"`. Preserve the existing `test`, `build`, and `seed:ensure` scripts exactly. Do not touch dependencies.
- `README.md` — append a short note.
- `vitest.config.ts` — if coverage provider is not configured, add the `c8` (or `v8`) provider with the thresholds from spec §6.5: `lines ≥ 85`, `branches ≥ 90` for `src/domain/v2/**` and `lines ≥ 80` for `src/services/v2/**`.

**Steps**

- [ ] Inspect `package.json` scripts. If `test:coverage` is missing, add it with the shape above. If a coverage provider is missing from `vitest.config.ts`, add it. Run `npm install` only if the coverage provider is a new dependency (it usually is not — `@vitest/coverage-v8` is typically already present). If installation is required, include it in the commit via `package.json` and `package-lock.json`.
- [ ] Run `npm test`. Must be green.
- [ ] Run `npm run build`. Must be green.
- [ ] Run `npm run test:coverage`. Must be green and must report ≥ 85% lines for the v2 domain. If it fails to meet the threshold, write the missing tests before continuing — do not lower the threshold.
- [ ] Append a short note at the bottom of `README.md`: three or four lines under a new heading `## Scoring v2 — Phase 1 Complete (2026-04)` that summarise the delivered surface: "Sub-project 1 Phase 1 is complete: domain model, scoring aggregator, window settler, LLM worker, `/api/v2/*` routes, end-to-end tests, and legacy cleanup. Sub-projects 2 (Feishu cards) and 3 (dashboard UI) consume this layer." Do not delete or rewrite any existing README content.

**Commit:** `chore(v2): mark phase 1 complete`

### Phase I Exit Checkpoint

- [ ] `git log --oneline` shows the two Phase I commits (`chore: drop legacy v1 scoring surface`, `chore(v2): mark phase 1 complete`) on top of the Phase G/H commits.
- [ ] `npm test && npm run build && npm run test:coverage` is green.
- [ ] `src/app.ts` no longer imports any file listed under "完全删除" in spec §6.2.
- [ ] `web/src/` is removed from the tree.
- [ ] README.md has the Phase 1 complete note.
- [ ] The git working tree is clean.

---

## Self-Review Checklist

Before declaring Phases G / H / I done and handing off to sub-project 2, verify each of the following. This list is additive to the per-phase exit checkpoints above.

- [ ] Every v2 route file under `src/routes/v2/` is under 200 lines and has a single responsibility.
- [ ] Every v2 route file imports `parseStrict` and `mapDomainErrorToHttp` from `src/routes/v2/common.ts` rather than re-implementing either helper.
- [ ] No v2 route contains a `console.log`, `console.error`, or debug print statement. Logging goes through `request.log` only.
- [ ] All admin routes (`/api/v2/admin/*`, `/api/v2/periods/close`, `/api/v2/windows/open`, `/api/v2/graduation/close`) register `onRequest: requireAdmin(repository)`.
- [ ] Every body schema uses `z.object({...}).strict()` so a typo field returns 400 rather than silently passing through.
- [ ] The seven dependency-injection points on `createApp` are optional and default to real implementations — tests can swap fakes in, production wires real services, and the wiring code is a single `buildV2Runtime` helper.
- [ ] `mapDomainErrorToHttp` covers every `DomainError` subclass listed in spec §6.3 and maps them per §6.4. A future developer adding a new subclass will see a `TypeScript never` reminder at the end of the switch.
- [ ] `requireAdmin` reads the header exactly once and attaches the member to `request.currentAdmin` without any additional DB roundtrip per route.
- [ ] `src/server.ts` signal handlers are idempotent and call `llmWorker.stop` before `app.close`.
- [ ] `runEnsureBootstrap` is idempotent — running it twice in a row on the same DB produces identical state.
- [ ] The end-to-end test in `tests/api/v2/end-to-end.test.ts` exercises: ice-breaker rejection, event ingest, LLM worker draining, window settlement, promotion, ranking, admin review queue, LLM worker status, 404 on unknown members, duplicate rejection, and clean shutdown.
- [ ] Coverage thresholds in `vitest.config.ts` match spec §6.5 — do not weaken them.
- [ ] The `chore: drop legacy v1 scoring surface` commit is a single, atomic, build-green commit. `git show --stat` on that commit shows only deletions and the minimal `src/app.ts` edit.
- [ ] The Phase 1 complete note in README is under five lines and does not delete existing content.
- [ ] `git status` is clean after Phase I.

---

## Execution Handoff

This plan supports two execution strategies. Pick one before starting.

### Option A — Subagent-Driven Execution (recommended for Phase G)

Phase G is eleven mostly-independent route tasks that share a small amount of common infrastructure (Task G1). The cleanest path is:

1. Execute Task G1 inline (or with a single subagent) because every later task depends on the `requireAdmin` middleware, the `mapDomainErrorToHttp` helper, and the extended `createApp` options.
2. After G1 is committed, dispatch Tasks G2 through G11 in parallel via the `superpowers:dispatching-parallel-agents` skill. Each subagent gets a single task, its file list, the five checkbox steps, and the commit message. Give each subagent explicit instructions to rebase on top of the latest Phase G head before committing, so the history is linear.
3. Execute Phase H sequentially in a single session. H1 → H2 → H3 → H4 each depend on the previous commit because they share `src/server.ts`, `src/scripts/ensure-bootstrap-data.ts`, and the runtime wiring.
4. Execute Phase I inline. Task I1 requires a careful, iterative loop of (edit app.ts → build → rm files → build → rm tests → test). This is not subagent-friendly; it must be done in a single session with continuous read-eval-print on `npm run build` and `npm test` outputs.
5. After I2 commits, run the `superpowers:finishing-a-development-branch` skill to wrap up, draft a PR, and hand the branch to the reviewer.

Parallelism ceiling: ten subagents in Phase G step 2 — one per route task G2–G11 — with a strict gate that no subagent may merge until its `npm test -- tests/api/v2/<its-file>.test.ts` is green locally.

### Option B — Fully Inline Execution (recommended for Phase H and I, and for small teams)

If you prefer a single developer, single session, single context window strategy, execute every task in order: G1 → G2 → ... → G11 → H1 → H2 → H3 → H4 → I1 → I2. Commit after each task. Run `npm test -- tests/api/v2/` after every Phase G task and `npm test && npm run build` after every Phase H task to catch regressions early.

This strategy is slower but simpler — no rebasing, no merge conflicts, no subagent coordination overhead. Use it when the route shapes or the dependency wiring are not fully settled and you expect to iterate mid-phase.

### Definition of Done for Sub-project 1 Phase 1

Sub-project 1 Phase 1 is done when:

1. All seventeen Phase G+H+I tasks are committed.
2. `npm test && npm run build && npm run test:coverage` is green on the head commit.
3. The branch is rebased onto `main` cleanly.
4. The `chore: drop legacy v1 scoring surface` commit is a single atomic commit.
5. README.md contains the Phase 1 complete note.
6. No legacy file from spec §6.2 "完全删除" is still present in the tree.
7. The PR description lists every new route, the removed legacy files, and a link to this plan.
