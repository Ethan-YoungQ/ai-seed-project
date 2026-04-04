# Biweekly Evaluation MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the phase-1 MVP for the Pfizer HBU AI bootcamp: Feishu message ingest, session-window aggregation, rule-first scoring, SQLite fact storage, Base-ready sync models, and a lightweight dashboard.

**Architecture:** A Fastify TypeScript backend receives Feishu events, normalizes and stores raw facts in SQLite, aggregates messages into session-scoped submissions, scores them with deterministic rules plus optional LLM assistance, and exposes dashboard APIs. A Vite React frontend renders the operator-facing ranking board while Feishu Base remains the operational review surface.

**Tech Stack:** Node.js, TypeScript, Fastify, Drizzle ORM, SQLite, Vitest, React, Vite, official Feishu Node SDK

---

### Task 1: Project Bootstrap

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `drizzle.config.ts`
- Create: `src/`
- Create: `web/`

- [ ] Initialize the repository as a Node workspace with backend, frontend, test, and database scripts.
- [ ] Add TypeScript, Fastify, Drizzle, SQLite, Vitest, React, Vite, and Feishu SDK dependencies.
- [ ] Set up a shared TypeScript configuration and Vitest config for domain-first testing.

### Task 2: Domain and Schema

**Files:**
- Create: `src/config/`
- Create: `src/domain/`
- Create: `src/db/schema.ts`
- Create: `src/db/client.ts`
- Create: `tests/domain/`

- [ ] Write failing tests for session window matching, member eligibility, submission aggregation, and rule-first scoring.
- [ ] Implement the SQLite schema for camps, members, sessions, raw events, submission candidates, scores, warnings, and board snapshots.
- [ ] Implement domain services to map raw messages into biweekly session windows and final evaluated submissions.

### Task 3: Backend APIs and Integrations

**Files:**
- Create: `src/server.ts`
- Create: `src/routes/`
- Create: `src/services/feishu/`
- Create: `src/services/board/`
- Create: `src/services/scoring/`
- Create: `tests/api/`

- [ ] Write failing API tests for Feishu event ingest, operator member filtering, and dashboard ranking endpoints.
- [ ] Implement Fastify routes for event ingest, member management, dashboard queries, and seed/demo data.
- [ ] Add Feishu and Base service adapters behind interfaces so the MVP works locally without live credentials.

### Task 4: Dashboard UI

**Files:**
- Create: `web/index.html`
- Create: `web/src/`
- Create: `web/src/pages/`
- Create: `web/src/components/`
- Create: `web/src/styles.css`

- [ ] Build a lightweight but distinctive dashboard for operator ranking, trend cards, participant filtering, and exclusion visibility.
- [ ] Wire the UI to backend ranking and member APIs.
- [ ] Keep all visible copy product-facing and free of implementation notes.

### Task 5: Verification

**Files:**
- Modify: `README.md`
- Create: `.env.example`

- [ ] Document how to run the backend, dashboard, migrations, and tests locally.
- [ ] Run domain tests, API tests, and frontend build verification.
- [ ] Record exactly what changed, why, impact scope, and validation steps in the final handoff.
