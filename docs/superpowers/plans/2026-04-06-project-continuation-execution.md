# Project Continuation Execution Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the accepted 2026-04-06 blueprint by converting scoring to document-first attempts, wiring a real LLM scorer, adding authenticated admin management, and splitting the web app into a public board plus admin console.

**Architecture:** Keep Fastify + SQLite as the system of record, keep Feishu/Base as ingress and mirror surfaces, and adapt existing code rather than replacing it. Each PDF/DOCX inside the active biweekly session becomes one scored attempt; board-visible session outcome is computed from the best valid attempt, while admin views remain attempt-level for review and audit.

**Tech Stack:** Fastify, better-sqlite3, Drizzle SQLite schema, React 19, Vite, Vitest, Feishu OpenAPI SDK, PDF/DOCX extraction, OpenAI-compatible HTTP scoring adapter, `@fastify/cookie`, `recharts`, `@testing-library/react`, `jsdom`.

---

## Execution guardrails

- Preserve the dirty working tree that already exists on `codex/integration-baseline`; do not discard the current edits in `README.md`, `docs/feishu-setup.md`, `docs/release-runbook.md`, `docs/release-smoke-tests.md`, `src/services/feishu/client.ts`, `src/services/scoring/evaluate-window.ts`, `docs/final-acceptance-2026-04-05.md`, `docs/handoffs/2026-04-06-next-thread-handoff.md`, `docs/superpowers/plans/2026-04-06-doc-first-admin-llm-dashboard.md`, and `tests/services/feishu-client.test.ts`.
- Execute tasks in order. Do not start public/admin UI work before the document-first scoring model and LLM adapter land.
- Keep public/student access anonymous in v1. Do not add student login, profile editing, or per-student detail routes.
- Run the frontend copy leak audit before calling the UI complete. Do not ship visible strings containing implementation language such as `TODO`, `设计稿`, `phase`, `mockup`, or scope notes.

## Preflight

- [ ] Capture baseline workspace state.

```bash
git status --short --branch
npm test
npm run build
```

Expected:
- branch stays `codex/integration-baseline`
- tests pass
- API and web build pass

- [ ] Commit the already-accepted carry-forward baseline before feature work if it is not yet committed.

```bash
git add README.md docs/feishu-setup.md docs/release-runbook.md docs/release-smoke-tests.md src/services/feishu/client.ts src/services/scoring/evaluate-window.ts docs/final-acceptance-2026-04-05.md docs/handoffs/2026-04-06-next-thread-handoff.md docs/superpowers/plans/2026-04-06-doc-first-admin-llm-dashboard.md tests/services/feishu-client.test.ts
git commit -m "chore: preserve accepted handoff baseline"
```

Expected: baseline state is preserved and future feature commits stay focused.

## Task 1: Refactor scoring to document-first attempts

**Files:**
- Modify: `src/domain/types.ts`
- Modify: `src/domain/submission-aggregation.ts`
- Modify: `src/services/scoring/evaluate-window.ts`
- Modify: `src/storage/sqlite-repository.ts`
- Modify: `src/db/schema.ts`
- Modify: `tests/api/app.test.ts`
- Modify: `tests/domain/submission-aggregation.test.ts`
- Create: `tests/services/evaluate-window.test.ts`

- [ ] **Step 1: Write the failing attempt-level tests**

Add tests covering:

```ts
expect(response.json()).toMatchObject({
  accepted: true,
  sessionId: "session-01",
  candidateId: "attempt:session-01:user-alice:om_file_501"
});
```

and:

```ts
expect(bestSessionScore).toMatchObject({
  totalScore: 7,
  finalStatus: "valid",
  candidateId: "attempt:session-01:user-alice:om_file_503"
});
```

- [ ] **Step 2: Run the focused tests and confirm failure**

```bash
npm test -- tests/domain/submission-aggregation.test.ts tests/services/evaluate-window.test.ts tests/api/app.test.ts
```

Expected: existing `session-01:user-alice` candidate model breaks the new assertions.

- [ ] **Step 3: Introduce an attempt-first domain model**

Use these shapes as the implementation anchor:

```ts
export interface SubmissionAttempt {
  id: `attempt:${string}:${string}:${string}`;
  campId: string;
  sessionId: string;
  memberId: string;
  sourceEventId: string;
  submittedAt: string;
  fileName?: string;
  fileExt?: string;
  documentText: string;
  documentParseStatus: DocumentParseStatus;
}
```

```ts
export interface SessionResolvedScore {
  sessionId: string;
  memberId: string;
  bestAttemptId?: string;
  finalStatus: FinalStatus;
  totalScore: number;
}
```

- [ ] **Step 4: Persist attempts and compute best-in-cycle selection**

Implementation rules:
- each eligible PDF/DOCX creates one `attempt:*` candidate row
- `scores` remain attempt-level
- public board ranking uses the best valid attempt per member/session
- tie-breaker is latest `submittedAt`
- if no valid attempt exists, latest invalid/pending attempt remains the session outcome for admin review and warning sync

- [ ] **Step 5: Re-run tests and verify pass**

```bash
npm test -- tests/domain/submission-aggregation.test.ts tests/services/evaluate-window.test.ts tests/api/app.test.ts
```

Expected: PASS, and updated API tests assert attempt-level candidate ids.

- [ ] **Step 6: Commit**

```bash
git add src/domain/types.ts src/domain/submission-aggregation.ts src/services/scoring/evaluate-window.ts src/storage/sqlite-repository.ts src/db/schema.ts tests/domain/submission-aggregation.test.ts tests/services/evaluate-window.test.ts tests/api/app.test.ts
git commit -m "feat: switch scoring to document-first attempts"
```

## Task 2: Replace heuristic-only scoring with a real LLM adapter

**Files:**
- Create: `src/services/llm/openai-compatible.ts`
- Create: `src/services/scoring/llm-score.ts`
- Modify: `src/domain/scoring.ts`
- Modify: `.env.example`
- Modify: `tests/domain/scoring.test.ts`
- Create: `tests/services/llm-score.test.ts`

- [ ] **Step 1: Write the failing LLM integration tests**

Use a structured output contract:

```ts
type LlmScoreOutput = {
  processScore: number;
  qualityScore: number;
  reason: string;
};
```

Tests must cover:
- hard-rule failure never calls LLM
- valid submission uses model output when enabled
- timeout/provider error falls back to heuristic scoring
- returned scores clamp to `process<=3`, `quality<=2`

- [ ] **Step 2: Run the focused tests and confirm failure**

```bash
npm test -- tests/domain/scoring.test.ts tests/services/llm-score.test.ts
```

Expected: missing module and missing provider config failures.

- [ ] **Step 3: Add provider-neutral LLM configuration**

Use these env names:

```env
LLM_ENABLED=false
LLM_BASE_URL=
LLM_API_KEY=
LLM_MODEL=
LLM_TIMEOUT_MS=15000
```

Replace the current sample `OPENAI_*` lines in `.env.example` with the provider-neutral names above.

- [ ] **Step 4: Implement the adapter and scorer**

Anchor implementation around:

```ts
export async function requestStructuredScore(input: {
  baseUrl: string;
  apiKey: string;
  model: string;
  prompt: string;
  timeoutMs: number;
}): Promise<LlmScoreOutput> {}
```

```ts
export async function scoreProcessAndQuality(candidate: SubmissionCandidate): Promise<LlmScoreOutput> {}
```

`src/domain/scoring.ts` should:
- keep evidence/process/result/on-time gating deterministic
- call `scoreProcessAndQuality` only after hard rules pass
- persist `llmReason`, `llmModel`, and an excerpted input payload

- [ ] **Step 5: Re-run tests and verify pass**

```bash
npm test -- tests/domain/scoring.test.ts tests/services/llm-score.test.ts
```

Expected: PASS with explicit fallback coverage.

- [ ] **Step 6: Commit**

```bash
git add src/services/llm/openai-compatible.ts src/services/scoring/llm-score.ts src/domain/scoring.ts .env.example tests/domain/scoring.test.ts tests/services/llm-score.test.ts
git commit -m "feat: add openai-compatible scoring adapter"
```

## Task 3: Add three-admin authentication and protect admin APIs

**Files:**
- Create: `src/services/auth/admin-auth.ts`
- Modify: `src/app.ts`
- Modify: `src/storage/sqlite-repository.ts`
- Modify: `src/db/schema.ts`
- Modify: `.env.example`
- Create: `tests/api/admin-auth.test.ts`

- [ ] **Step 1: Write the failing admin auth tests**

Cover these routes:

```ts
await app.inject({ method: "GET", url: "/api/public-board" });
await app.inject({ method: "POST", url: "/api/admin/login", payload: { username, password } });
await app.inject({ method: "GET", url: "/api/admin/me", cookies: { admin_session: cookie } });
```

Assertions:
- public routes stay open
- `/api/operator/*`, `/api/reviews/*`, `/api/members/:memberId`, `/api/announcements/*` return `401` without a valid session
- valid login returns a session cookie
- logout invalidates the stored session

- [ ] **Step 2: Run the focused tests and confirm failure**

```bash
npm test -- tests/api/admin-auth.test.ts
```

Expected: FAIL because no auth plugin or session storage exists.

- [ ] **Step 3: Add env-configured three-admin auth**

Use:

```env
ADMIN_SESSION_SECRET=
ADMIN_ACCOUNTS_JSON=[{"username":"admin-1","password":"...","displayName":"Admin One"}]
```

Implementation rules:
- add `@fastify/cookie`
- create SQLite-backed `admin_sessions`
- set cookie name to `admin_session`
- return `{ username, displayName }` from `/api/admin/me`

- [ ] **Step 4: Protect admin routes**

Keep public routes open:
- `/api/health`
- `/api/feishu/status`
- `/api/public-board`
- `/api/public-board/snapshots`
- `/api/public-board/history`

Protect all mutation and operator-review routes behind the admin session guard.

- [ ] **Step 5: Re-run tests and verify pass**

```bash
npm test -- tests/api/admin-auth.test.ts tests/api/app.test.ts
```

Expected: PASS, with existing API coverage updated for the new auth boundary.

- [ ] **Step 6: Commit**

```bash
git add src/services/auth/admin-auth.ts src/app.ts src/storage/sqlite-repository.ts src/db/schema.ts .env.example tests/api/admin-auth.test.ts tests/api/app.test.ts package.json package-lock.json
git commit -m "feat: add authenticated admin console access"
```

## Task 4: Split the frontend into public board and admin console

**Files:**
- Modify: `web/src/App.tsx`
- Create: `web/src/pages/public-board.tsx`
- Create: `web/src/pages/admin-console.tsx`
- Create: `web/src/pages/admin-login.tsx`
- Modify: `web/src/lib/api.ts`
- Modify: `web/src/types.ts`
- Modify: `web/src/styles.css`
- Modify: `package.json`
- Create: `tests/web/public-board-smoke.test.ts`

- [ ] **Step 1: Add frontend smoke-test dependencies and failing tests**

Install:

```bash
npm install -D @testing-library/react jsdom
```

Create `tests/web/public-board-smoke.test.ts` with file header:

```ts
// @vitest-environment jsdom
```

and assertions for:
- public route shows ranking + progress sections
- `/admin` without auth shows login page
- authenticated admin shell renders submissions, warnings, and member controls

- [ ] **Step 2: Run the focused test and confirm failure**

```bash
npm test -- tests/web/public-board-smoke.test.ts
```

Expected: FAIL because the app is still a single mixed shell.

- [ ] **Step 3: Replace the mixed shell with route-specific pages**

Keep routing minimal and dependency-free:

```tsx
const pathname = window.location.pathname;
if (pathname === "/admin/login") return <AdminLoginPage />;
if (pathname.startsWith("/admin")) return <AdminConsolePage />;
return <PublicBoardPage />;
```

Do not add `react-router`.

- [ ] **Step 4: Make the admin shell auth-aware**

`AdminConsolePage` must:
- call `GET /api/admin/me` on mount
- redirect to `/admin/login` on `401`
- poll submissions and warnings every 30 seconds after auth succeeds

- [ ] **Step 5: Re-run tests and build**

```bash
npm test -- tests/web/public-board-smoke.test.ts
npm run build
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add web/src/App.tsx web/src/pages/public-board.tsx web/src/pages/admin-console.tsx web/src/pages/admin-login.tsx web/src/lib/api.ts web/src/types.ts web/src/styles.css tests/web/public-board-smoke.test.ts package.json package-lock.json
git commit -m "feat: split public board from admin console"
```

## Task 5: Add public score history, progress charts, and light gamification

**Files:**
- Modify: `src/app.ts`
- Modify: `src/storage/sqlite-repository.ts`
- Modify: `src/domain/types.ts`
- Create: `web/src/components/progress-chart.tsx`
- Create: `web/src/components/student-spotlight.tsx`
- Modify: `web/src/pages/public-board.tsx`
- Modify: `web/src/lib/api.ts`
- Modify: `web/src/types.ts`
- Modify: `package.json`
- Create: `tests/api/public-board-history.test.ts`

- [ ] **Step 1: Write the failing public history API tests**

Use one anonymous endpoint for the public page:

```ts
GET /api/public-board/history?campId=camp-demo
```

Expected response shape:

```ts
type PublicBoardHistoryEntry = {
  memberId: string;
  memberName: string;
  scores: Array<{ sessionId: string; totalScore: number; submittedAt: string }>;
  badges: string[];
};
```

- [ ] **Step 2: Run the focused tests and confirm failure**

```bash
npm test -- tests/api/public-board-history.test.ts
```

Expected: FAIL because the endpoint and response types do not exist.

- [ ] **Step 3: Implement the history endpoint and badge derivation**

Use repository-derived history only. Do not compute progress solely in the browser.

Badge defaults:
- `连续提交`: at least 2 consecutive sessions with valid scores
- `最佳进步`: largest positive delta in the camp
- `双周之星`: current top valid scorer

- [ ] **Step 4: Build the public visuals**

Install chart dependency:

```bash
npm install recharts
```

Add:

```tsx
<ProgressChart points={entry.scores} />
<StudentSpotlight entries={historyEntries.slice(0, 3)} />
```

Keep the public page to a single anonymous route; do not add `/students/:id`.

- [ ] **Step 5: Re-run tests and build**

```bash
npm test -- tests/api/public-board-history.test.ts tests/web/public-board-smoke.test.ts
npm run build
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app.ts src/storage/sqlite-repository.ts src/domain/types.ts web/src/components/progress-chart.tsx web/src/components/student-spotlight.tsx web/src/pages/public-board.tsx web/src/lib/api.ts web/src/types.ts tests/api/public-board-history.test.ts package.json package-lock.json
git commit -m "feat: add public progress history and badges"
```

## Task 6: Finish docs, release checks, and Feishu acceptance

**Files:**
- Modify: `README.md`
- Modify: `docs/feishu-setup.md`
- Modify: `docs/release-runbook.md`
- Modify: `docs/release-smoke-tests.md`

- [ ] **Step 1: Update product and setup docs**

Document these locked behaviors:
- document-first PDF/DOCX submission
- highest valid score wins inside a biweekly cycle
- public board is anonymous read-only
- admin actions require one of three configured admin accounts
- LLM scoring only affects process/quality

- [ ] **Step 2: Update release smoke tests**

Smoke checklist must include:

```text
1. POST /api/feishu/send-test succeeds
2. Real PDF submission parses and scores
3. Real DOCX submission parses and scores
4. /admin/login works for a configured admin
5. /api/public-board and /api/public-board/history refresh correctly
6. Feishu Base mirror shows raw event, attempt score, warning, and snapshot
```

- [ ] **Step 3: Run final verification**

```bash
npm test
npm run build
```

Then run live validation:

```text
GET /api/health
GET /api/feishu/status
POST /api/feishu/send-test
real PDF submission
real DOCX submission
GET /api/public-board
GET /api/public-board/history
GET /api/operator/submissions (with admin cookie)
```

Expected:
- tests and build pass
- live bot send succeeds
- both document types score successfully
- admin-only routes reject unauthenticated access
- public board reflects best valid attempt selection

- [ ] **Step 4: Commit**

```bash
git add README.md docs/feishu-setup.md docs/release-runbook.md docs/release-smoke-tests.md
git commit -m "docs: finalize project continuation release flow"
```

## Assumptions

- The accepted blueprint in `docs/superpowers/plans/2026-04-06-doc-first-admin-llm-dashboard.md` stays authoritative; this file is the execution plan layered on top of it.
- Admin auth uses three env-configured accounts plus SQLite-backed sessions; no self-service user management is added in v1.
- Public/student experience remains a single anonymous board page with rankings, snapshots, progress charts, and badge spotlight, not separate student detail routes.
- Provider-neutral `LLM_*` env keys replace the current sample `OPENAI_*` lines; backward compatibility for old env names is not required.
