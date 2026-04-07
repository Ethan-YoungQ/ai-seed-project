## Context

- Workspace: `D:\Vibe Coding Project\AI Seed Project\.worktrees\phase-one-feishu`
- Branch: `codex/phase-one-feishu`
- Current plan: `docs/superpowers/plans/2026-04-07-feishu-native-phase-one-implementation.md`
- Approved spec: `docs/superpowers/specs/2026-04-07-feishu-native-phase-one-design.md`
- User requirement update:
  - Feishu-related implementation should follow `feishu-automation`
  - Aliyun side should switch to the user-provided global MCP plugin once Codex restarts and `aliyun-openapi` is available

## Completed So Far

- Task 1 complete: phase-one scope/docs/env contract frozen
- Task 2 complete: submission model converted from window candidate aggregation to document-level attempts
- Task 3 complete: domestic/provider-neutral LLM routing landed
  - Explicit `LLM_PROVIDER=aliyun` keeps DashScope default base URL
  - Explicit `openai_compatible` remains supported
  - Missing `LLM_PROVIDER` no longer silently switches old environments to Aliyun
  - LLM failure still falls back to heuristic scoring, but now leaves `llm_fallback:<error>` trace in `llmReason`
- Task 3 verification that was personally rerun before interruption:
  - `npm.cmd test -- --run tests/services/llm/provider-config.test.ts tests/domain/scoring.test.ts tests/services/llm/qwen-score.test.ts tests/services/documents/extract-text-fallback.test.ts`
  - Result: 4 files, 13 tests, all passed

## Task 3 Commits

- `a5c65c130cde50164e276d8c22a06fc3fff61f34` `feat: route scoring through qwen defaults`
- `3a7043dbb080309570946fbdbda11f07cc34018c` `fix: preserve llm provider semantics`

## Current Interruption Point

Task 4 had started but was intentionally interrupted before review/verification because Aliyun MCP must be used after restart.

Current plan status:

- Task 4 `in_progress`
- Task 5 `pending`
- Task 6 `pending`

## Uncommitted Task 4 Working Tree Changes

At interruption time, the worktree had these modified files:

- `src/domain/ranking.ts`
- `src/domain/types.ts`
- `src/services/announcements/render-announcement.ts`
- `src/services/feishu/base-sync.ts`
- `src/services/feishu/bootstrap.ts`
- `src/services/feishu/client.ts`
- `src/services/feishu/config.ts`
- `tests/api/app.test.ts`
- `tests/services/feishu-base-sync.test.ts`
- `tests/services/feishu-bootstrap.test.ts`

`git diff --stat` at interruption showed:

- 10 files changed
- 271 insertions
- 26 deletions

Observed direction of the partial Task 4 work:

- `MemberProfile` was being extended with `displayName` and `avatarUrl`
- Ranking display was being switched from `member.name` to `member.displayName ?? member.name`
- `FeishuApiClient` was being extended with a `getMemberProfile()` capability
- `FeishuBaseSyncService` was being changed to:
  - fetch Feishu member profile
  - persist `displayName`/`avatarUrl` back into SQLite
  - sync `display_name` and `avatar_url` into Base
  - use display name in score sync rows
- `FeishuConfig` was being extended with phase-one entry links:
  - `learnerHomeUrl`
  - `operatorHomeUrl`
  - `leaderboardUrl`
- `tests/services/feishu-base-sync.test.ts` and `tests/services/feishu-bootstrap.test.ts` were being expanded to cover those fields
- `tests/api/app.test.ts` had partial edits for a `phaseOne` status payload

Important caution:

- This Task 4 work is not reviewed
- It is not verified
- It was not committed
- There is a likely encoding issue inside the uncommitted `tests/api/app.test.ts` change where one mocked extracted-text payload became mojibake-like text
- Resume by reviewing the working tree diff first, then either keep and finish it or discard/rebuild it with TDD

## Aliyun MCP State Provided By User

The user said the Aliyun MCP infrastructure is already prepared outside this repo:

- Global plugin exists under `C:\Users\qiyon\plugins\aliyun-ops`
- Registered in user-level marketplace
- Global MCP name to consume: `aliyun-openapi`
- Repo-side consumption doc: `D:\Vibe Coding Project\AI Seed Project\docs\aliyun-mcp-consumption.md`

User-provided activation steps for after the official Aliyun OpenAPI MCP Server is created:

```powershell
node C:\Users\qiyon\plugins\aliyun-ops\scripts\setup-openapi-mcp.js `
  --server-name aliyun-openapi `
  --sse-endpoint "https://<your-sse-endpoint>" `
  --region-id "cn-hangzhou" `
  --default-instance-id "i-xxxxxxxx" `
  --default-domain "example.com"
```

Then restart Codex and check with:

```powershell
node C:\Users\qiyon\plugins\aliyun-ops\scripts\check-openapi-mcp.js
```

## Recommended Resume Order After Restart

1. Confirm `aliyun-openapi` MCP is visible in the new Codex session
2. Re-open this worktree:
   - `D:\Vibe Coding Project\AI Seed Project\.worktrees\phase-one-feishu`
3. Inspect current Task 4 diff before changing anything:
   - `git status --short --branch`
   - `git diff --stat`
   - focused diff review on the 10 Task 4 files above
4. Continue Task 4 under the same phase-one plan:
   - keep `feishu-automation` in scope
   - do not start Task 5 yet
5. Before claiming Task 4 complete:
   - run Task 4 target tests
   - perform spec review
   - perform code-quality review

## Suggested First Commands After Restart

```powershell
cd "D:\Vibe Coding Project\AI Seed Project\.worktrees\phase-one-feishu"
git status --short --branch
git diff --stat
```

Then review:

```powershell
git diff -- src/services/feishu/base-sync.ts src/services/feishu/client.ts src/services/feishu/config.ts src/services/feishu/bootstrap.ts tests/services/feishu-base-sync.test.ts tests/services/feishu-bootstrap.test.ts tests/api/app.test.ts src/domain/types.ts src/domain/ranking.ts src/services/announcements/render-announcement.ts
```

## Note

The user also mentioned there is an unrelated pre-existing change in `tests/config/load-env.test.ts` from the separate Aliyun MCP setup thread. That file was not touched in this execution thread.
