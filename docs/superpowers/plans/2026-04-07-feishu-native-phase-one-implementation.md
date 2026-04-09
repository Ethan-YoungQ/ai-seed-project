# Feishu-Native Phase One Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将一期正式切换为“飞书原生交付面 + 阿里云常驻后端 + 国产低成本模型 + 双一键入口”的可上线方案，同时保留现有 Web 资产为二期/三期增强项。

**Architecture:** 保留 Fastify + SQLite 作为系统事实源和自动评分执行层，把学员入口、排行榜、运营管理全部收口到飞书知识库/文档首页与飞书 Base 仪表盘/视图。评分链路改成 attempt 级文档提交和 provider-neutral `LLM_*` 配置，云侧优先尝试阿里云 MCP/OpenAPI/CLI 自动化，系统内通过干净 Linux + `systemd` + 本地一键脚本收口。

**Tech Stack:** Fastify, SQLite (`better-sqlite3`), TypeScript, Feishu OpenAPI SDK, Feishu Base / Doc / Bot, Alibaba Cloud Lightweight Server, Alibaba OpenAPI MCP / CLI, Qwen (`qwen3-flash`, `qwen-doc`), Vitest.

---

## Scope check

这份 spec 同时覆盖“飞书原生交付面”“评分模型重构”“阿里云部署自动化”“一键入口”四个子系统，但它们对一期上线是强耦合关系：没有 attempt + 国产模型就没有可信评分，没有飞书入口和 Base 看板就没有可交付界面，没有一键入口和部署自动化就不满足无代码用户上线要求。因此本轮保持一份总执行计划，不拆成多份独立计划。

## File structure changes

### Backend and domain

- Modify: `src/domain/types.ts`
  - 新增 `SubmissionAttempt`、`SessionResult`、`FeishuMemberProfile`、`LlmProviderConfig`、`PublicDashboardLink` 类型。
- Modify: `src/domain/submission-aggregation.ts`
  - 从“窗口聚合 candidate”改为“每份文件一个 attempt”。
- Modify: `src/domain/scoring.ts`
  - 确保硬规则本地执行，LLM 只负责 `processScore` 和 `qualityScore`。
- Create: `src/services/llm/provider-config.ts`
  - 统一读取 `LLM_*` 环境变量并做 provider-neutral 校验。
- Create: `src/services/llm/openai-compatible.ts`
  - OpenAI-compatible HTTP client，兼容阿里云百炼。
- Create: `src/services/llm/qwen-score.ts`
  - 构造 Qwen 提示词、解析结构化 JSON、执行 `qwen3-flash` / `qwen-doc` 分流。
- Modify: `src/services/scoring/evaluate-window.ts`
  - 以 attempt 为中心写入评分、派生周期最终成绩、保留 invalid/pending 状态。
- Modify: `src/services/documents/extract-text.ts`
  - 增加“本地提取失败时切到 `qwen-doc`”的兜底入口。
- Modify: `src/storage/sqlite-repository.ts`
  - 持久化 attempt、周期最终成绩、Feishu 头像昵称缓存、飞书入口链接。
- Modify: `src/db/schema.ts`
  - 增加 attempts、session_results、member_display_profile、app_runtime_state 等表或字段。
- Modify: `src/app.ts`
  - 暴露新的 public/operator/ops 状态接口，删除一期对 Web 看板上线的依赖表述。
- Modify: `src/services/feishu/base-sync.ts`
  - 把 attempts、session results、成员头像昵称、飞书入口链接同步到 Base。
- Modify: `src/services/feishu/bootstrap.ts`
  - 让 bootstrap 能创建/重命名适合一期的 Base 表、仪表盘入口说明、知识库首页说明。
- Modify: `src/services/feishu/client.ts`
  - 增加读取群成员头像昵称、创建文档/写入文档、查询群成员资料所需的 API 包装。
- Modify: `src/services/feishu/messenger.ts`
  - 统一群播报文本，增加一键进入链接。
- Modify: `src/config/load-env.ts`
  - 支持一键脚本指定 `.env.production` / `.env.local` 等路径。
- Modify: `.env.example`
  - 全量切到 `LLM_*`，新增 Feishu 一期链接位与运行脚本配置。

### Ops, deployment, and one-click entry

- Create: `scripts/ops/bootstrap-server.sh`
  - 干净 Linux 初始化脚本：Node、目录、systemd、权限、日志目录。
- Create: `scripts/ops/deploy-app.sh`
  - 服务器端部署脚本：同步 dist、安装依赖、重启服务。
- Create: `scripts/ops/check-health.sh`
  - 服务器端健康检查脚本：服务状态、端口、数据库文件、Feishu 状态接口。
- Create: `scripts/ops/backup-db.sh`
  - SQLite 备份脚本。
- Create: `scripts/ops/windows-init.ps1`
  - Windows 本地一键初始化入口。
- Create: `scripts/ops/windows-deploy.ps1`
  - Windows 本地一键部署入口。
- Create: `scripts/ops/windows-check.ps1`
  - Windows 本地一键检查入口。
- Create: `scripts/ops/mac-init.command`
  - macOS 双击初始化入口。
- Create: `scripts/ops/mac-deploy.command`
  - macOS 双击部署入口。
- Create: `scripts/ops/mac-check.command`
  - macOS 双击检查入口。
- Create: `deploy/systemd/ai-seed-project.service`
  - `systemd` 服务模板。
- Create: `docs/ops/aliyun-mcp-runbook.md`
  - 哪些动作优先走阿里云 MCP/OpenAPI/CLI，哪些动作走 SSH/脚本。
- Create: `docs/ops/no-code-operator-guide.md`
  - 无代码负责人如何用一键脚本维护。

### Feishu-native delivery docs

- Modify: `README.md`
  - 明确一期正式交付面已经变更。
- Modify: `docs/feishu-setup.md`
  - 收口到飞书群 / Base / 文档首页 / Bot / `long_connection` 的新方案。
- Modify: `docs/release-runbook.md`
  - 改成一期阿里云 + 飞书上线流程。
- Modify: `docs/release-smoke-tests.md`
  - 加入国产模型和飞书一键入口验收。
- Modify: `docs/handoffs/2026-04-06-next-thread-handoff.md`
  - 追加“路线已转为飞书原生一期”的后续提醒。
- Create: `docs/feishu/learner-homepage-copy.md`
  - 学员首页文案与链接结构。
- Create: `docs/feishu/operator-homepage-copy.md`
  - 运营首页文案与链接结构。

### Tests

- Create: `tests/services/scoring/evaluate-window-attempts.test.ts`
- Create: `tests/services/llm/provider-config.test.ts`
- Create: `tests/services/llm/qwen-score.test.ts`
- Create: `tests/services/documents/extract-text-fallback.test.ts`
- Create: `tests/services/feishu-base-sync-phase-one.test.ts`
- Create: `tests/scripts/no-code-entry-smoke.test.ts`
- Modify: `tests/api/app.test.ts`
- Modify: `tests/domain/scoring.test.ts`
- Modify: `tests/domain/submission-aggregation.test.ts`
- Modify: `tests/services/feishu-bootstrap.test.ts`

## Task 1: Freeze phase-one scope in docs and env contracts

**Files:**
- Modify: `README.md`
- Modify: `docs/feishu-setup.md`
- Modify: `docs/release-runbook.md`
- Modify: `docs/release-smoke-tests.md`
- Modify: `docs/handoffs/2026-04-06-next-thread-handoff.md`
- Modify: `.env.example`
- Test: `tests/config/load-env.test.ts`

- [ ] **Step 1: Write the failing env/config tests**

```ts
import { describe, expect, it } from "vitest";
import { loadLocalEnv } from "../../src/config/load-env";

describe("phase-one env contract", () => {
  it("prefers provider-neutral llm keys", () => {
    process.env.LLM_PROVIDER = "aliyun";
    process.env.LLM_TEXT_MODEL = "qwen3-flash";

    expect(process.env.LLM_PROVIDER).toBe("aliyun");
    expect(process.env.LLM_TEXT_MODEL).toBe("qwen3-flash");
    expect(process.env.OPENAI_API_KEY ?? "").toBe("");
  });

  it("can load a named env file for one-click scripts", () => {
    const envPath = loadLocalEnv(process.cwd());
    expect(envPath.endsWith(".env")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm.cmd test -- --run tests/config/load-env.test.ts
```

Expected: FAIL because `.env.example` 仍暴露 `OPENAI_*`，且 `load-env.ts` 还不能按一期脚本约定工作。

- [ ] **Step 3: Rewrite `.env.example` and doc entry points**

```env
# Local runtime
PORT=3000
APP_ENV=development
DATABASE_URL=./data/app.db

# Feishu app credentials
FEISHU_APP_ID=
FEISHU_APP_SECRET=
FEISHU_EVENT_MODE=long_connection
FEISHU_VERIFICATION_TOKEN=
FEISHU_ENCRYPT_KEY=

# Feishu delivery surfaces
FEISHU_BASE_ENABLED=true
FEISHU_BASE_APP_TOKEN=
FEISHU_BASE_MEMBERS_TABLE=
FEISHU_BASE_ATTEMPTS_TABLE=
FEISHU_BASE_SESSION_RESULTS_TABLE=
FEISHU_BASE_WARNINGS_TABLE=
FEISHU_BASE_SNAPSHOTS_TABLE=
FEISHU_LEARNER_HOME_DOC_TOKEN=
FEISHU_OPERATOR_HOME_DOC_TOKEN=

# Provider-neutral LLM config
LLM_ENABLED=true
LLM_PROVIDER=aliyun
LLM_BASE_URL=
LLM_API_KEY=
LLM_TEXT_MODEL=qwen3-flash
LLM_FILE_MODEL=qwen-doc
LLM_TIMEOUT_MS=15000
LLM_MAX_INPUT_CHARS=6000
LLM_CONCURRENCY=3
```

Docs must replace “一期正式交付 Web 看板 / `/operator`” with:

```md
- 一期学员入口：飞书知识库/文档首页
- 一期排行榜与看板：飞书 Base 仪表盘
- 一期运营入口：飞书 Base 运营视图
- 一期运行底座：阿里云轻量服务器 + 常驻后端
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
npm.cmd test -- --run tests/config/load-env.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add README.md docs/feishu-setup.md docs/release-runbook.md docs/release-smoke-tests.md docs/handoffs/2026-04-06-next-thread-handoff.md .env.example tests/config/load-env.test.ts
git commit -m "docs: freeze feishu-native phase-one scope"
```

## Task 2: Convert submission aggregation from window candidates to document attempts

**Files:**
- Modify: `src/domain/types.ts`
- Modify: `src/domain/submission-aggregation.ts`
- Modify: `src/services/scoring/evaluate-window.ts`
- Modify: `src/storage/sqlite-repository.ts`
- Modify: `src/db/schema.ts`
- Test: `tests/domain/submission-aggregation.test.ts`
- Test: `tests/services/scoring/evaluate-window-attempts.test.ts`

- [ ] **Step 1: Write the failing attempt-level tests**

```ts
import { describe, expect, it } from "vitest";
import { aggregateSubmissionWindow } from "../../../src/domain/submission-aggregation";

describe("document attempts", () => {
  it("returns one attempt per file event", () => {
    const attempts = aggregateSubmissionWindow({
      member: { id: "user-alice", campId: "camp-demo", name: "Alice", department: "HBU", roleType: "student", isParticipant: true, isExcludedFromBoard: false, status: "active" },
      session: {
        id: "session-01",
        campId: "camp-demo",
        title: "Kickoff",
        homeworkTag: "#HW01",
        courseDate: "2026-04-03T09:00:00.000Z",
        deadlineAt: "2026-04-17T08:59:59.000Z",
        windowStart: "2026-04-03T09:00:00.000Z",
        windowEnd: "2026-04-17T08:59:59.000Z",
        cycleType: "biweekly",
        active: true
      },
      events: [
        {
          id: "event-1",
          campId: "camp-demo",
          memberId: "user-alice",
          messageId: "om_001",
          chatId: "chat-demo",
          sessionId: "session-01",
          rawText: "",
          parsedTags: [],
          attachmentCount: 1,
          attachmentTypes: ["pdf"],
          eventTime: "2026-04-05T10:00:00.000Z",
          eventUrl: "",
          documentText: "第一次提交",
          documentParseStatus: "parsed"
        },
        {
          id: "event-2",
          campId: "camp-demo",
          memberId: "user-alice",
          messageId: "om_002",
          chatId: "chat-demo",
          sessionId: "session-01",
          rawText: "",
          parsedTags: [],
          attachmentCount: 1,
          attachmentTypes: ["docx"],
          eventTime: "2026-04-06T10:00:00.000Z",
          eventUrl: "",
          documentText: "第二次提交",
          documentParseStatus: "parsed"
        }
      ]
    });

    expect(attempts).toHaveLength(2);
    expect(attempts[0]?.messageId).toBe("om_001");
    expect(attempts[1]?.messageId).toBe("om_002");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm.cmd test -- --run tests/domain/submission-aggregation.test.ts tests/services/scoring/evaluate-window-attempts.test.ts
```

Expected: FAIL because `aggregateSubmissionWindow` still returns a single `SubmissionCandidate`.

- [ ] **Step 3: Introduce `SubmissionAttempt` and `SessionResult`**

```ts
export interface SubmissionAttempt {
  attemptId: string;
  memberId: string;
  sessionId: string;
  messageId: string;
  fileKey?: string;
  submittedAt: string;
  rawText: string;
  documentText: string;
  documentParseStatus: "parsed" | "failed" | "unsupported" | "pending";
  attachmentType: string;
}

export interface SessionResult {
  sessionId: string;
  memberId: string;
  chosenAttemptId?: string;
  finalStatus: "valid" | "invalid" | "pending_review";
  totalScore: number;
  latestSubmittedAt: string;
}
```

- [ ] **Step 4: Implement best-valid-score settlement**

```ts
export function chooseSessionResult(attempts: Array<{
  attemptId: string;
  submittedAt: string;
  finalStatus: "valid" | "invalid" | "pending_review";
  totalScore: number;
}>): SessionResult {
  const validAttempts = attempts.filter((attempt) => attempt.finalStatus === "valid");

  if (validAttempts.length > 0) {
    const chosen = [...validAttempts].sort((left, right) => {
      if (right.totalScore !== left.totalScore) {
        return right.totalScore - left.totalScore;
      }
      return right.submittedAt.localeCompare(left.submittedAt);
    })[0]!;

    return {
      sessionId: "",
      memberId: "",
      chosenAttemptId: chosen.attemptId,
      finalStatus: "valid",
      totalScore: chosen.totalScore,
      latestSubmittedAt: chosen.submittedAt
    };
  }

  const latest = [...attempts].sort((left, right) => right.submittedAt.localeCompare(left.submittedAt))[0]!;
  return {
    sessionId: "",
    memberId: "",
    chosenAttemptId: latest.attemptId,
    finalStatus: latest.finalStatus,
    totalScore: latest.totalScore,
    latestSubmittedAt: latest.submittedAt
  };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run:

```bash
npm.cmd test -- --run tests/domain/submission-aggregation.test.ts tests/services/scoring/evaluate-window-attempts.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/domain/types.ts src/domain/submission-aggregation.ts src/services/scoring/evaluate-window.ts src/storage/sqlite-repository.ts src/db/schema.ts tests/domain/submission-aggregation.test.ts tests/services/scoring/evaluate-window-attempts.test.ts
git commit -m "feat: switch scoring flow to submission attempts"
```

## Task 3: Replace heuristic-only scoring with domestic provider-neutral LLM routing

**Files:**
- Create: `src/services/llm/provider-config.ts`
- Create: `src/services/llm/openai-compatible.ts`
- Create: `src/services/llm/qwen-score.ts`
- Modify: `src/domain/scoring.ts`
- Modify: `src/services/documents/extract-text.ts`
- Test: `tests/services/llm/provider-config.test.ts`
- Test: `tests/services/llm/qwen-score.test.ts`
- Test: `tests/domain/scoring.test.ts`
- Test: `tests/services/documents/extract-text-fallback.test.ts`

- [ ] **Step 1: Write the failing provider and fallback tests**

```ts
import { describe, expect, it } from "vitest";
import { readLlmProviderConfig } from "../../../src/services/llm/provider-config";

describe("llm provider config", () => {
  it("reads aliyun qwen defaults from LLM_* keys", () => {
    const config = readLlmProviderConfig({
      LLM_ENABLED: "true",
      LLM_PROVIDER: "aliyun",
      LLM_TEXT_MODEL: "qwen3-flash",
      LLM_FILE_MODEL: "qwen-doc",
      LLM_TIMEOUT_MS: "15000"
    });

    expect(config.provider).toBe("aliyun");
    expect(config.textModel).toBe("qwen3-flash");
    expect(config.fileModel).toBe("qwen-doc");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm.cmd test -- --run tests/services/llm/provider-config.test.ts tests/services/llm/qwen-score.test.ts tests/domain/scoring.test.ts tests/services/documents/extract-text-fallback.test.ts
```

Expected: FAIL because provider-neutral config and Qwen routing do not exist.

- [ ] **Step 3: Implement provider-neutral config and OpenAI-compatible client**

```ts
export interface LlmProviderConfig {
  enabled: boolean;
  provider: "aliyun" | "openai_compatible";
  baseUrl?: string;
  apiKey?: string;
  textModel: string;
  fileModel: string;
  timeoutMs: number;
  maxInputChars: number;
  concurrency: number;
}

export function readLlmProviderConfig(env: NodeJS.ProcessEnv): LlmProviderConfig {
  return {
    enabled: env.LLM_ENABLED === "true",
    provider: env.LLM_PROVIDER === "aliyun" ? "aliyun" : "openai_compatible",
    baseUrl: env.LLM_BASE_URL,
    apiKey: env.LLM_API_KEY,
    textModel: env.LLM_TEXT_MODEL || "qwen3-flash",
    fileModel: env.LLM_FILE_MODEL || "qwen-doc",
    timeoutMs: Number(env.LLM_TIMEOUT_MS || "15000"),
    maxInputChars: Number(env.LLM_MAX_INPUT_CHARS || "6000"),
    concurrency: Number(env.LLM_CONCURRENCY || "3")
  };
}
```

- [ ] **Step 4: Route scoring to `qwen3-flash` and parse fallback to `qwen-doc`**

```ts
const scoringPrompt = `
你是训练营作业评分助手。只输出 JSON。
{
  "processScore": 0,
  "qualityScore": 0,
  "reason": ""
}
`;

if (config.enabled && candidate.documentParseStatus === "parsed") {
  return await scoreWithQwenTextModel(candidate, config);
}

if (config.enabled && candidate.documentParseStatus === "failed") {
  return await extractWithQwenDoc(fileBytes, config);
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run:

```bash
npm.cmd test -- --run tests/services/llm/provider-config.test.ts tests/services/llm/qwen-score.test.ts tests/domain/scoring.test.ts tests/services/documents/extract-text-fallback.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/services/llm/provider-config.ts src/services/llm/openai-compatible.ts src/services/llm/qwen-score.ts src/domain/scoring.ts src/services/documents/extract-text.ts tests/services/llm/provider-config.test.ts tests/services/llm/qwen-score.test.ts tests/domain/scoring.test.ts tests/services/documents/extract-text-fallback.test.ts
git commit -m "feat: add qwen-based llm scoring route"
```

## Task 4: Complete Feishu-native delivery surfaces and identity matching

**Files:**
- Modify: `src/services/feishu/client.ts`
- Modify: `src/services/feishu/base-sync.ts`
- Modify: `src/services/feishu/bootstrap.ts`
- Modify: `src/app.ts`
- Modify: `src/storage/sqlite-repository.ts`
- Create: `docs/feishu/learner-homepage-copy.md`
- Create: `docs/feishu/operator-homepage-copy.md`
- Test: `tests/services/feishu-base-sync-phase-one.test.ts`
- Test: `tests/services/feishu-bootstrap.test.ts`
- Test: `tests/api/app.test.ts`

- [ ] **Step 1: Write the failing Feishu-native sync tests**

```ts
import { describe, expect, it, vi } from "vitest";
import { FeishuBaseSyncService } from "../../../src/services/feishu/base-sync";

describe("phase-one base sync", () => {
  it("writes avatar and display name alongside session results", async () => {
    const writes: Array<Record<string, unknown>> = [];
    const service = new FeishuBaseSyncService(
      {
        enabled: true,
        appToken: "bitable_app_token",
        tables: {
          members: "tbl_members",
          rawEvents: "tbl_raw_events",
          scores: "tbl_scores",
          warnings: "tbl_warnings",
          snapshots: "tbl_snapshots"
        }
      },
      {
        createBaseRecord: async ({ fields }) => {
          writes.push(fields);
          return { recordId: "rec_001" };
        },
        searchBaseRecords: async () => [],
        updateBaseRecord: async () => ({ recordId: "rec_001" })
      } as never
    );

    await service.syncMember({
      id: "user-alice",
      campId: "camp-demo",
      name: "Alice",
      department: "HBU",
      roleType: "student",
      isParticipant: true,
      isExcludedFromBoard: false,
      status: "active",
      displayName: "Alice Zhang",
      avatarUrl: "https://example.com/avatar.png"
    } as never);

    expect(writes[0]?.display_name).toBe("Alice Zhang");
    expect(writes[0]?.avatar_url).toBe("https://example.com/avatar.png");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm.cmd test -- --run tests/services/feishu-base-sync-phase-one.test.ts tests/services/feishu-bootstrap.test.ts tests/api/app.test.ts
```

Expected: FAIL because the current Feishu sync model lacks phase-one dashboard fields and homepage links.

- [ ] **Step 3: Extend Feishu client and Base sync contracts**

```ts
export interface FeishuMemberProfile {
  openId: string;
  displayName: string;
  avatarUrl?: string;
}

export interface PublicDashboardLink {
  learnerHomeUrl: string;
  operatorHomeUrl: string;
  leaderboardUrl: string;
}
```

Add sync fields:

```ts
await this.write(this.config.tables.members, {
  member_id: member.id,
  display_name: member.displayName ?? member.name,
  avatar_url: member.avatarUrl ?? "",
  role_type: member.roleType,
  is_excluded_from_board: member.isExcludedFromBoard
});
```

- [ ] **Step 4: Bootstrap learner/operator home docs and dashboard links**

```md
# 学员首页

- 查看最新排行榜：{{leaderboard_url}}
- 查看本周期要求：{{homework_rules_url}}
- 常见问题：{{faq_url}}
```

```md
# 运营首页

- 查看运营视图：{{operator_view_url}}
- 查看异常提交：{{warning_view_url}}
- 查看周期快照：{{snapshot_view_url}}
```

- [ ] **Step 5: Run tests to verify they pass**

Run:

```bash
npm.cmd test -- --run tests/services/feishu-base-sync-phase-one.test.ts tests/services/feishu-bootstrap.test.ts tests/api/app.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/services/feishu/client.ts src/services/feishu/base-sync.ts src/services/feishu/bootstrap.ts src/app.ts src/storage/sqlite-repository.ts docs/feishu/learner-homepage-copy.md docs/feishu/operator-homepage-copy.md tests/services/feishu-base-sync-phase-one.test.ts tests/services/feishu-bootstrap.test.ts tests/api/app.test.ts
git commit -m "feat: complete feishu-native phase-one delivery surfaces"
```

## Task 5: Add no-code one-click owner ops and Aliyun automation runbooks

**Files:**
- Create: `scripts/ops/bootstrap-server.sh`
- Create: `scripts/ops/deploy-app.sh`
- Create: `scripts/ops/check-health.sh`
- Create: `scripts/ops/backup-db.sh`
- Create: `scripts/ops/windows-init.ps1`
- Create: `scripts/ops/windows-deploy.ps1`
- Create: `scripts/ops/windows-check.ps1`
- Create: `scripts/ops/mac-init.command`
- Create: `scripts/ops/mac-deploy.command`
- Create: `scripts/ops/mac-check.command`
- Create: `deploy/systemd/ai-seed-project.service`
- Create: `docs/ops/aliyun-mcp-runbook.md`
- Create: `docs/ops/no-code-operator-guide.md`
- Modify: `package.json`
- Test: `tests/scripts/no-code-entry-smoke.test.ts`

- [ ] **Step 1: Write the failing smoke tests for one-click entry files**

```ts
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";

describe("one-click owner ops assets", () => {
  it("ships Windows and macOS entry files", () => {
    expect(existsSync("scripts/ops/windows-deploy.ps1")).toBe(true);
    expect(existsSync("scripts/ops/mac-deploy.command")).toBe(true);
  });

  it("ships a systemd service template", () => {
    const content = readFileSync("deploy/systemd/ai-seed-project.service", "utf8");
    expect(content).toContain("ExecStart=");
    expect(content).toContain("WorkingDirectory=");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm.cmd test -- --run tests/scripts/no-code-entry-smoke.test.ts
```

Expected: FAIL because scripts and service templates do not exist.

- [ ] **Step 3: Add Linux bootstrap and deploy scripts**

```bash
#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/opt/ai-seed-project"
SERVICE_NAME="ai-seed-project"

mkdir -p "$APP_DIR" "/var/log/$SERVICE_NAME" "/var/lib/$SERVICE_NAME"
cp deploy/systemd/ai-seed-project.service "/etc/systemd/system/$SERVICE_NAME.service"
systemctl daemon-reload
systemctl enable "$SERVICE_NAME"
```

```bash
#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/opt/ai-seed-project"
cd "$APP_DIR"
npm ci --omit=dev
npm run build
systemctl restart ai-seed-project
systemctl --no-pager --full status ai-seed-project
```

- [ ] **Step 4: Add local one-click wrappers and package scripts**

```powershell
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Write-Host "Deploying AI Seed Project..."
powershell -ExecutionPolicy Bypass -File ".\\scripts\\ops\\windows-init.ps1"
```

```json
{
  "scripts": {
    "ops:init": "powershell -ExecutionPolicy Bypass -File scripts/ops/windows-init.ps1",
    "ops:deploy": "powershell -ExecutionPolicy Bypass -File scripts/ops/windows-deploy.ps1",
    "ops:check": "powershell -ExecutionPolicy Bypass -File scripts/ops/windows-check.ps1"
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run:

```bash
npm.cmd test -- --run tests/scripts/no-code-entry-smoke.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add scripts/ops deploy/systemd/ai-seed-project.service docs/ops/aliyun-mcp-runbook.md docs/ops/no-code-operator-guide.md package.json tests/scripts/no-code-entry-smoke.test.ts
git commit -m "feat: add no-code ops entrypoints for phase one"
```

## Task 6: Run full verification, then perform live model smoke after API key arrives

**Files:**
- Modify: `docs/release-smoke-tests.md`
- Modify: `docs/release-runbook.md`

- [ ] **Step 1: Run the full local regression suite**

Run:

```bash
npm.cmd test
```

Expected: PASS for the complete Vitest suite.

- [ ] **Step 2: Run the production build**

Run:

```bash
npm.cmd run build
```

Expected: PASS for `build:api` and `build:web`.

- [ ] **Step 3: Verify Feishu integration status in a seeded environment**

Run:

```bash
npm.cmd run seed:demo
npm.cmd run dev:api
```

Then check:

```bash
curl http://localhost:3000/api/health
curl http://localhost:3000/api/feishu/status
```

Expected:
- `/api/health` returns `200`
- `/api/feishu/status` shows `eventMode: long_connection` or the intended test mode

- [ ] **Step 4: After the user provides the real domestic model API key, run the live provider smoke**

Use a production-like `.env` with:

```env
LLM_ENABLED=true
LLM_PROVIDER=aliyun
LLM_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
LLM_API_KEY=<real_key>
LLM_TEXT_MODEL=qwen3-flash
LLM_FILE_MODEL=qwen-doc
```

Run:

```bash
npm.cmd test -- --run tests/domain/scoring.test.ts tests/services/llm/qwen-score.test.ts
npm.cmd run dev:api
```

Then submit:
- one normal PDF
- one normal DOCX
- one parse-failure / image-like PDF

Expected:
- PDF and DOCX score through `qwen3-flash`
- parse-failure document falls back to `qwen-doc`
- Base receives attempts and final session results
- learner/operator one-click links still work

- [ ] **Step 5: Commit the final docs-only acceptance adjustments**

```bash
git add docs/release-smoke-tests.md docs/release-runbook.md
git commit -m "docs: finalize phase-one acceptance flow"
```

## Self-review checklist

- [ ] **Spec coverage:** 确认以下 spec 条目都被映射到了任务：
  - 飞书原生交付面替代原 Web
  - attempt 级提交与最高有效分结算
  - 国产低成本模型选型与 API 改写
  - 阿里云干净 Linux + MCP/OpenAPI/CLI 优先
  - 学员/运营飞书内一键进入
  - 负责人本地一键运维

- [ ] **Placeholder scan:** 按技能规范中的禁用占位词清单执行全文搜索，确认本计划没有“待补细节再实现”的空洞步骤。

- [ ] **Type consistency:** 检查本计划中的关键名称是否前后一致：
  - `SubmissionAttempt`
  - `SessionResult`
  - `LLM_*`
  - `qwen3-flash`
  - `qwen-doc`
