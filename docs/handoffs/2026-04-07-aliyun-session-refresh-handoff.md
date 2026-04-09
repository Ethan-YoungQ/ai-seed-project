## Context

- Workspace: `D:\Vibe Coding Project\AI Seed Project\.worktrees\phase-one-feishu`
- Branch: `codex/phase-one-feishu`
- Local implementation status: phase-one local code is complete and verified
- Remaining work: actual Aliyun deployment and live acceptance

## What is already done

- Local tests passed: `npm.cmd test`
- Local build passed: `npm.cmd run build`
- No-code ops scripts are present:
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
- `systemd` template is ready:
  - `deploy/systemd/ai-seed-project.service`
- Release docs are current:
  - `docs/release-runbook.md`
  - `docs/release-smoke-tests.md`

## Root cause of the current block

The Aliyun plugin files are healthy, but this Codex session did not load the new MCP server into session state.

Evidence gathered in this session:

- `functions.list_mcp_resources` still returns only `figma`
- `functions.list_mcp_resource_templates` still returns only `figma`
- `C:\Users\qiyon\.codex\config.toml` has:
  - plugin enabled: `[plugins."aliyun-ops@local-user-plugins"]`
  - but no live `mcp_servers.aliyun-openapi` entry in the current session snapshot
- Plugin files are present and coherent:
  - `C:\Users\qiyon\.codex\plugins\cache\local-user-plugins\aliyun-ops\local\.mcp.json`
  - `C:\Users\qiyon\.codex\plugins\cache\local-user-plugins\aliyun-ops\local\.codex-plugin\plugin.json`
- Defaults are configured:
  - server name: `aliyun-openapi`
  - control plane region: `cn-hangzhou`
  - region id: `cn-hangzhou`
  - default instance id: `null`
  - default domain: `null`

This means the blocker is session refresh, not repository code.

## Important note about plugin self-check

Running:

`node C:\Users\qiyon\.codex\plugins\cache\local-user-plugins\aliyun-ops\local\scripts\check-openapi-mcp.js`

returned `launcher.ok=false` with `spawnSync node EPERM`.

That result is not enough to conclude the plugin is broken. In this session it is consistent with sandbox / nested-process restrictions while the outer script itself still runs. The stronger signal is that the Codex session resource registry still exposes only `figma`.

## Exact next step after restart

1. Restart Codex so the session reloads plugin MCP definitions.
2. In the new session, first verify that `aliyun-openapi` is actually visible through MCP listing.
3. If visible, continue deployment from this workspace:
   - `D:\Vibe Coding Project\AI Seed Project\.worktrees\phase-one-feishu`
4. Before mutating cloud state, resolve:
   - target region: use `cn-hangzhou`
   - target instance id: still missing from plugin defaults, must be queried or supplied
5. Then continue with:
   - inspect instance state
   - inspect reachable public IP
   - inspect security rules
   - run remote bootstrap / deploy
   - run health checks

## Resume prompt

After restart, resume with:

`继续 phase-one-feishu，并使用 aliyun-openapi MCP 做阿里云部署与验收`
