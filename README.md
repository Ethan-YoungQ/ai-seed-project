# Pfizer HBU AI Bootcamp Evaluator

Production-oriented MVP for the Feishu-native phase-one delivery flow.

## Scope

- Learner entry in Feishu knowledge base / document homepage
- Ranking and ops views in Feishu Base dashboards and views
- Ops and admin workflows in Feishu Base views plus mirrored diagnostics
- Aliyun always-on backend as the only always-on runtime
- Bot announcements and Feishu Base snapshots for operational visibility

Phase one is formally delivered as **Feishu native delivery surface + Aliyun always-on backend**.
The standalone web UI and `/operator` routes remain engineering surfaces and are not the
phase-one sign-off target.

## Submission Model

- Learners submit PDF or Word documents in the Feishu group.
- Tags remain supported for backward compatibility, but document uploads do not depend on them
  when there is a single active biweekly session window.
- The runtime already reads provider-neutral `LLM_*` keys; when enabled, it uses compatible
  model scoring and falls back to heuristic scoring if the LLM path is disabled or fails.

## Quick Start

- `npm install`
- `npm run dev`
- `npm test`
- `npm run build`

## Operational Docs

- [Feishu setup](./docs/feishu-setup.md)
- [Release runbook](./docs/release-runbook.md)
- [Smoke test checklist](./docs/release-smoke-tests.md)
- [Next-thread handoff](./docs/handoffs/2026-04-06-next-thread-handoff.md)

## Scripts

- `npm run dev` starts the Fastify API on `PORT` from `.env`.
- `npm run build` compiles the API for release verification.
- `npm test` runs the Vitest suite.
- `npm run test:coverage` runs the Vitest suite with v8 coverage reporting.
- `npm run seed:demo` loads demo camp and member data into SQLite.
- `npm run bootstrap:feishu` creates or binds the Feishu test chat and Base schema.

## Scoring v2 — Phase 1 Complete (2026-04)

Sub-project 1 Phase 1 delivered the v2 scoring domain model, the scoring aggregator,
the window settler, the LLM scoring worker, the `/api/v2/*` route surface, end-to-end
tests, and the legacy v1 cleanup. Sub-projects 2 (Feishu card interactions) and
3 (frontend rewrite) consume this layer.
