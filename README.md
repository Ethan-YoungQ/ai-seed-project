# Pfizer HBU AI Bootcamp Evaluator

Production-oriented MVP for the Feishu-native phase-one delivery flow.

## Scope

- Learner entry in Feishu knowledge base / document homepage
- Ranking and results in Feishu Base dashboards and views
- Ops and admin workflows in Feishu Base views plus mirrored diagnostics
- Aliyun lightweight application server for the always-on backend
- Bot announcements and Feishu Base snapshots for operational visibility

Phase one is formally delivered as **Feishu native delivery surface + Aliyun always-on backend**.
The standalone web board and `/operator` routes remain engineering surfaces and are not the
phase-one sign-off target.

## Submission Model

- Learners submit PDF or Word documents in the Feishu group.
- Tags remain supported for backward compatibility, but document uploads do not depend on them
  when there is a single active biweekly session window.
- The backend keeps the rule-first scoring path, then uses the provider-neutral `LLM_*`
  contract for low-cost model assistance.

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

- `npm run dev` starts the API and the web preview server for engineering use.
- `npm run dev:api` starts only the Fastify API on `PORT` from `.env`.
- `npm run dev:web` starts only the Vite preview server and is not a phase-one delivery surface.
- `npm run build` compiles the API and frontend for release verification.
- `npm test` runs the Vitest suite.
- `npm run seed:demo` loads demo camp and member data into SQLite.
- `npm run bootstrap:feishu` creates or binds the Feishu test chat and Base schema.
