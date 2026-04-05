# Pfizer HBU AI Bootcamp Evaluator

Phase-1 MVP for the Pfizer HBU AI bootcamp evaluation workflow.

## Scope

- Feishu event ingest
- Biweekly session window aggregation
- Rule-first scoring with optional LLM assistance
- SQLite fact storage
- Operator-facing ranking dashboard

## Quick Start

- `npm install`
- `npm run dev`
- `npm test`
- `npm run build`

## Operational Docs

- [Feishu setup](./docs/feishu-setup.md)
- [Release runbook](./docs/release-runbook.md)
- [Smoke test checklist](./docs/release-smoke-tests.md)
- [Feishu thread handoff for 2026-04-05](./docs/feishu-thread-handoff-2026-04-05.md)

## Scripts

- `npm run dev` starts the API and web dev server together.
- `npm run dev:api` starts only the Fastify API on `PORT` from `.env`.
- `npm run dev:web` starts only the Vite frontend.
- `npm run build` compiles the API and frontend for release verification.
- `npm test` runs the Vitest suite.
- `npm run seed:demo` loads demo camp and member data into SQLite.
- `npm run bootstrap:feishu` creates or binds the Feishu test chat and Base schema.
