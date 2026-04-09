# AI Seed Project Overall Completion Roadmap

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 基于现有一期实现、设计文档和交接文档，完成项目从“本地已实现”到“飞书原生一期正式上线并可持续演进”的完整闭环。

**Architecture:** 一期正式交付形态固定为“飞书原生交付面 + 阿里云常驻后端 + SQLite 事实源 + 飞书 Base 展示与运营协作层”。独立 Web 公共榜单和 `/operator` 管理面保留为工程与后续阶段资产，不作为一期签收面。

**Tech Stack:** Fastify, TypeScript, SQLite, Vitest, Feishu OpenAPI, Feishu Base, 阿里云轻量应用服务器或 ECS, OpenAI-compatible LLM adapter, Qwen text/file models.

---

## Source of truth

- 设计基线：`docs/superpowers/specs/2026-04-07-feishu-native-phase-one-design.md`
- 一期实现计划：`docs/superpowers/plans/2026-04-07-feishu-native-phase-one-implementation.md`
- 执行承接计划：`docs/superpowers/plans/2026-04-06-project-continuation-execution.md`
- 最新交接：`docs/handoffs/2026-04-07-main-thread-resume-handoff.md`

## Current status

- [x] 一期本地代码已完成并通过本地测试与构建
- [x] 飞书配置链路已打通，`/api/feishu/status` 和 `send-test` 已本机验证
- [x] 飞书入口文档与 Base 交付面已建立
- [x] provider-neutral `LLM_*` 配置契约已替代旧 OpenAI 示例契约
- [x] 本地无代码运维脚本与服务器 bootstrap / deploy / check 脚本已落地
- [ ] 云侧目标实例仍未明确或未完成部署
- [ ] 真实飞书群提交流程尚未完成正式验收
- [ ] 真实国产模型评分链路尚未完成正式验收
- [ ] 一期上线签收尚未完成

## Phase 1 completion plan

### Task 1: Lock the phase-one contract

**Files:**
- Verify: `README.md`
- Verify: `docs/feishu-setup.md`
- Verify: `docs/release-runbook.md`
- Verify: `docs/release-smoke-tests.md`
- Verify: `docs/ops/no-code-operator-guide.md`

- [ ] **Step 1: Reconfirm the delivery boundary**

Confirm all phase-one docs consistently state:
- learner entry is Feishu doc / knowledge-base homepage
- ranking and ops views live in Feishu Base
- Aliyun backend is the only always-on runtime
- standalone web UI is not a phase-one sign-off target

- [ ] **Step 2: Reconfirm runtime contract**

Confirm the active runtime contract includes:
- `FEISHU_APP_ID`
- `FEISHU_APP_SECRET`
- `FEISHU_EVENT_MODE=long_connection`
- `FEISHU_BASE_*`
- `FEISHU_LEARNER_HOME_URL`
- `FEISHU_OPERATOR_HOME_URL`
- `FEISHU_LEADERBOARD_URL`
- `LLM_*`

- [ ] **Step 3: Reconfirm local verification baseline**

Run:

```bash
npm.cmd test
npm.cmd run build
```

Expected:
- all tests pass
- build passes

### Task 2: Finish cloud environment discovery

**Files:**
- Verify: `docs/ops/aliyun-mcp-runbook.md`
- Reference: `docs/handoffs/2026-04-07-main-thread-resume-handoff.md`

- [ ] **Step 1: Confirm current session can use Aliyun tools**

Verify the live session can actually call Aliyun OpenAPI capabilities before planning around them.

Expected:
- either Aliyun tools are exposed and callable
- or the session explicitly confirms they are not available

- [ ] **Step 2: Resolve the real target instance**

If Aliyun tools are available, enumerate:
- instance id
- region
- public ip
- security group or firewall exposure
- current running status

Expected:
- exactly one phase-one deployment target is identified

- [ ] **Step 3: Choose fallback only if MCP is unavailable**

If the session still cannot use Aliyun tools, formally choose one fallback:
- SSH/manual cloud shell deployment
- Cloud Assistant execution

Expected:
- fallback is explicit rather than implicit

### Task 3: Complete server bootstrap and deployment

**Files:**
- Execute: `scripts/ops/bootstrap-server.sh`
- Execute: `scripts/ops/deploy-app.sh`
- Execute: `scripts/ops/check-health.sh`
- Verify: `deploy/systemd/ai-seed-project.service`

- [ ] **Step 1: Bootstrap the server**

Provision:
- app directory
- logs directory
- data directory
- Node runtime
- systemd service

- [ ] **Step 2: Deploy the current worktree build**

Deploy the code from:
- `D:\Vibe Coding Project\AI Seed Project\.worktrees\phase-one-feishu`

Expected:
- service files in place
- dependencies installed
- app build deployed

- [ ] **Step 3: Start and verify the service**

Check:

```bash
systemctl status ai-seed-project
journalctl -u ai-seed-project -n 100 --no-pager
curl http://127.0.0.1:<PORT>/api/health
curl http://127.0.0.1:<PORT>/api/feishu/status
```

Expected:
- service is active
- health endpoint returns `ok: true`
- feishu status endpoint returns a coherent readiness payload

### Task 4: Complete real Feishu acceptance

**Files:**
- Verify: `docs/feishu-setup.md`
- Verify: `docs/release-smoke-tests.md`

- [ ] **Step 1: Validate bot messaging**

Run:

```bash
POST /api/feishu/send-test
```

Expected:
- test message arrives in the target Feishu chat

- [ ] **Step 2: Validate real document submissions**

Submit at least:
- one valid PDF
- one valid DOCX
- one parsing-edge-case document

Expected:
- inbound event accepted
- raw event stored
- attempt created
- session result updated

- [ ] **Step 3: Validate Feishu-native delivery surfaces**

Confirm:
- learner homepage opens correctly
- operator homepage opens correctly
- leaderboard URL resolves correctly
- Base views show the latest records

Expected:
- a non-technical operator can complete the core workflow entirely inside Feishu

### Task 5: Complete real LLM acceptance

**Files:**
- Verify runtime `.env` only, do not commit secrets
- Reference: `src/services/llm/openai-compatible.ts`
- Reference: `src/services/llm/qwen-score.ts`

- [ ] **Step 1: Confirm live model configuration is present**

Required runtime keys:
- `LLM_ENABLED=true`
- `LLM_PROVIDER`
- `LLM_BASE_URL`
- `LLM_API_KEY`
- `LLM_TEXT_MODEL`
- `LLM_FILE_MODEL`

- [ ] **Step 2: Verify text-model scoring path**

Use a normal parseable submission.

Expected:
- process and quality scores come from the configured text model path

- [ ] **Step 3: Verify file-model fallback path**

Use a submission that forces document fallback.

Expected:
- fallback path is triggered
- system does not silently drop the submission

- [ ] **Step 4: Verify persistence**

Confirm the LLM-backed result appears in:
- SQLite
- Feishu Base mirrored records
- ranking/session result views when applicable

### Task 6: Close phase-one release

**Files:**
- Update if needed: `docs/release-runbook.md`
- Update if needed: `docs/release-smoke-tests.md`
- Update if needed: `docs/handoffs/2026-04-07-main-thread-resume-handoff.md`

- [ ] **Step 1: Record final deployment facts**

Capture:
- deployed region
- deployed host
- service name
- health-check path
- active release commit

- [ ] **Step 2: Record acceptance evidence**

Capture:
- health check result
- bot send result
- PDF acceptance result
- DOCX acceptance result
- Base mirror verification
- leaderboard verification

- [ ] **Step 3: Freeze the operational path**

The final operator path must be:
- learner uses Feishu homepage and group only
- operator uses Feishu Base and homepage only
- owner uses one-click local ops scripts plus cloud deployment runbook only

## Post-phase roadmap

### Phase 2

- 独立 Web 公共榜单重构为增强型展示层
- 增加更强的管理视图和复盘分析
- 补充更精细的成员轨迹与周期对比

### Phase 3

- 正式公网产品化部署
- 域名与 HTTPS
- 更完整的权限系统与多环境发布体系

## Exit criteria

- [ ] 云侧实例明确且服务运行稳定
- [ ] 健康检查通过
- [ ] 飞书状态检查通过
- [ ] Bot 发信通过
- [ ] PDF 提交验收通过
- [ ] DOCX 提交验收通过
- [ ] 文档兜底链路验收通过
- [ ] Base 镜像验收通过
- [ ] learner/operator 入口验收通过
- [ ] 国产模型实测验收通过
- [ ] 发布文档与运维文档与线上事实一致
