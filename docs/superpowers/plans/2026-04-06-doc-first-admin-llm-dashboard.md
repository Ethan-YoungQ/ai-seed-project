# Document-First Homework, Admin Console, and Visual Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the bootcamp evaluator from tag-driven message scoring into a document-first, biweekly homework system with real LLM-assisted scoring, an authenticated 3-admin console, and a visual student/public dashboard.

**Architecture:** Keep Fastify + SQLite as the system of record, keep Feishu/Base as ingress and mirror surfaces, and split the web app into a public student board and an authenticated admin console. Homework scoring becomes document-first: each PDF/DOCX in the active biweekly window is a submission attempt, hard rules run first, LLM only assists process/quality scoring, and the session score is the highest valid score within the cycle.

**Tech Stack:** Fastify, SQLite (`better-sqlite3`), React 19 + Vite, Feishu OpenAPI SDK, PDF/DOCX parsing, OpenAI-compatible LLM HTTP adapter, Recharts (new), cookie-based admin auth (new).

---

## Locked product decisions

- Homework submissions no longer require tags.
- Future homework submissions are PDF/DOCX documents sent in the Feishu group.
- Each biweekly cycle has one homework slot per student.
- If a student uploads multiple documents inside the same cycle, scores do **not** accumulate; the final cycle score is the **highest valid score**, with latest submission as the tiebreaker.
- Public/student-facing pages are anonymous read-only.
- Admin actions require login, and exactly three admin accounts are supported in v1.
- Real-time updates are implemented as low-cost polling, not websockets/SSE.
- Hard rules stay deterministic: active biweekly window, on-time check, evidence/process/result presence.
- Real LLM is required for process score and quality score only, via an OpenAI-compatible provider endpoint so cheaper providers can be swapped in.
- Existing Feishu message ingestion, Base mirror, and warning state machine stay in place and are adapted rather than replaced.

## Current gaps confirmed from repo state

- `web/src/App.tsx` has ranking and operator panels, but no per-student visual score progress chart and still contains mojibake in visible copy.
- `src/domain/scoring.ts` writes `llmReason` fields but currently uses heuristic fallback instead of a real model call.
- `src/services/scoring/evaluate-window.ts` still assumes mixed tag/document routing and stores one aggregated candidate per member/session, which does not support “multiple files, keep highest score”.
- `src/app.ts` exposes operator APIs but there is no admin authentication, so “three admins can access/manage” is not implemented.
- Public and operator views exist by route split, but they are not proper role-separated “student/public board vs admin console” experiences yet.

## File structure changes

### Backend

- Modify: `src/app.ts`
  - Add auth-protected admin routes and keep public routes anonymous.
  - Separate public board APIs from admin-only mutation APIs.
- Create: `src/services/auth/admin-auth.ts`
  - Parse admin credentials from env, issue/verify signed cookies, expose route guards.
- Create: `src/services/llm/openai-compatible.ts`
  - Minimal HTTP client for OpenAI-compatible chat scoring.
- Create: `src/services/scoring/llm-score.ts`
  - Wrap prompt construction and structured scoring output for process/quality.
- Modify: `src/services/scoring/evaluate-window.ts`
  - Route document-first submissions and choose highest score in-cycle.
- Modify: `src/domain/scoring.ts`
  - Keep hard-rule gate local; delegate process/quality to real LLM when configured.
- Modify: `src/domain/submission-aggregation.ts`
  - Aggregate by document attempt instead of “all events in one window”.
- Modify: `src/domain/types.ts`
  - Add submission-attempt, admin session, score timeline, badge, and auth response types.
- Modify: `src/storage/sqlite-repository.ts`
  - Add admin session support, per-attempt score storage, highest-score selection, score history queries.
- Modify: `src/db/schema.ts`
  - Add any missing columns/tables needed for attempt-level scoring and admin sessions.

### Frontend

- Modify: `web/src/App.tsx`
  - Reduce it to route shell/orchestration; stop mixing public and admin screen logic in one component.
- Create: `web/src/pages/public-board.tsx`
  - Student/public read-only dashboard with rankings, charts, trend cards, badges.
- Create: `web/src/pages/admin-console.tsx`
  - Admin login gate, submissions review, member management, warnings, announcements.
- Create: `web/src/pages/admin-login.tsx`
  - Simple login form for the three admins.
- Create: `web/src/components/progress-chart.tsx`
  - Student score trend chart.
- Create: `web/src/components/student-spotlight.tsx`
  - Honor area with streaks/badges/progress callouts.
- Modify: `web/src/lib/api.ts`
  - Add auth, admin, score history, and per-student timeline endpoints.
- Modify: `web/src/types.ts`
  - Match new public/admin API contracts.
- Modify: `web/src/styles.css`
  - Support the split public/admin layouts and chart presentation.

### Docs / Config

- Modify: `.env.example`
  - Add admin auth config and LLM provider config.
- Modify: `README.md`
  - Update product behavior to document-first homework.
- Modify: `docs/feishu-setup.md`
  - Reflect no-tag submission flow and admin login config.
- Modify: `docs/release-runbook.md`
  - Add final validation for admin auth and document-first scoring.

## Task 1: Refactor homework evaluation to document-first attempts

**Files:**
- Modify: `src/services/scoring/evaluate-window.ts`
- Modify: `src/domain/submission-aggregation.ts`
- Modify: `src/domain/types.ts`
- Modify: `src/storage/sqlite-repository.ts`
- Test: `tests/services/evaluate-window.test.ts`
- Test: `tests/domain/submission-aggregation.test.ts`

- [ ] **Step 1: Write the failing tests for document-first session scoring**

Add tests that assert:
- a PDF/DOCX in the active session window is accepted without any tag
- text-only messages without a supported document are ignored for homework scoring
- multiple document uploads in one biweekly cycle create multiple submission attempts
- the final session score chooses the highest valid total score
- if scores tie, the latest attempt wins

- [ ] **Step 2: Run the focused tests and confirm they fail**

Run:

```bash
npm test -- tests/services/evaluate-window.test.ts tests/domain/submission-aggregation.test.ts
```

Expected: failures around missing attempt-level model and highest-score selection.

- [ ] **Step 3: Introduce attempt-level submission modeling**

Implementation changes:
- stop collapsing all window events into a single candidate id of `sessionId:memberId`
- create one attempt per supported document event, preserving `attemptId`, `submittedAt`, and parsed document text
- keep non-document events available for audit, but exclude them from homework attempt scoring

- [ ] **Step 4: Implement best-score selection for the cycle**

Implementation changes:
- persist all attempts and their scores
- compute the final board-visible session result as:
  1. highest valid `totalScore`
  2. if tied, latest `submittedAt`
  3. if no valid attempt exists, latest invalid/pending result remains the session state

- [ ] **Step 5: Run tests and verify they pass**

Run:

```bash
npm test -- tests/services/evaluate-window.test.ts tests/domain/submission-aggregation.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/services/scoring/evaluate-window.ts src/domain/submission-aggregation.ts src/domain/types.ts src/storage/sqlite-repository.ts tests/services/evaluate-window.test.ts tests/domain/submission-aggregation.test.ts
git commit -m "feat: switch homework scoring to document-first attempts"
```

## Task 2: Add real LLM-assisted process and quality scoring

**Files:**
- Create: `src/services/llm/openai-compatible.ts`
- Create: `src/services/scoring/llm-score.ts`
- Modify: `src/domain/scoring.ts`
- Modify: `.env.example`
- Test: `tests/domain/scoring.test.ts`
- Test: `tests/services/llm-score.test.ts`

- [ ] **Step 1: Write the failing tests for LLM scoring behavior**

Add tests that assert:
- hard-rule failures still return `invalid` without calling LLM
- when LLM config is present, process/quality scores are taken from model output
- when LLM is unavailable or times out, the heuristic fallback remains active
- model output is normalized to the allowed score ranges

- [ ] **Step 2: Run the focused tests and confirm they fail**

Run:

```bash
npm test -- tests/domain/scoring.test.ts tests/services/llm-score.test.ts
```

Expected: failures because no real provider adapter exists.

- [ ] **Step 3: Implement an OpenAI-compatible provider adapter**

Implementation changes:
- add env-driven config:
  - `LLM_ENABLED`
  - `LLM_BASE_URL`
  - `LLM_API_KEY`
  - `LLM_MODEL`
  - `LLM_TIMEOUT_MS`
- use `fetch` against an OpenAI-compatible chat completions endpoint
- return structured JSON for `processScore`, `qualityScore`, `reason`

- [ ] **Step 4: Integrate LLM scoring behind hard-rule gates**

Implementation changes:
- keep evidence/process/result/on-time checks deterministic in `src/domain/scoring.ts`
- if hard rules pass and LLM is enabled, call `llm-score.ts`
- clamp score outputs to `process<=3`, `quality<=2`
- store `llmReason`, `llmModel`, `llmInputExcerpt`

- [ ] **Step 5: Run tests and verify they pass**

Run:

```bash
npm test -- tests/domain/scoring.test.ts tests/services/llm-score.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/services/llm/openai-compatible.ts src/services/scoring/llm-score.ts src/domain/scoring.ts .env.example tests/domain/scoring.test.ts tests/services/llm-score.test.ts
git commit -m "feat: add configurable llm-assisted scoring"
```

## Task 3: Add authenticated admin access for three managers

**Files:**
- Create: `src/services/auth/admin-auth.ts`
- Modify: `src/app.ts`
- Modify: `.env.example`
- Create: `tests/api/admin-auth.test.ts`

- [ ] **Step 1: Write the failing tests for admin auth**

Add tests that assert:
- public board endpoints remain accessible without login
- admin endpoints reject unauthenticated access
- valid admin credentials can create a session cookie
- only configured admins can access mutation routes

- [ ] **Step 2: Run the focused tests and confirm they fail**

Run:

```bash
npm test -- tests/api/admin-auth.test.ts
```

Expected: FAIL because auth/session support does not exist.

- [ ] **Step 3: Implement cookie-based admin auth**

Implementation changes:
- add env config for three admins, e.g.:
  - `ADMIN_ACCOUNTS_JSON`
- support `POST /api/admin/login`
- support `POST /api/admin/logout`
- protect:
  - `/api/operator/*`
  - `/api/reviews/*`
  - `/api/members/:memberId`
  - `/api/announcements/*`

- [ ] **Step 4: Add auth state endpoint**

Implementation changes:
- expose `GET /api/admin/me`
- return admin display name and role for the frontend shell

- [ ] **Step 5: Run tests and verify they pass**

Run:

```bash
npm test -- tests/api/admin-auth.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/services/auth/admin-auth.ts src/app.ts .env.example tests/api/admin-auth.test.ts
git commit -m "feat: add authenticated admin access"
```

## Task 4: Split the web app into public board and admin console

**Files:**
- Modify: `web/src/App.tsx`
- Create: `web/src/pages/public-board.tsx`
- Create: `web/src/pages/admin-console.tsx`
- Create: `web/src/pages/admin-login.tsx`
- Modify: `web/src/lib/api.ts`
- Modify: `web/src/types.ts`
- Modify: `web/src/styles.css`
- Test: `tests/web/public-board-smoke.test.ts`

- [ ] **Step 1: Write the failing UI smoke tests**

Add tests that assert:
- public route renders leaderboard and trend components
- admin route redirects to login when unauthenticated
- admin route renders submissions/warnings/member controls after auth

- [ ] **Step 2: Run the focused tests and confirm they fail**

Run:

```bash
npm test -- tests/web/public-board-smoke.test.ts
```

Expected: FAIL because route split and auth-aware shells are not implemented.

- [ ] **Step 3: Refactor `App.tsx` into a thin route shell**

Implementation changes:
- route `/` to `public-board.tsx`
- route `/admin` to `admin-console.tsx`
- route `/admin/login` to `admin-login.tsx`
- remove remaining mojibake while touching visible copy

- [ ] **Step 4: Implement public/student board data flow**

Implementation changes:
- fetch ranking summary, snapshots, and per-student trend data
- keep the page anonymous and read-only
- add low-cost polling (default 30 seconds)

- [ ] **Step 5: Implement admin console data flow**

Implementation changes:
- load auth state first
- show submissions review, warnings, member management, announcement actions only after login

- [ ] **Step 6: Run tests and build verification**

Run:

```bash
npm test -- tests/web/public-board-smoke.test.ts
npm run build
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add web/src/App.tsx web/src/pages/public-board.tsx web/src/pages/admin-console.tsx web/src/pages/admin-login.tsx web/src/lib/api.ts web/src/types.ts web/src/styles.css tests/web/public-board-smoke.test.ts
git commit -m "feat: split public board and admin console"
```

## Task 5: Add visual score progress and lightweight gamification

**Files:**
- Create: `web/src/components/progress-chart.tsx`
- Create: `web/src/components/student-spotlight.tsx`
- Modify: `src/app.ts`
- Modify: `src/storage/sqlite-repository.ts`
- Modify: `web/src/pages/public-board.tsx`
- Modify: `web/src/types.ts`
- Test: `tests/api/public-board-history.test.ts`

- [ ] **Step 1: Write the failing tests for timeline and badge data**

Add tests that assert:
- a student can fetch historical score points across snapshots
- public board responses exclude excluded/non-participant members
- badges/streak fields are derived consistently from score history

- [ ] **Step 2: Run the focused tests and confirm they fail**

Run:

```bash
npm test -- tests/api/public-board-history.test.ts
```

Expected: FAIL because no progress-history API contract exists yet.

- [ ] **Step 3: Add public board history API**

Implementation changes:
- expose per-student score history for the current camp
- reuse `board_snapshots` and score history rather than recalculating from UI

- [ ] **Step 4: Add the visual dashboard layer**

Implementation changes:
- add `recharts`
- implement:
  - overall rank chart/summary
  - per-student progress chart
  - badge/streak cards such as:
    - 连续提交
    - 最佳进步
    - 双周之星

- [ ] **Step 5: Run tests and build verification**

Run:

```bash
npm test -- tests/api/public-board-history.test.ts
npm run build
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app.ts src/storage/sqlite-repository.ts web/src/components/progress-chart.tsx web/src/components/student-spotlight.tsx web/src/pages/public-board.tsx web/src/types.ts tests/api/public-board-history.test.ts package.json package-lock.json
git commit -m "feat: add visual progress dashboard and gamification"
```

## Task 6: Update docs and release expectations

**Files:**
- Modify: `README.md`
- Modify: `docs/feishu-setup.md`
- Modify: `docs/release-runbook.md`
- Modify: `docs/release-smoke-tests.md`

- [ ] **Step 1: Update the product description**

Document:
- homework is document-first, no tag required
- one biweekly homework slot per student
- highest valid score wins within the cycle
- admin login is required for management actions

- [ ] **Step 2: Update LLM setup instructions**

Document:
- required env vars
- supported OpenAI-compatible providers
- fallback behavior when LLM is disabled

- [ ] **Step 3: Update release smoke tests**

Document the acceptance flow for:
- text bot send test
- PDF homework
- DOCX homework
- admin login
- public board refresh
- Base mirror visibility

- [ ] **Step 4: Commit**

```bash
git add README.md docs/feishu-setup.md docs/release-runbook.md docs/release-smoke-tests.md
git commit -m "docs: update release and setup for document-first workflow"
```

## Final verification

- [ ] Run full test suite

```bash
npm test
```

Expected: all tests pass.

- [ ] Run production build

```bash
npm run build
```

Expected: API build and web build both pass.

- [ ] Run Feishu smoke validation

Check:
- `GET /api/health`
- `GET /api/feishu/status`
- `POST /api/feishu/send-test`
- new PDF homework
- new DOCX homework
- `GET /api/public-board`
- `GET /api/operator/submissions`

Expected:
- bot send succeeds
- both document types parse and score
- public board updates after polling
- admin review actions require login

## Assumptions

- Public/student-facing access remains anonymous and internal-shareable; there is no student login in v1.
- The three admins are configured through environment variables rather than a self-service user-management system.
- Community bonus and advanced social gamification stay secondary; the first gamification pass is badges, streaks, progress spotlight, and ranking dynamics.
- Existing uncommitted fixes around Feishu document parsing and release docs should be preserved and integrated during implementation, not discarded.

