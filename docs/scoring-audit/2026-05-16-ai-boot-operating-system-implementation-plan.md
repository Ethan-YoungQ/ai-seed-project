# AI Boot Operating System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild AI Boot into a Feishu group operating system that preserves historical scores while making all new scoring, notifications, review, and leaderboard updates auditable, low-noise, and aligned with real AI learning behavior.

**Architecture:** Add a v3 AI Boot layer beside the existing v2 scoring stack: event ledger, evidence extraction, one authoritative scoring decision engine, v3 scorebook, notification orchestrator, operator review APIs, and evaluation/shadow replay. Keep v2 tables read-only for historical preservation and migration, then cut over Feishu auto-capture to v3 by feature flag.

**Tech Stack:** TypeScript, Fastify, better-sqlite3, Vitest, Feishu OpenAPI client, existing OpenAI-compatible Z.AI client, zod for schema validation.

---

## Scope Check

This is a multi-subsystem refactor. Implement it as an ordered master plan, not as one patch. Each task is independently testable and should be committed separately. Do not deploy v3 live scoring until Tasks 1-12 are complete and Task 13 shadow metrics are reviewed.

## Source-Of-Truth Rule

The server currently runs hotfixed `dist` that differs from the TypeScript source. The first implementation task must make source builds reproduce the intended safe runtime behavior. After Task 1, production deployment must come only from TypeScript source and `npm run build`.

## File Map

Create:

- `src/domain/v3/ai-boot-types.ts` — stable public types for events, evidence, decisions, score events, notifications, modes.
- `src/domain/v3/scoring-rules.ts` — deterministic category/range rules and caps.
- `src/domain/v3/scoring-decision.ts` — schema validation, score clamping, no-score/review helpers.
- `src/domain/v3/scorebook.ts` — pure functions for legacy + v3 score aggregation.
- `src/services/feishu/ai-boot/config.ts` — runtime mode and feature-flag parsing.
- `src/services/feishu/ai-boot/content-extractor.ts` — text/image/file evidence extraction from `NormalizedFeishuMessage`.
- `src/services/feishu/ai-boot/llm-decision-engine.ts` — prompt construction and LLM JSON decision parsing.
- `src/services/feishu/ai-boot/deterministic-guards.ts` — pure guards for trivial chat, daily participation, caps, sender eligibility.
- `src/services/feishu/ai-boot/notification-orchestrator.ts` — group praise/digest decision and rate limits.
- `src/services/feishu/ai-boot/orchestrator.ts` — top-level v3 message pipeline.
- `src/routes/v3/ai-boot-admin.ts` — operator review/correction APIs for v3.
- `src/scripts/ai-boot-freeze-legacy-scores.ts` — one-time snapshot of existing scores.
- `src/scripts/ai-boot-shadow-replay.ts` — replay recent ledger rows through v3 without changing live scores.
- `src/scripts/ai-boot-cutover-check.ts` — production readiness check before `v3_live`.
- `tests/domain/v3/*.test.ts`
- `tests/services/feishu/ai-boot/*.test.ts`
- `tests/routes/v3/ai-boot-admin.test.ts`
- `tests/scripts/ai-boot-*.test.ts`

Modify:

- `src/storage/sqlite-repository.ts` — add v3 tables and repository methods.
- `src/app.ts` — wire v3 config, routes, and message orchestrator.
- `src/services/feishu/message-commands.ts` — delegate auto-capture to v3 when enabled; keep legacy commands and @Bot path.
- `src/routes/v2/board.ts` — aggregate frozen legacy score plus v3 approved score for leaderboard.
- `src/services/feishu/chat-bot/persona.ts` — remove prompt-biased praise examples and align tone.
- `package.json` — add scripts for freeze, shadow replay, cutover check.

---

## Task 1: Runtime Mode And Source-Of-Truth Guard

**Files:**

- Create: `src/services/feishu/ai-boot/config.ts`
- Test: `tests/services/feishu/ai-boot/config.test.ts`
- Modify: `src/app.ts`

- [ ] **Step 1: Write config tests**

```ts
// tests/services/feishu/ai-boot/config.test.ts
import { describe, expect, it } from "vitest";
import { readAiBootConfig } from "../../../../src/services/feishu/ai-boot/config";

describe("readAiBootConfig", () => {
  it("defaults to legacy mode so source deploys do not unexpectedly enable v3", () => {
    expect(readAiBootConfig({}).engineMode).toBe("legacy");
  });

  it("accepts v3_shadow and v3_live explicitly", () => {
    expect(readAiBootConfig({ AI_BOOT_ENGINE_MODE: "v3_shadow" }).engineMode).toBe("v3_shadow");
    expect(readAiBootConfig({ AI_BOOT_ENGINE_MODE: "v3_live" }).engineMode).toBe("v3_live");
  });

  it("falls back to legacy for invalid values", () => {
    expect(readAiBootConfig({ AI_BOOT_ENGINE_MODE: "semantic" }).engineMode).toBe("legacy");
  });
});
```

- [ ] **Step 2: Run test and verify it fails**

Run: `npx vitest run tests/services/feishu/ai-boot/config.test.ts`

Expected: FAIL because `config.ts` does not exist.

- [ ] **Step 3: Implement config**

```ts
// src/services/feishu/ai-boot/config.ts
export type AiBootEngineMode = "legacy" | "v3_shadow" | "v3_live";

export interface AiBootConfig {
  engineMode: AiBootEngineMode;
  allowGroupPraise: boolean;
  allowDailyDigest: boolean;
}

function readMode(value: string | undefined): AiBootEngineMode {
  if (value === "v3_shadow" || value === "v3_live") return value;
  return "legacy";
}

function readBoolean(value: string | undefined, fallback: boolean): boolean {
  if (!value) return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

export function readAiBootConfig(env: Partial<NodeJS.ProcessEnv> = process.env): AiBootConfig {
  return {
    engineMode: readMode(env.AI_BOOT_ENGINE_MODE),
    allowGroupPraise: readBoolean(env.AI_BOOT_ALLOW_GROUP_PRAISE, false),
    allowDailyDigest: readBoolean(env.AI_BOOT_ALLOW_DAILY_DIGEST, false),
  };
}
```

- [ ] **Step 4: Run test and verify it passes**

Run: `npx vitest run tests/services/feishu/ai-boot/config.test.ts`

Expected: PASS.

- [ ] **Step 5: Wire config read in `src/app.ts`**

Add import:

```ts
import { readAiBootConfig } from "./services/feishu/ai-boot/config.js";
```

Inside `createApp`, after `const cardRepoDeps = cardRepoAdapter(repository);`, add:

```ts
  const aiBootConfig = readAiBootConfig(process.env);
```

In `/api/feishu/status`, add:

```ts
      aiBoot: {
        engineMode: aiBootConfig.engineMode,
        allowGroupPraise: aiBootConfig.allowGroupPraise,
        allowDailyDigest: aiBootConfig.allowDailyDigest,
      },
```

- [ ] **Step 6: Run build**

Run: `npm run build`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/services/feishu/ai-boot/config.ts tests/services/feishu/ai-boot/config.test.ts src/app.ts
git commit -m "feat: add ai boot runtime mode config"
```

---

## Task 2: v3 Schema And Repository Methods

**Files:**

- Create: `src/domain/v3/ai-boot-types.ts`
- Modify: `src/storage/sqlite-repository.ts`
- Test: `tests/storage/v3/sqlite-ai-boot-repository.test.ts`

- [ ] **Step 1: Define v3 domain types**

```ts
// src/domain/v3/ai-boot-types.ts
export type AiBootEventType = "text" | "image" | "file" | "reaction" | "card" | "mention";
export type AiBootEventStatus = "received" | "extracted" | "decided" | "ignored" | "failed";
export type AiBootScoreCategory =
  | "daily_participation"
  | "ai_artifact"
  | "ai_practice_reflection"
  | "prompt_or_method"
  | "resource_recommendation"
  | "peer_help"
  | "formal_task"
  | "operator_adjustment";
export type AiBootDecisionStatus = "approved" | "review_required" | "rejected" | "no_score" | "shadow";
export type AiBootNotifyPolicy = "silent" | "personal_reply" | "group_praise" | "daily_digest";
export type AiBootConfidence = "high" | "medium" | "low";

export interface AiBootEventRecord {
  id: string;
  campId: string;
  chatId: string;
  memberId: string;
  sourceMessageId: string;
  eventType: AiBootEventType;
  rawText: string;
  sanitizedText: string;
  attachmentJson: string;
  evidenceJson: string;
  contentHash: string;
  status: AiBootEventStatus;
  engineVersion: string;
  rulesetVersion: string;
  createdAt: string;
}

export interface AiBootScoreEventRecord {
  id: string;
  eventId: string;
  campId: string;
  memberId: string;
  category: AiBootScoreCategory;
  scoreDelta: number;
  confidence: AiBootConfidence;
  status: AiBootDecisionStatus;
  notifyPolicy: AiBootNotifyPolicy;
  reason: string;
  evidence: string;
  badgesJson: string;
  modelProvider: string;
  modelName: string;
  promptVersion: string;
  reviewedByOpId: string | null;
  reviewNote: string | null;
  decidedAt: string;
}
```

- [ ] **Step 2: Write repository tests**

```ts
// tests/storage/v3/sqlite-ai-boot-repository.test.ts
import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteRepository } from "../../../src/storage/sqlite-repository";

function repo() {
  const dir = mkdtempSync(join(tmpdir(), "ai-boot-v3-"));
  return new SqliteRepository(join(dir, "test.db"));
}

describe("SqliteRepository ai boot v3", () => {
  it("inserts and finds an event by source message id", () => {
    const r = repo();
    r.insertAiBootEvent({
      id: "evt-1",
      campId: "default",
      chatId: "chat-1",
      memberId: "m-1",
      sourceMessageId: "om-1",
      eventType: "text",
      rawText: "hello",
      sanitizedText: "hello",
      attachmentJson: "[]",
      evidenceJson: "{}",
      contentHash: "hash-1",
      status: "received",
      engineVersion: "v3.0.0",
      rulesetVersion: "2026-05-16",
      createdAt: "2026-05-16T00:00:00.000Z",
    });
    expect(r.findAiBootEventByMessageId("om-1")?.id).toBe("evt-1");
    r.close();
  });

  it("inserts score events and sums approved v3 score", () => {
    const r = repo();
    r.insertAiBootScoreEvent({
      id: "score-1",
      eventId: "evt-1",
      campId: "default",
      memberId: "m-1",
      category: "ai_artifact",
      scoreDelta: 4,
      confidence: "high",
      status: "approved",
      notifyPolicy: "group_praise",
      reason: "AI artifact share",
      evidence: "shared image",
      badgesJson: "[]",
      modelProvider: "fake",
      modelName: "fake",
      promptVersion: "none",
      reviewedByOpId: null,
      reviewNote: null,
      decidedAt: "2026-05-16T00:01:00.000Z",
    });
    r.insertAiBootScoreEvent({
      id: "score-2",
      eventId: "evt-2",
      campId: "default",
      memberId: "m-1",
      category: "resource_recommendation",
      scoreDelta: 3,
      confidence: "low",
      status: "review_required",
      notifyPolicy: "silent",
      reason: "needs review",
      evidence: "resource",
      badgesJson: "[]",
      modelProvider: "fake",
      modelName: "fake",
      promptVersion: "none",
      reviewedByOpId: null,
      reviewNote: "low confidence",
      decidedAt: "2026-05-16T00:02:00.000Z",
    });
    expect(r.sumApprovedAiBootScore("default", "m-1")).toBe(4);
    r.close();
  });
});
```

- [ ] **Step 3: Run test and verify it fails**

Run: `npx vitest run tests/storage/v3/sqlite-ai-boot-repository.test.ts`

Expected: FAIL because repository methods do not exist.

- [ ] **Step 4: Add tables to `tableDefinitions`**

Add after the v2 tables:

```sql
CREATE TABLE IF NOT EXISTS ai_boot_events (
  id TEXT PRIMARY KEY,
  camp_id TEXT NOT NULL,
  chat_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  source_message_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  raw_text TEXT NOT NULL DEFAULT '',
  sanitized_text TEXT NOT NULL DEFAULT '',
  attachment_json TEXT NOT NULL DEFAULT '[]',
  evidence_json TEXT NOT NULL DEFAULT '{}',
  content_hash TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'received',
  engine_version TEXT NOT NULL,
  ruleset_version TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(camp_id, source_message_id)
);
CREATE INDEX IF NOT EXISTS idx_ai_boot_events_member_created
  ON ai_boot_events (member_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_boot_events_content_hash
  ON ai_boot_events (camp_id, content_hash);

CREATE TABLE IF NOT EXISTS ai_boot_score_events (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  camp_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  category TEXT NOT NULL,
  score_delta INTEGER NOT NULL,
  confidence TEXT NOT NULL,
  status TEXT NOT NULL,
  notify_policy TEXT NOT NULL,
  reason TEXT NOT NULL,
  evidence TEXT NOT NULL,
  badges_json TEXT NOT NULL DEFAULT '[]',
  model_provider TEXT NOT NULL DEFAULT '',
  model_name TEXT NOT NULL DEFAULT '',
  prompt_version TEXT NOT NULL DEFAULT '',
  reviewed_by_op_id TEXT,
  review_note TEXT,
  decided_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ai_boot_scores_member_status
  ON ai_boot_score_events (member_id, status);
CREATE INDEX IF NOT EXISTS idx_ai_boot_scores_status_decided
  ON ai_boot_score_events (status, decided_at DESC);

CREATE TABLE IF NOT EXISTS ai_boot_legacy_score_snapshots (
  id TEXT PRIMARY KEY,
  camp_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  total_score INTEGER NOT NULL,
  dimension_json TEXT NOT NULL DEFAULT '{}',
  source_note TEXT NOT NULL,
  snapshot_at TEXT NOT NULL,
  UNIQUE(camp_id, member_id)
);
```

- [ ] **Step 5: Add repository methods**

Add public methods to `SqliteRepository`:

```ts
insertAiBootEvent(input: AiBootEventRecord): void {
  this.db.prepare(
    `INSERT OR IGNORE INTO ai_boot_events
      (id, camp_id, chat_id, member_id, source_message_id, event_type,
       raw_text, sanitized_text, attachment_json, evidence_json, content_hash,
       status, engine_version, ruleset_version, created_at)
     VALUES
      (@id, @campId, @chatId, @memberId, @sourceMessageId, @eventType,
       @rawText, @sanitizedText, @attachmentJson, @evidenceJson, @contentHash,
       @status, @engineVersion, @rulesetVersion, @createdAt)`
  ).run(input);
}

findAiBootEventByMessageId(sourceMessageId: string): AiBootEventRecord | undefined {
  const row = this.db.prepare(
    `SELECT id, camp_id, chat_id, member_id, source_message_id, event_type,
            raw_text, sanitized_text, attachment_json, evidence_json, content_hash,
            status, engine_version, ruleset_version, created_at
     FROM ai_boot_events WHERE source_message_id = ? LIMIT 1`
  ).get(sourceMessageId) as Record<string, unknown> | undefined;
  return row ? this.mapAiBootEventRow(row) : undefined;
}

insertAiBootScoreEvent(input: AiBootScoreEventRecord): void {
  this.db.prepare(
    `INSERT INTO ai_boot_score_events
      (id, event_id, camp_id, member_id, category, score_delta, confidence,
       status, notify_policy, reason, evidence, badges_json, model_provider,
       model_name, prompt_version, reviewed_by_op_id, review_note, decided_at)
     VALUES
      (@id, @eventId, @campId, @memberId, @category, @scoreDelta, @confidence,
       @status, @notifyPolicy, @reason, @evidence, @badgesJson, @modelProvider,
       @modelName, @promptVersion, @reviewedByOpId, @reviewNote, @decidedAt)`
  ).run(input);
}

sumApprovedAiBootScore(campId: string, memberId: string): number {
  const row = this.db.prepare(
    `SELECT COALESCE(SUM(score_delta), 0) AS total
     FROM ai_boot_score_events
     WHERE camp_id = ? AND member_id = ? AND status = 'approved'`
  ).get(campId, memberId) as { total: number };
  return Number(row.total ?? 0);
}
```

Also add `mapAiBootEventRow(row)` and `mapAiBootScoreEventRow(row)` private helpers that explicitly map snake_case columns to camelCase fields.

- [ ] **Step 6: Run repository test**

Run: `npx vitest run tests/storage/v3/sqlite-ai-boot-repository.test.ts`

Expected: PASS.

- [ ] **Step 7: Run storage regression tests**

Run: `npx vitest run tests/storage/v2/sqlite-repository-v2.test.ts tests/storage/sqlite-repository-migration.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/domain/v3/ai-boot-types.ts src/storage/sqlite-repository.ts tests/storage/v3/sqlite-ai-boot-repository.test.ts
git commit -m "feat: add ai boot v3 ledger schema"
```

---

## Task 3: Legacy Score Snapshot

**Files:**

- Create: `src/scripts/ai-boot-freeze-legacy-scores.ts`
- Modify: `src/storage/sqlite-repository.ts`
- Modify: `package.json`
- Test: `tests/scripts/ai-boot-freeze-legacy-scores.test.ts`

- [ ] **Step 1: Add repository methods**

Methods:

```ts
upsertAiBootLegacyScoreSnapshot(input: {
  id: string;
  campId: string;
  memberId: string;
  totalScore: number;
  dimensionJson: string;
  sourceNote: string;
  snapshotAt: string;
}): void

getAiBootLegacyScoreSnapshot(campId: string, memberId: string):
  | { totalScore: number; dimensionJson: string; snapshotAt: string }
  | undefined
```

- [ ] **Step 2: Write freeze script test**

Test should seed one member with v2 approved dimension scores and verify one legacy snapshot is created with the summed total.

Run: `npx vitest run tests/scripts/ai-boot-freeze-legacy-scores.test.ts`

Expected before implementation: FAIL.

- [ ] **Step 3: Implement script**

Script behavior:

1. Open `DATABASE_URL` or `./data/app.db`.
2. Find default camp.
3. For each eligible member, sum current v2 dimension scores with:
   `SELECT COALESCE(SUM(period_score), 0) FROM v2_member_dimension_scores WHERE member_id = ?`.
   This matches the current leaderboard source after v2 approved/manual events have incremented dimension score rows.
4. Write one snapshot per member.
5. Print a summary: `snapshots_written=N camp=default`.
6. If a snapshot exists, update it only when `AI_BOOT_FORCE_FREEZE=true`; otherwise skip and print `snapshots_skipped=N`.

- [ ] **Step 4: Add package script**

```json
"ai-boot:freeze-legacy": "tsx src/scripts/ai-boot-freeze-legacy-scores.ts"
```

- [ ] **Step 5: Run test and script help path**

Run:

```bash
npx vitest run tests/scripts/ai-boot-freeze-legacy-scores.test.ts
npm run build
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/scripts/ai-boot-freeze-legacy-scores.ts src/storage/sqlite-repository.ts tests/scripts/ai-boot-freeze-legacy-scores.test.ts package.json
git commit -m "feat: add legacy score freeze"
```

---

## Task 4: Scoring Decision Schema And Rules

**Files:**

- Create: `src/domain/v3/scoring-decision.ts`
- Create: `src/domain/v3/scoring-rules.ts`
- Test: `tests/domain/v3/scoring-decision.test.ts`
- Test: `tests/domain/v3/scoring-rules.test.ts`

- [ ] **Step 1: Write decision schema tests**

Cases:

- clamps `ai_artifact` to 3-5;
- rejects unknown category;
- forces `daily_participation` to score 1;
- forces `no_score` decisions to score 0 and notify `silent`;
- review-required decisions preserve reason and evidence.

- [ ] **Step 2: Implement rules**

Use exact category ranges:

```ts
export const AI_BOOT_RULESET_VERSION = "2026-05-16";

export const CATEGORY_SCORE_RANGES = {
  daily_participation: { min: 1, max: 1 },
  ai_artifact: { min: 3, max: 5 },
  ai_practice_reflection: { min: 3, max: 5 },
  prompt_or_method: { min: 4, max: 6 },
  resource_recommendation: { min: 2, max: 3 },
  peer_help: { min: 2, max: 4 },
  formal_task: { min: 1, max: 10 },
  operator_adjustment: { min: -20, max: 20 },
} as const;
```

- [ ] **Step 3: Implement schema validation with zod**

Use `z.object` for `ScoringDecision`. Export:

```ts
export function parseScoringDecision(raw: unknown): ScoringDecision
export function normalizeDecision(input: ScoringDecision): ScoringDecision
export function noScoreDecision(reason: string, evidence: string): ScoringDecision
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/domain/v3/scoring-decision.test.ts tests/domain/v3/scoring-rules.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/v3/scoring-decision.ts src/domain/v3/scoring-rules.ts tests/domain/v3/scoring-decision.test.ts tests/domain/v3/scoring-rules.test.ts
git commit -m "feat: define ai boot scoring decision schema"
```

---

## Task 5: Content Extraction

**Files:**

- Create: `src/services/feishu/ai-boot/content-extractor.ts`
- Test: `tests/services/feishu/ai-boot/content-extractor.test.ts`

- [ ] **Step 1: Write tests**

Cases:

- text message strips bot/user mention token but preserves meaningful text;
- pure URL evidence records URL but does not call it a resource recommendation;
- image message records `fileKey`, message type, and raw text context;
- PDF/DOCX file with existing extractor returns document evidence;
- extraction failure returns evidence with `status="failed"` and a reason.

- [ ] **Step 2: Implement evidence types**

```ts
export interface EvidenceBundle {
  sanitizedText: string;
  urls: string[];
  attachments: Array<{ type: string; fileKey?: string; fileName?: string; fileExt?: string }>;
  documentText: string;
  extractionStatus: "not_applicable" | "parsed" | "unsupported" | "failed";
  extractionReason: string;
  contentHash: string;
}
```

- [ ] **Step 3: Implement `extractEvidence`**

Use existing `createLocalDocumentTextExtractor` from `recent-context.ts` for PDF/DOCX. Use Node `crypto.createHash("sha256")` over sanitized text + attachment keys.

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/services/feishu/ai-boot/content-extractor.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/feishu/ai-boot/content-extractor.ts tests/services/feishu/ai-boot/content-extractor.test.ts
git commit -m "feat: extract ai boot message evidence"
```

---

## Task 6: Deterministic Guards

**Files:**

- Create: `src/services/feishu/ai-boot/deterministic-guards.ts`
- Test: `tests/services/feishu/ai-boot/deterministic-guards.test.ts`

- [ ] **Step 1: Write guard tests**

Cases:

- operator/trainer messages are not student auto-scored;
- @Bot text is treated as chat and not auto-scored;
- pure thanks/OK/emoji gets only daily participation if the daily cap is open;
- pure link with no reason is no-score for contribution;
- repeated same content hash is review-required or ignored based on existing approved score;
- category cap reached returns no-score without inserting noisy rejected rows.

- [ ] **Step 2: Implement guards**

Export:

```ts
export interface GuardContext {
  roleType: string;
  isParticipant: boolean;
  isExcludedFromBoard: boolean;
  mentionedBot: boolean;
  dailyParticipationAlreadyScored: boolean;
  categoryCapRemaining: number | null;
  duplicateApprovedContent: boolean;
}

export type GuardOutcome =
  | { kind: "continue" }
  | { kind: "daily_participation"; reason: string }
  | { kind: "ignore"; reason: string };

export function runDeterministicGuards(evidence: EvidenceBundle, context: GuardContext): GuardOutcome
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run tests/services/feishu/ai-boot/deterministic-guards.test.ts`

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/services/feishu/ai-boot/deterministic-guards.ts tests/services/feishu/ai-boot/deterministic-guards.test.ts
git commit -m "feat: add ai boot deterministic guards"
```

---

## Task 7: LLM Decision Engine

**Files:**

- Create: `src/services/feishu/ai-boot/llm-decision-engine.ts`
- Test: `tests/services/feishu/ai-boot/llm-decision-engine.test.ts`
- Modify: `src/services/feishu/chat-bot/persona.ts`
- Test: `tests/services/feishu/chat-bot/persona.test.ts`

- [ ] **Step 1: Write prompt tests**

Assert prompt contains:

- category definitions;
- explicit "prompt is not required except prompt_or_method";
- no-score boundaries;
- JSON-only output instruction;
- no examples that require sharing prompt for image/artifact.

- [ ] **Step 2: Implement prompt builder**

Export:

```ts
export const AI_BOOT_PROMPT_VERSION = "2026-05-16-v1";
export function buildScoringPrompt(input: { evidence: EvidenceBundle; memberName: string }): string
```

Prompt must require output compatible with `ScoringDecision`.

- [ ] **Step 3: Implement LLM wrapper**

Export:

```ts
export interface AiBootLlmClient {
  provider: string;
  model: string;
  chat(messages: Array<{ role: "system" | "user"; content: string }>, options: { timeoutMs: number; temperature?: number; maxTokens?: number }): Promise<string>;
}

export async function decideWithLlm(client: AiBootLlmClient, input: { evidence: EvidenceBundle; memberName: string }): Promise<ScoringDecision>
```

Use `temperature: 0.1`, `maxTokens: 600`, and parse with `parseScoringDecision`.

- [ ] **Step 4: Update praise persona**

Remove examples that say "快分享 prompt". Replace with examples that praise artifact, practice reflection, method sharing, and peer help separately.

- [ ] **Step 5: Run tests**

Run:

```bash
npx vitest run tests/services/feishu/ai-boot/llm-decision-engine.test.ts tests/services/feishu/chat-bot/persona.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/services/feishu/ai-boot/llm-decision-engine.ts tests/services/feishu/ai-boot/llm-decision-engine.test.ts src/services/feishu/chat-bot/persona.ts tests/services/feishu/chat-bot/persona.test.ts
git commit -m "feat: add ai boot llm decision engine"
```

---

## Task 8: Notification Orchestrator

**Files:**

- Create: `src/services/feishu/ai-boot/notification-orchestrator.ts`
- Test: `tests/services/feishu/ai-boot/notification-orchestrator.test.ts`

- [ ] **Step 1: Write tests**

Cases:

- daily participation is silent;
- review_required is silent;
- approved high-confidence artifact can group praise;
- per-student daily cap blocks fourth praise;
- per-chat hourly cap blocks sixth praise;
- cooldown is reserved before send to avoid concurrent double-send;
- repeated topic hash suppresses duplicate praise.

- [ ] **Step 2: Implement orchestrator**

Export:

```ts
export interface NotificationState {
  lastGlobalPraiseAt: number;
  praiseByStudentToday: Map<string, number>;
  praiseByChatHour: Map<string, number>;
  recentTopicHashes: Map<string, number>;
}

export function createNotificationState(): NotificationState
export function decideNotification(input: {
  decision: ScoringDecision;
  memberId: string;
  chatId: string;
  topicHash: string;
  now: number;
  state: NotificationState;
}): { shouldSend: boolean; policy: AiBootNotifyPolicy; reason: string }
export function buildPraiseText(input: { memberName: string; decision: ScoringDecision }): string
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run tests/services/feishu/ai-boot/notification-orchestrator.test.ts`

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/services/feishu/ai-boot/notification-orchestrator.ts tests/services/feishu/ai-boot/notification-orchestrator.test.ts
git commit -m "feat: add ai boot notification policy"
```

---

## Task 9: v3 Orchestrator

**Files:**

- Create: `src/services/feishu/ai-boot/orchestrator.ts`
- Test: `tests/services/feishu/ai-boot/orchestrator.test.ts`
- Modify: `src/app.ts`
- Modify: `src/services/feishu/message-commands.ts`

- [ ] **Step 1: Write orchestrator tests**

Cases:

- `v3_shadow` writes event and shadow score event but does not increment leaderboard and does not notify;
- `v3_live` writes approved score and may notify through notification orchestrator;
- @Bot mention remains chat-only and does not write score event;
- image share without prompt can approve as `ai_artifact`;
- experience share without prompt can approve as `ai_practice_reflection`;
- pure link without reason is no-score.

- [ ] **Step 2: Implement orchestrator dependencies**

```ts
export interface AiBootOrchestratorDeps {
  repo: Pick<SqliteRepository, "insertAiBootEvent" | "findAiBootEventByMessageId" | "insertAiBootScoreEvent" | "sumApprovedAiBootScore">;
  llmClient?: AiBootLlmClient;
  feishuClient: Pick<FeishuApiClient, "getMessageFile" | "sendTextMessage">;
  config: AiBootConfig;
  now: () => string;
  uuid: () => string;
}
```

- [ ] **Step 3: Implement `handleMessage`**

Flow:

1. Return early for non-group messages.
2. Find member and role from existing card repo adapter or repository.
3. Extract evidence.
4. Insert `ai_boot_events`.
5. Run guards.
6. For daily participation, write approved/silent score if live or shadow score if shadow.
7. For contribution candidates, call LLM decision engine.
8. Normalize decision and write `ai_boot_score_events`.
9. In live mode, send notification only if notification orchestrator approves.

- [ ] **Step 4: Wire message commands**

Add optional `aiBootOrchestrator` to `MessageCommandDeps`. In auto-capture:

```ts
if (deps.aiBootOrchestrator && deps.aiBootConfig?.engineMode !== "legacy") {
  await deps.aiBootOrchestrator.handleMessage(message);
  return;
}
```

Keep admin keywords, quiz, peer review, dashboard, member management, and @Bot path before this branch.

- [ ] **Step 5: Run tests**

Run:

```bash
npx vitest run tests/services/feishu/ai-boot/orchestrator.test.ts tests/services/feishu/message-commands.test.ts
npm run build
```

Expected: PASS for the targeted tests and build.

- [ ] **Step 6: Commit**

```bash
git add src/services/feishu/ai-boot/orchestrator.ts tests/services/feishu/ai-boot/orchestrator.test.ts src/app.ts src/services/feishu/message-commands.ts
git commit -m "feat: wire ai boot v3 orchestrator"
```

---

## Task 10: Leaderboard Aggregation

**Files:**

- Create: `src/domain/v3/scorebook.ts`
- Test: `tests/domain/v3/scorebook.test.ts`
- Modify: `src/routes/v2/board.ts`
- Test: `tests/api/v2/board-ranking.test.ts`
- Test: `tests/api/v2/board-member-detail.test.ts`

- [ ] **Step 1: Write scorebook tests**

Cases:

- no legacy snapshot means v3 approved score only;
- legacy snapshot plus v3 approved score sums correctly;
- review_required/no_score/rejected do not affect total;
- operator adjustment affects total.

- [ ] **Step 2: Implement pure aggregation**

```ts
export function combineLegacyAndV3Score(input: {
  legacyTotal: number;
  approvedV3Total: number;
}): number {
  return input.legacyTotal + input.approvedV3Total;
}
```

- [ ] **Step 3: Modify board route**

Keep existing response shape. Add v3 totals only when a legacy snapshot exists or v3 score exists. Preserve old clients.

- [ ] **Step 4: Run tests**

Run:

```bash
npx vitest run tests/domain/v3/scorebook.test.ts tests/api/v2/board-ranking.test.ts tests/api/v2/board-member-detail.test.ts
```

Expected: board tests pass after expectations include the additive score fields `legacyScore`, `v3Score`, and `totalScore`; existing clients that read only `totalScore` continue to work.

- [ ] **Step 5: Commit**

```bash
git add src/domain/v3/scorebook.ts tests/domain/v3/scorebook.test.ts src/routes/v2/board.ts tests/api/v2/board-ranking.test.ts tests/api/v2/board-member-detail.test.ts
git commit -m "feat: aggregate legacy and ai boot v3 scores"
```

---

## Task 11: Operator Review APIs

**Files:**

- Create: `src/routes/v3/ai-boot-admin.ts`
- Test: `tests/routes/v3/ai-boot-admin.test.ts`
- Modify: `src/app.ts`
- Modify: `src/storage/sqlite-repository.ts`

- [ ] **Step 1: Write API tests**

Endpoints:

- `GET /api/v3/ai-boot/review-queue`
- `POST /api/v3/ai-boot/score-events/:id/approve`
- `POST /api/v3/ai-boot/score-events/:id/reject`
- `POST /api/v3/ai-boot/score-events/:id/correct`

Tests:

- non-admin gets 403;
- review queue returns low-confidence review_required rows with evidence;
- approve increments effective v3 score;
- reject does not increment score;
- correct can change category, scoreDelta, reason, and reviewNote.

- [ ] **Step 2: Add repository methods**

Methods:

```ts
listAiBootReviewQueue(input: { campId: string; limit: number; offset: number }): AiBootScoreEventRecord[]
updateAiBootScoreDecision(input: { id: string; status: AiBootDecisionStatus; reviewedByOpId: string; reviewNote: string; scoreDelta?: number; category?: AiBootScoreCategory; reason?: string }): void
getAiBootScoreEvent(id: string): AiBootScoreEventRecord | undefined
```

- [ ] **Step 3: Register route**

In `src/app.ts`, import and call `registerV3AiBootAdminRoutes(app, { repository, requireAdmin: requireAdmin(repository) })`.

- [ ] **Step 4: Run API tests**

Run: `npx vitest run tests/routes/v3/ai-boot-admin.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/routes/v3/ai-boot-admin.ts tests/routes/v3/ai-boot-admin.test.ts src/app.ts src/storage/sqlite-repository.ts
git commit -m "feat: add ai boot operator review api"
```

---

## Task 12: Evaluation Harness And Golden Set Workflow

**Files:**

- Create: `src/scripts/ai-boot-shadow-replay.ts`
- Create: `src/scripts/ai-boot-cutover-check.ts`
- Modify: `package.json`
- Test: `tests/scripts/ai-boot-shadow-replay.test.ts`
- Test: `tests/scripts/ai-boot-cutover-check.test.ts`

- [ ] **Step 1: Write shadow replay tests**

Test with three stored events:

- one image artifact;
- one pure link;
- one experience reflection.

Expected output JSON contains counts:

```json
{
  "eventsReplayed": 3,
  "approved": 2,
  "noScore": 1,
  "reviewRequired": 0
}
```

- [ ] **Step 2: Implement shadow replay**

Script accepts:

```bash
npm run ai-boot:shadow-replay -- --since 2026-05-16 --limit 100
```

It reads `ai_boot_events` or recent raw Feishu events, runs v3 decision in shadow mode, writes `status='shadow'` score events, and prints aggregate metrics.

- [ ] **Step 3: Write cutover check tests**

Cutover check should fail if:

- no legacy snapshots exist;
- any `review_required` older than 24h exists;
- any v3 score event has empty reason/evidence;
- bot notification count exceeds configured daily cap.

- [ ] **Step 4: Implement cutover check**

Script exits with code `1` on failed checks and prints machine-readable JSON:

```json
{
  "ok": false,
  "failures": ["legacy_snapshots_missing"]
}
```

- [ ] **Step 5: Add package scripts**

```json
"ai-boot:shadow-replay": "tsx src/scripts/ai-boot-shadow-replay.ts",
"ai-boot:cutover-check": "tsx src/scripts/ai-boot-cutover-check.ts"
```

- [ ] **Step 6: Run tests**

Run:

```bash
npx vitest run tests/scripts/ai-boot-shadow-replay.test.ts tests/scripts/ai-boot-cutover-check.test.ts
npm run build
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/scripts/ai-boot-shadow-replay.ts src/scripts/ai-boot-cutover-check.ts tests/scripts/ai-boot-shadow-replay.test.ts tests/scripts/ai-boot-cutover-check.test.ts package.json
git commit -m "feat: add ai boot evaluation harness"
```

---

## Task 13: Production Shadow Deployment

**Files:**

- Modify: `scripts/ops/check-health.sh`
- Modify: `scripts/ops/deploy-app.sh`
- Create: `docs/scoring-audit/2026-05-16-ai-boot-cutover-runbook.md`

- [ ] **Step 1: Add runbook**

Runbook must include exact sequence:

```bash
npm run build
npm test
npm run ai-boot:freeze-legacy
npm run ai-boot:cutover-check
```

Server sequence:

```bash
cd /opt/ai-seed-project
./scripts/ops/backup-db.sh
AI_BOOT_ENGINE_MODE=v3_shadow systemctl restart ai-seed-project.service
curl -fsS http://127.0.0.1:3001/api/health
curl -fsS http://127.0.0.1:3001/api/feishu/status
```

- [ ] **Step 2: Update health check script**

`scripts/ops/check-health.sh` should print `aiBoot.engineMode` from `/api/feishu/status` when available.

- [ ] **Step 3: Run local verification**

Run:

```bash
npm run build
npx vitest run tests/services/feishu/ai-boot tests/domain/v3 tests/routes/v3 tests/scripts/ai-boot-shadow-replay.test.ts tests/scripts/ai-boot-cutover-check.test.ts
```

Expected: PASS.

- [ ] **Step 4: Deploy shadow mode**

On server, after DB backup, set:

```bash
AI_BOOT_ENGINE_MODE=v3_shadow
AI_BOOT_ALLOW_GROUP_PRAISE=false
AI_BOOT_ALLOW_DAILY_DIGEST=false
```

Expected behavior for 24 hours:

- v3 events and shadow score events are created;
- no v3 group praise is sent;
- existing production score behavior remains unchanged;
- shadow replay metrics are available for review.

- [ ] **Step 5: Commit**

```bash
git add scripts/ops/check-health.sh scripts/ops/deploy-app.sh docs/scoring-audit/2026-05-16-ai-boot-cutover-runbook.md
git commit -m "docs: add ai boot shadow cutover runbook"
```

---

## Task 14: Live Cutover

**Files:**

- Modify: deployment environment only after Task 13 metrics are accepted.
- No code changes in this task unless cutover check fails.

- [ ] **Step 1: Review shadow metrics**

Required acceptance:

- false-positive sample rate is acceptable to operator review;
- image/artifact shares without prompt are classified as scorable when evidence supports them;
- pure links without reason are no-score or review_required;
- no group praise is sent in shadow;
- no new `pass=false approved` pattern exists in v3.

- [ ] **Step 2: Enable v3 live without group praise**

Set:

```bash
AI_BOOT_ENGINE_MODE=v3_live
AI_BOOT_ALLOW_GROUP_PRAISE=false
AI_BOOT_ALLOW_DAILY_DIGEST=false
```

Expected: v3 approved score affects leaderboard, but group noise stays low.

- [ ] **Step 3: Observe for one operating day**

Run on server:

```bash
npm run ai-boot:cutover-check
journalctl -u ai-seed-project.service --since "24 hours ago" --no-pager | grep -E "AiBoot|Notification|Review"
```

Expected:

- cutover check passes;
- review queue has reasons/evidence;
- no notification bursts.

- [ ] **Step 4: Enable group praise with strict caps**

Set:

```bash
AI_BOOT_ALLOW_GROUP_PRAISE=true
AI_BOOT_ALLOW_DAILY_DIGEST=false
```

Only enable daily digest after group praise has one clean operating day.

- [ ] **Step 5: Record cutover note**

Append final production status to `docs/scoring-audit/2026-05-16-ai-boot-cutover-runbook.md` with date, server git SHA, DB backup path, and `AI_BOOT_ENGINE_MODE`.

- [ ] **Step 6: Commit cutover note**

```bash
git add docs/scoring-audit/2026-05-16-ai-boot-cutover-runbook.md
git commit -m "docs: record ai boot live cutover"
```

---

## Verification Matrix

Run before any production deploy:

```bash
npm run build
npx vitest run tests/domain/v3 tests/services/feishu/ai-boot tests/routes/v3 tests/scripts/ai-boot-shadow-replay.test.ts tests/scripts/ai-boot-cutover-check.test.ts
```

Run before live cutover:

```bash
npm test
npm run ai-boot:freeze-legacy
npm run ai-boot:cutover-check
```

Expected baseline after full implementation:

- all new v3 tests pass;
- existing v2 scoring tests still pass;
- known unrelated legacy failures are either fixed or explicitly documented before deploy;
- `/api/feishu/status` reports `aiBoot.engineMode`;
- new v3 rejected/review rows include reason and evidence;
- no v3 notification is sent before an approved decision.

## Rollback Plan

If v3 causes scoring or notification issues:

1. Set `AI_BOOT_ENGINE_MODE=legacy`.
2. Restart `ai-seed-project.service`.
3. Keep v3 tables for forensic review; do not delete them.
4. Since legacy snapshot is additive and v3 score events are separate, leaderboard can return to legacy/v2 aggregation by config.
5. Investigate failed v3 events using `ai_boot_events` and `ai_boot_score_events`.

## Execution Recommendation

Use subagent-driven development once implementation begins:

- Worker A: Tasks 1-4, domain/schema foundations.
- Worker B: Tasks 5-8, evidence, decision, notification.
- Worker C: Tasks 9-11, wiring, board, operator APIs.
- Worker D: Tasks 12-14, evaluation and deployment runbook.

Workers must not write to overlapping files in parallel unless coordinated. `src/storage/sqlite-repository.ts`, `src/app.ts`, and `src/services/feishu/message-commands.ts` should be owned by one worker at a time.
