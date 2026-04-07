## Purpose

This handoff is for a fresh main development thread to continue the `phase-one-feishu` rollout after repeated session-level MCP loading failures.

The local implementation is complete. The only remaining work is cloud deployment and live acceptance, but the current and previous Codex sessions both failed to expose `aliyun-openapi` as a callable MCP capability even after the Aliyun plugin was repaired.

## Workspace

- Repo root: `D:\Vibe Coding Project\AI Seed Project`
- Active worktree: `D:\Vibe Coding Project\AI Seed Project\.worktrees\phase-one-feishu`
- Branch: `codex/phase-one-feishu`

## What is already finished

### Product / architecture

- Phase-one delivery surface is now Feishu-native:
  - learner entry in Feishu docs / knowledge base
  - ranking and ops views in Feishu Base
  - always-on backend on Aliyun
- Standalone web board and web admin are no longer phase-one acceptance targets.
- Provider-neutral `LLM_*` config has replaced the old OpenAI-specific contract.
- No-code operator flows are implemented with one-click local scripts and server bootstrap/deploy/check scripts.

### Local code status

The local codebase in `phase-one-feishu` is complete and verified.

Key files already in place:

- Ops bootstrap and deployment:
  - `scripts/ops/bootstrap-server.sh`
  - `scripts/ops/deploy-app.sh`
  - `scripts/ops/check-health.sh`
  - `scripts/ops/backup-db.sh`
  - `scripts/ops/windows-init.ps1`
  - `scripts/ops/windows-deploy.ps1`
  - `scripts/ops/windows-check.ps1`
  - `scripts/ops/mac-init.command`
  - `scripts/ops/mac-deploy.command`
  - `scripts/ops/mac-check.command`
- Service template:
  - `deploy/systemd/ai-seed-project.service`
- Feishu-native delivery and release docs:
  - `docs/release-runbook.md`
  - `docs/release-smoke-tests.md`
  - `docs/ops/aliyun-mcp-runbook.md`
  - `docs/ops/no-code-operator-guide.md`
- LLM and runtime fixes:
  - `src/services/llm/openai-compatible.ts`
  - `src/scripts/seed-demo.ts`

### Verification already completed

These were run successfully in the worktree:

- `npm.cmd test`
- `npm.cmd run build`
- `npm.cmd run seed:demo`

Most recent confirmation before this handoff:

- `git status --short --branch` returned a clean `codex/phase-one-feishu`
- `npm.cmd test` passed: 16 files, 60 tests
- `npm.cmd run build` passed

### Important recent commits

- `c560e0f docs: add aliyun session refresh handoff`
- `9eb1ee7 fix: finalize phase-one verification flow`
- `2dcdbb1 fix: harden no-code deployment scripts`
- `457791e feat: add phase one no-code ops entry points`
- `0316375 feat: complete feishu-native delivery surfaces`

## Current blocker

The blocker is not repository code. The blocker is still session-level MCP loading.

### Observed facts

In this session, after another full restart attempt:

- `functions.list_mcp_resources` still returns only `figma`
- `functions.list_mcp_resource_templates` still returns only `figma`
- no Aliyun MCP tools are exposed to the agent in the session tool surface

### Plugin state

The Aliyun plugin itself appears healthy.

Verified facts:

- plugin manifest exists and is coherent
- plugin `.mcp.json` contains `aliyun-openapi`
- defaults file exists and contains:
  - `serverName = aliyun-openapi`
  - `serverId = LQkTKNkU7uLWNiYC`
  - `sseEndpoint` configured
  - `regionId = cn-hangzhou`
- plugin self-check now returns `ok: true`

This strongly suggests:

- file-layer setup is fixed
- Codex session startup still does not import the Aliyun MCP server into the live tool registry

## What the next main thread should do first

### Step 1: Re-verify session MCP exposure

Before touching cloud deployment, verify whether the fresh thread can actually use `aliyun-openapi`.

If the new thread still only sees `figma`, do not waste another cycle trying to deploy through nonexistent MCP tools.

### Step 2: If `aliyun-openapi` is finally exposed

Proceed with real deployment and acceptance in this order:

1. inspect target Aliyun instance state
2. resolve instance id, because current plugin defaults still have:
   - `defaultInstanceId = null`
3. inspect public IP and security rules
4. run remote bootstrap
5. run remote deploy
6. run health checks
7. perform live Feishu acceptance
8. perform live domestic-model smoke

### Step 3: If `aliyun-openapi` is still not exposed

Escalate the investigation to session/plugin loading rather than app code.

Suggested decision point for the new thread:

- either fully solve Codex plugin-to-session MCP injection
- or consciously switch the deployment leg to SSH/manual server access, while clearly noting that this is no longer the intended MCP-first route

## Missing runtime inputs for live acceptance

The code is ready, but live acceptance still requires real values that are not committed:

- Feishu production app credentials
- Feishu Base production tokens / table ids
- learner/operator Feishu homepage tokens and URLs
- domestic-model API key and final chosen live model values
- actual Aliyun target instance selection

Do not write secrets into the repository.

## User preference / operating constraints

- All user-facing explanations and questions must be in Chinese.
- The user wants phase one to remain:
  - functionally complete
  - simple to operate
  - Feishu-native first
- The user explicitly prefers Aliyun MCP automation over manual cloud operations.
- If MCP remains unavailable, the thread must say so plainly instead of pretending deployment is happening.

## Recommended resume prompt

Use this in the new main thread:

`继续 phase-one-feishu。先验证 aliyun-openapi MCP 是否真的可调用；如果可用，直接做阿里云部署与验收；如果仍不可用，先定位 Codex 会话为什么没有把插件 MCP 注入进来，再决定是否切换到 SSH 兜底部署。`
