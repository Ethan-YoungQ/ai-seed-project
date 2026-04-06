# Pfizer HBU AI Bootcamp Evaluator

Production-oriented MVP for the Pfizer HBU AI bootcamp evaluation workflow.

## Scope

- Feishu real-time event ingest
- Biweekly session window aggregation
- Rule-first scoring with optional LLM assistance
- SQLite fact storage plus Feishu Base mirror
- Public ranking board and operator review console
- Bot announcements and board snapshots

## Submission Model

- The bootcamp now defaults to document-first submission.
- Learners are expected to send PDF or Word documents in the Feishu group.
- Homework tags remain supported for backward compatibility, but document uploads no longer require tags when there is a single active biweekly session window.

## Quick Start

- `npm install`
- `npm run dev`
- `npm test`
- `npm run build`

## Operational Docs

- [Feishu setup](./docs/feishu-setup.md)
- [Release runbook](./docs/release-runbook.md)
- [Smoke test checklist](./docs/release-smoke-tests.md)
- [Final acceptance on 2026-04-05](./docs/final-acceptance-2026-04-05.md)
- [Feishu thread handoff for 2026-04-05](./docs/feishu-thread-handoff-2026-04-05.md)

## Scripts

- `npm run dev` starts the API and web dev server together.
- `npm run dev:api` starts only the Fastify API on `PORT` from `.env`.
- `npm run dev:web` starts only the Vite frontend.
- `npm run build` compiles the API and frontend for release verification.
- `npm test` runs the Vitest suite.
- `npm run seed:demo` loads demo camp and member data into SQLite.
- `npm run bootstrap:feishu` creates or binds the Feishu test chat and Base schema.
