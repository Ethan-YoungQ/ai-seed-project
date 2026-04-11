# Phase 3A: 提交变更 + 清除虚拟数据 + 上线前 100% Ready

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 提交本次 Dashboard 改进（段位修正 + 勋章系统），清除所有虚拟/测试数据，准备 4 人冒烟测试环境，确保学员入群前系统 100% ready。

**Architecture:** 分三大块执行：(1) 代码提交+构建+部署 (2) 生产数据库清理+重置 (3) 端到端验证确保所有链路畅通。全程使用阿里云 SWAS CLI 远程执行服务器操作。

**Tech Stack:** TypeScript, Fastify, SQLite, Vite/React 19, 阿里云 SWAS CLI, 飞书 WebSocket/Card SDK

**服务器信息：**
- 阿里云 CLI: `C:\Users\qiyon\Desktop\aliyun-cli-windows-latest-amd64\aliyun.exe`
- CLI Profile: `deploy-temp`
- 实例 ID: `0cf24a62cd3a463baf31c196913dc3cd`
- 部署目录: `/opt/ai-seed-project`
- 公网 IP: `114.215.170.79:3000`

**管理员成员（保留）：**

| id | name | role | feishu_open_id |
|----|------|------|----------------|
| user-ops | YongQ | trainer | `ou_789911abef736a08f44286493d3285c5` |
| user-trainer | Karen | trainer | `ou_84bdbb1c09ed08547cb700a15acdd0c8` |
| user-dorothy | Dorothy Shi | trainer | `ou_0f43d5637375d7914b609b33e8672753` |
| user-huangxy | 黄小燕 | student | `ou_059edde5436664caa3b3e2fab4d6a25b` |

**Demo 学员（清除）：** user-alice, user-bob, user-charlie, user-diana

---

## Task 1: Git 提交 Dashboard 变更

**Files:**
- Modified: `apps/dashboard/src/lib/levels.ts`, `apps/dashboard/src/lib/mock-data.ts`, `apps/dashboard/src/components/leaderboard/LeaderboardRow.tsx`, `apps/dashboard/src/routes/MemberDetailPage.tsx`, `apps/dashboard/src/types/api.ts`
- Create (untracked): `apps/dashboard/src/lib/badges.ts`, `apps/dashboard/src/lib/badge-engine.ts`, `apps/dashboard/src/components/ui/BadgeIcon.tsx`, `apps/dashboard/src/components/member/BadgeWall.tsx`
- Create (docs): `docs/rules/badge-system.md`, `docs/handoffs/2026-04-12-phase2-completion-handoff.md`

- [ ] **Step 1: Stage all dashboard changes + docs**

```bash
cd "D:\Vibe Coding Project\AI Seed Project\.worktrees\phase-one-feishu"

git add apps/dashboard/src/lib/levels.ts \
  apps/dashboard/src/lib/mock-data.ts \
  apps/dashboard/src/lib/badges.ts \
  apps/dashboard/src/lib/badge-engine.ts \
  apps/dashboard/src/components/ui/BadgeIcon.tsx \
  apps/dashboard/src/components/member/BadgeWall.tsx \
  apps/dashboard/src/components/leaderboard/LeaderboardRow.tsx \
  apps/dashboard/src/routes/MemberDetailPage.tsx \
  apps/dashboard/src/types/api.ts \
  docs/rules/badge-system.md \
  docs/handoffs/2026-04-12-phase2-completion-handoff.md
```

- [ ] **Step 2: Verify staged files**

```bash
git diff --cached --stat
```

Expected: ~11 files changed

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(dashboard): add badge system + fix tier names to match rules doc

- Add badge wall component (BadgeWall, BadgeIcon) with mock data
- Fix level names: 研究员/操盘手/智慧顾问/奇点玩家 per rules doc
- Fix level emojis: 🔬/🎯/🧠/⚡ per rules doc
- Add badge computation engine (B1 MVP, B2 Breakthrough, B3 Dimension)
- Add badge-system.md rules document
- Fix code review issues (b3History reset, DOM mutation, i18n)
- Clean up 37 stale .js build artifacts from dashboard src/"
```

---

## Task 2: 构建 Dashboard 前端

**Files:**
- Output: `dist-dashboard/` (Vite 构建产物)

- [ ] **Step 1: 运行 Dashboard 构建**

```bash
cd "D:\Vibe Coding Project\AI Seed Project\.worktrees\phase-one-feishu\apps\dashboard"
npx vite build
```

Expected: `dist-dashboard/` 生成在 worktree 根目录

- [ ] **Step 2: 验证构建产物**

```bash
ls -la "D:\Vibe Coding Project\AI Seed Project\.worktrees\phase-one-feishu\dist-dashboard"
```

Expected: `index.html` + `assets/` 目录存在

---

## Task 3: 构建后端 + 推送到 Git

**Files:**
- Output: `dist/` (TypeScript 编译产物)

- [ ] **Step 1: 运行后端构建**

```bash
cd "D:\Vibe Coding Project\AI Seed Project\.worktrees\phase-one-feishu"
npx tsc -p tsconfig.build.json
```

Expected: 零错误

- [ ] **Step 2: 推送到远程**

```bash
git push origin codex/phase-one-feishu
```

---

## Task 4: 编写数据重置脚本

**Files:**
- Create: `src/scripts/reset-for-launch.ts`

- [ ] **Step 1: 创建重置脚本**

```typescript
/**
 * reset-for-launch.ts
 * 上线前数据重置：清除 demo 学员 + 测试数据，保留管理员。
 * 用法: npx tsx src/scripts/reset-for-launch.ts
 */
import Database from "better-sqlite3";
import { resolve } from "path";

const DB_PATH = process.env.DATABASE_URL ?? "./data/app.db";
const dbPath = resolve(DB_PATH);

console.log(`[reset] 目标数据库: ${dbPath}`);

const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// 要保留的成员 ID
const KEEP_MEMBER_IDS = [
  "user-ops",      // YongQ (trainer)
  "user-trainer",  // Karen (trainer)
  "user-dorothy",  // Dorothy Shi (trainer)
  "user-huangxy",  // 黄小燕 (student/tester)
];

// 要清除的 demo 成员 ID
const DEMO_MEMBER_IDS = [
  "user-alice",
  "user-bob",
  "user-charlie",
  "user-diana",
];

const run = db.transaction(() => {
  // 1. 清除 demo 成员的所有评分事件
  const delEvents = db.prepare(
    `DELETE FROM v2_scoring_item_events WHERE member_id IN (${DEMO_MEMBER_IDS.map(() => "?").join(",")})`
  );
  const evtResult = delEvents.run(...DEMO_MEMBER_IDS);
  console.log(`[reset] 删除 demo 评分事件: ${evtResult.changes} 条`);

  // 2. 清除 demo 成员的维度分数
  const delDims = db.prepare(
    `DELETE FROM v2_member_dimension_scores WHERE member_id IN (${DEMO_MEMBER_IDS.map(() => "?").join(",")})`
  );
  const dimResult = delDims.run(...DEMO_MEMBER_IDS);
  console.log(`[reset] 删除 demo 维度分数: ${dimResult.changes} 条`);

  // 3. 清除 demo 成员的窗口快照
  const delSnaps = db.prepare(
    `DELETE FROM v2_window_snapshots WHERE member_id IN (${DEMO_MEMBER_IDS.map(() => "?").join(",")})`
  );
  const snapResult = delSnaps.run(...DEMO_MEMBER_IDS);
  console.log(`[reset] 删除 demo 窗口快照: ${snapResult.changes} 条`);

  // 4. 清除 demo 成员的段位记录
  const delLevels = db.prepare(
    `DELETE FROM v2_member_levels WHERE member_id IN (${DEMO_MEMBER_IDS.map(() => "?").join(",")})`
  );
  const lvlResult = delLevels.run(...DEMO_MEMBER_IDS);
  console.log(`[reset] 删除 demo 段位记录: ${lvlResult.changes} 条`);

  // 5. 清除 demo 成员的晋升记录
  const delPromo = db.prepare(
    `DELETE FROM v2_promotion_records WHERE member_id IN (${DEMO_MEMBER_IDS.map(() => "?").join(",")})`
  );
  const promoResult = delPromo.run(...DEMO_MEMBER_IDS);
  console.log(`[reset] 删除 demo 晋升记录: ${promoResult.changes} 条`);

  // 6. 删除 demo 成员记录
  const delMembers = db.prepare(
    `DELETE FROM members WHERE id IN (${DEMO_MEMBER_IDS.map(() => "?").join(",")})`
  );
  const memResult = delMembers.run(...DEMO_MEMBER_IDS);
  console.log(`[reset] 删除 demo 成员: ${memResult.changes} 人`);

  // 7. 清除所有测试评分事件（保留成员但重置分数）
  const delAllEvents = db.prepare(`DELETE FROM v2_scoring_item_events`);
  const allEvtResult = delAllEvents.run();
  console.log(`[reset] 清除全部评分事件: ${allEvtResult.changes} 条`);

  // 8. 清除所有维度分数
  const delAllDims = db.prepare(`DELETE FROM v2_member_dimension_scores`);
  const allDimResult = delAllDims.run();
  console.log(`[reset] 清除全部维度分数: ${allDimResult.changes} 条`);

  // 9. 清除所有窗口快照
  const delAllSnaps = db.prepare(`DELETE FROM v2_window_snapshots`);
  const allSnapResult = delAllSnaps.run();
  console.log(`[reset] 清除全部窗口快照: ${allSnapResult.changes} 条`);

  // 10. 清除所有段位和晋升记录
  const delAllLevels = db.prepare(`DELETE FROM v2_member_levels`);
  delAllLevels.run();
  const delAllPromo = db.prepare(`DELETE FROM v2_promotion_records`);
  delAllPromo.run();
  console.log(`[reset] 清除全部段位/晋升记录`);

  // 11. 关闭所有活跃期间和窗口
  db.prepare(`UPDATE v2_periods SET status = 'closed', closed_at = datetime('now') WHERE status = 'active'`).run();
  db.prepare(`UPDATE v2_windows SET status = 'settled', settled_at = datetime('now') WHERE status = 'active'`).run();
  console.log(`[reset] 关闭所有活跃期间和窗口`);

  // 12. 清除 LLM 任务队列
  const delLlm = db.prepare(`DELETE FROM v2_llm_scoring_tasks`);
  const llmResult = delLlm.run();
  console.log(`[reset] 清除 LLM 任务: ${llmResult.changes} 条`);

  // 验证保留成员
  const remaining = db.prepare(`SELECT id, name, role_type FROM members`).all();
  console.log(`\n[reset] 保留成员 (${remaining.length} 人):`);
  for (const m of remaining) {
    console.log(`  - ${(m as any).id}: ${(m as any).name} (${(m as any).role_type})`);
  }
});

run();
db.close();
console.log(`\n[reset] 数据重置完成！`);
```

- [ ] **Step 2: 添加 npm script**

在 `package.json` 的 `scripts` 中添加:
```json
"reset:launch": "tsx src/scripts/reset-for-launch.ts"
```

- [ ] **Step 3: Commit**

```bash
git add src/scripts/reset-for-launch.ts package.json
git commit -m "chore: add launch data reset script"
```

---

## Task 5: 编写飞书群成员自动获取脚本

**Files:**
- Create: `src/scripts/sync-feishu-group-members.ts`

- [ ] **Step 1: 创建成员同步脚本**

该脚本通过飞书 API 获取群成员列表，将非管理员自动导入为 student 角色。

```typescript
/**
 * sync-feishu-group-members.ts
 * 从飞书群自动获取成员列表，非管理员导入为 student。
 * 用法: npx tsx src/scripts/sync-feishu-group-members.ts
 */
import * as lark from "@larksuiteoapi/node-sdk";
import Database from "better-sqlite3";
import { resolve } from "path";
import { randomUUID } from "crypto";

// 加载 .env
import { config } from "dotenv";
config();

const appId = process.env.FEISHU_APP_ID;
const appSecret = process.env.FEISHU_APP_SECRET;
const chatId = process.env.FEISHU_BOT_CHAT_ID;
const dbPath = resolve(process.env.DATABASE_URL ?? "./data/app.db");

if (!appId || !appSecret || !chatId) {
  console.error("[sync] 缺少环境变量: FEISHU_APP_ID, FEISHU_APP_SECRET, FEISHU_BOT_CHAT_ID");
  process.exit(1);
}

// 管理员 open_id 列表（不导入为学员）
const ADMIN_OPEN_IDS = new Set([
  "ou_789911abef736a08f44286493d3285c5", // YongQ
  "ou_84bdbb1c09ed08547cb700a15acdd0c8", // Karen
  "ou_0f43d5637375d7914b609b33e8672753", // Dorothy
]);

const client = new lark.Client({ appId, appSecret, appType: lark.AppType.SelfBuild });

async function main() {
  console.log(`[sync] 飞书群 ID: ${chatId}`);
  console.log(`[sync] 数据库: ${dbPath}`);

  // 1. 获取群成员列表
  const members: Array<{ member_id: string; name: string }> = [];
  let pageToken: string | undefined;

  do {
    const resp = await client.im.chatMembers.get({
      path: { chat_id: chatId! },
      params: {
        member_id_type: "open_id",
        page_size: 100,
        ...(pageToken ? { page_token: pageToken } : {}),
      },
    });

    if (resp.data?.items) {
      for (const item of resp.data.items) {
        if (item.member_id && item.name) {
          members.push({ member_id: item.member_id, name: item.name });
        }
      }
    }
    pageToken = resp.data?.page_token;
  } while (pageToken);

  console.log(`[sync] 群内共 ${members.length} 人`);

  // 2. 过滤掉管理员和 Bot
  const students = members.filter(m => !ADMIN_OPEN_IDS.has(m.member_id));
  console.log(`[sync] 排除管理员后: ${students.length} 名学员`);

  // 3. 写入数据库
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");

  const campId = "camp-demo"; // 使用现有 camp

  const upsert = db.prepare(`
    INSERT INTO members (id, camp_id, name, role_type, source_feishu_open_id, is_participant, is_excluded_from_board, created_at, updated_at)
    VALUES (?, ?, ?, 'student', ?, 1, 0, datetime('now'), datetime('now'))
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      source_feishu_open_id = excluded.source_feishu_open_id,
      updated_at = datetime('now')
  `);

  const insertMany = db.transaction((items: typeof students) => {
    for (const s of items) {
      const memberId = `user-${s.member_id.slice(-8)}`;
      upsert.run(memberId, campId, s.name, s.member_id);
      console.log(`  + ${s.name} (${memberId}) → open_id: ${s.member_id}`);
    }
  });

  insertMany(students);

  // 验证
  const total = db.prepare(`SELECT COUNT(*) as cnt FROM members WHERE camp_id = ?`).get(campId) as any;
  console.log(`\n[sync] 数据库成员总数: ${total.cnt}`);

  db.close();
  console.log(`[sync] 同步完成！`);
}

main().catch(err => {
  console.error("[sync] 错误:", err);
  process.exit(1);
});
```

- [ ] **Step 2: 添加 npm script**

在 `package.json` 的 `scripts` 中添加:
```json
"sync:members": "tsx src/scripts/sync-feishu-group-members.ts"
```

- [ ] **Step 3: Commit**

```bash
git add src/scripts/sync-feishu-group-members.ts package.json
git commit -m "feat: add feishu group member auto-sync script"
```

---

## Task 6: 部署到服务器

**环境变量:**
- `ALIYUN`: `C:\Users\qiyon\Desktop\aliyun-cli-windows-latest-amd64\aliyun.exe`
- `INSTANCE_ID`: `0cf24a62cd3a463baf31c196913dc3cd`

- [ ] **Step 1: 备份生产数据库**

```bash
ALIYUN="C:\Users\qiyon\Desktop\aliyun-cli-windows-latest-amd64\aliyun.exe"
INSTANCE_ID="0cf24a62cd3a463baf31c196913dc3cd"

$ALIYUN swas-open RunCommand \
  --InstanceId $INSTANCE_ID \
  --Type RunShellScript \
  --CommandContent "cp /opt/ai-seed-project/data/app.db /opt/ai-seed-project/data/app.db.bak-$(date +%Y%m%d-%H%M%S) && echo 'Backup complete'" \
  --profile deploy-temp
```

用 `DescribeInvocationResult` 检查结果。

- [ ] **Step 2: 推送代码到 GitHub**

```bash
cd "D:\Vibe Coding Project\AI Seed Project\.worktrees\phase-one-feishu"
git push origin codex/phase-one-feishu
```

- [ ] **Step 3: 服务器 Git Pull**

```bash
GH_TOKEN=$(gh auth token)
$ALIYUN swas-open RunCommand \
  --InstanceId $INSTANCE_ID \
  --Type RunShellScript \
  --CommandContent "cd /opt/ai-seed-project && git fetch origin && git reset --hard origin/codex/phase-one-feishu" \
  --profile deploy-temp
```

- [ ] **Step 4: 服务器构建 + 安装依赖**

```bash
$ALIYUN swas-open RunCommand \
  --InstanceId $INSTANCE_ID \
  --Type RunShellScript \
  --CommandContent "cd /opt/ai-seed-project && npm install && npm run build" \
  --profile deploy-temp --Timeout 120
```

- [ ] **Step 5: 服务器执行数据重置**

```bash
$ALIYUN swas-open RunCommand \
  --InstanceId $INSTANCE_ID \
  --Type RunShellScript \
  --CommandContent "cd /opt/ai-seed-project && npx tsx src/scripts/reset-for-launch.ts" \
  --profile deploy-temp
```

验证输出：应显示保留 4 名成员（YongQ, Karen, Dorothy, 黄小燕）。

- [ ] **Step 6: 重启服务**

```bash
$ALIYUN swas-open RunCommand \
  --InstanceId $INSTANCE_ID \
  --Type RunShellScript \
  --CommandContent "systemctl restart ai-seed-project && sleep 3 && systemctl status ai-seed-project --no-pager" \
  --profile deploy-temp
```

Expected: `active (running)`

---

## Task 7: 端到端健康验证

- [ ] **Step 1: API 健康检查**

```bash
$ALIYUN swas-open RunCommand \
  --InstanceId $INSTANCE_ID \
  --Type RunShellScript \
  --CommandContent "curl -s http://localhost:3000/api/health | python3 -m json.tool" \
  --profile deploy-temp
```

Expected: `{ "status": "ok" }`

- [ ] **Step 2: 飞书连接状态检查**

```bash
$ALIYUN swas-open RunCommand \
  --InstanceId $INSTANCE_ID \
  --Type RunShellScript \
  --CommandContent "curl -s http://localhost:3000/api/v2/feishu/status | python3 -m json.tool" \
  --profile deploy-temp
```

Expected: `credentialsValid: true`, `eventMode: "long_connection"`

- [ ] **Step 3: 成员列表验证**

```bash
$ALIYUN swas-open RunCommand \
  --InstanceId $INSTANCE_ID \
  --Type RunShellScript \
  --CommandContent "curl -s http://localhost:3000/api/v2/admin/members -H 'x-feishu-open-id: ou_789911abef736a08f44286493d3285c5' | python3 -m json.tool" \
  --profile deploy-temp
```

Expected: 4 名成员，无 demo 学员

- [ ] **Step 4: Dashboard 可访问性验证**

```bash
$ALIYUN swas-open RunCommand \
  --InstanceId $INSTANCE_ID \
  --Type RunShellScript \
  --CommandContent "curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/dashboard/" \
  --profile deploy-temp
```

Expected: `200`

- [ ] **Step 5: LLM 状态检查**

```bash
$ALIYUN swas-open RunCommand \
  --InstanceId $INSTANCE_ID \
  --Type RunShellScript \
  --CommandContent "curl -s http://localhost:3000/api/v2/llm/status | python3 -m json.tool" \
  --profile deploy-temp
```

Expected: `enabled: true`, `provider: "glm"`, `queueLength: 0`

- [ ] **Step 6: 排行榜 API 验证**

```bash
$ALIYUN swas-open RunCommand \
  --InstanceId $INSTANCE_ID \
  --Type RunShellScript \
  --CommandContent "curl -s http://localhost:3000/api/v2/board/ranking | python3 -m json.tool" \
  --profile deploy-temp
```

Expected: `ok: true`, `rows: []`（数据已重置，排行榜为空）

---

## Task 8: 4 人冒烟测试环境准备

**目的：** 确保 3 名管理员 + 1 名测试学员（黄小燕）明天可以完成端到端测试。

- [ ] **Step 1: 开启 Period 1（破冰期）**

```bash
$ALIYUN swas-open RunCommand \
  --InstanceId $INSTANCE_ID \
  --Type RunShellScript \
  --CommandContent "curl -s -X POST http://localhost:3000/api/v2/periods/open \
    -H 'Content-Type: application/json' \
    -H 'x-feishu-open-id: ou_789911abef736a08f44286493d3285c5' \
    -d '{\"number\": 1}' | python3 -m json.tool" \
  --profile deploy-temp
```

Expected: `ok: true`, `periodId` 返回

- [ ] **Step 2: 验证 Period 1 已开启**

```bash
$ALIYUN swas-open RunCommand \
  --InstanceId $INSTANCE_ID \
  --Type RunShellScript \
  --CommandContent "curl -s http://localhost:3000/api/v2/board/ranking | python3 -m json.tool" \
  --profile deploy-temp
```

- [ ] **Step 3: 验证管理员面板可触发**

在飞书群"HBU奇点玩家"中发送关键词"管理"，确认 Bot 返回管理面板卡片。

> 这是人工操作步骤。如 Bot 无响应，检查服务器日志：
> ```bash
> $ALIYUN swas-open RunCommand \
>   --InstanceId $INSTANCE_ID \
>   --Type RunShellScript \
>   --CommandContent "journalctl -u ai-seed-project --since '5 minutes ago' --no-pager | tail -50" \
>   --profile deploy-temp
> ```

- [ ] **Step 4: 编写冒烟测试清单给管理员**

创建文件 `docs/smoke-test-checklist-2026-04-13.md`：

```markdown
# 冒烟测试清单 — 2026-04-13

> 测试人员：YongQ, Karen, Dorothy + 黄小燕（测试学员）
> 系统地址：http://114.215.170.79:3000
> Dashboard：http://114.215.170.79:3000/dashboard/

## A. 基础连通性（全员，5 min）

- [ ] 在群内发任意消息，确认 Bot 在线（WebSocket 正常接收）
- [ ] 打开 Dashboard URL，确认页面加载正常
- [ ] Dashboard 排行榜显示空（尚无评分数据）

## B. 管理员流程（3 名管理员，20 min）

- [ ] B.1 在群内发"管理"，确认弹出管理面板卡片
- [ ] B.2 在管理面板选择"开期" → 选择 Period 2（首个评分期）→ 点击确认
- [ ] B.3 确认 Period 2 开启成功（状态刷新显示"当前期: 2"）
- [ ] B.4 在群内发"成员"，查看成员管理卡片
- [ ] B.5 确认 4 名成员显示正确（3 trainer + 1 student）

## C. 学员流程（黄小燕操作，30 min）

- [ ] C.1 K3 知识总结：在签到卡片点"🧠 知识总结" → 输入内容 → 提交
- [ ] C.2 等待 LLM 评分（约 10-30 秒）
- [ ] C.3 确认评分事件出现（管理员可在审核队列看到）
- [ ] C.4 K4 AI纠错：点"🔍 AI纠错" → 输入内容 → 提交
- [ ] C.5 H2 实操分享：点"🔧 实操分享" → 上传截图 → 提交
- [ ] C.6 C1 创意用法：点"💡 创意用法" → 输入内容 → 提交
- [ ] C.7 G2 课外资源：点"🌱 课外好资源" → 输入链接 → 提交
- [ ] C.8 刷新 Dashboard → 确认黄小燕出现在排行榜且有分数

## D. 管理员审核流程（管理员操作，15 min）

- [ ] D.1 检查审核队列：有 LLM 评分的事件出现
- [ ] D.2 批准一条评分事件 → 确认学员分数更新
- [ ] D.3 拒绝一条评分事件 → 确认分数不变
- [ ] D.4 手动调分测试（可选）

## E. 生命周期测试（管理员，10 min）

- [ ] E.1 通过管理面板开启 Period 3 → Period 2 自动关闭
- [ ] E.2 确认 Dashboard 数据正常（分数保留）

## 通过标准

- [ ] A 系列全部通过
- [ ] B.1-B.3 通过（管理面板核心功能）
- [ ] C.1-C.8 至少 5 项通过（学员评分流程）
- [ ] D.1-D.2 通过（审核流程）
- [ ] 无 500 错误
- [ ] LLM 评分延迟 < 30 秒

## 测试后操作

测试完成后，Claude 将执行：
1. 清除测试期间产生的评分数据
2. 保留成员数据
3. 关闭测试期间
4. 等待正式学员入群
```

- [ ] **Step 5: Commit 冒烟测试清单**

```bash
git add docs/smoke-test-checklist-2026-04-13.md
git commit -m "docs: add smoke test checklist for 4-person validation"
```

---

## Task 9: 确认服务器日志正常运行

- [ ] **Step 1: 检查服务启动日志**

```bash
$ALIYUN swas-open RunCommand \
  --InstanceId $INSTANCE_ID \
  --Type RunShellScript \
  --CommandContent "journalctl -u ai-seed-project --since '10 minutes ago' --no-pager | tail -30" \
  --profile deploy-temp
```

Expected: 无错误，显示 `listening on 0.0.0.0:3000`

- [ ] **Step 2: 检查飞书 WebSocket 连接**

```bash
$ALIYUN swas-open RunCommand \
  --InstanceId $INSTANCE_ID \
  --Type RunShellScript \
  --CommandContent "journalctl -u ai-seed-project --since '10 minutes ago' --no-pager | grep -i 'websocket\|ws\|connected\|feishu'" \
  --profile deploy-temp
```

Expected: WebSocket 连接成功的日志

---

## Task 10: 最终 Git Push + 状态确认

- [ ] **Step 1: Push 所有变更到远程**

```bash
cd "D:\Vibe Coding Project\AI Seed Project\.worktrees\phase-one-feishu"
git push origin codex/phase-one-feishu
```

- [ ] **Step 2: 确认最终状态**

```bash
git log --oneline -5
git status
```

Expected: 工作目录干净，最近的提交包含 badge 系统和重置脚本。

---

## 完成标准

完成后，系统应处于以下状态：

| 检查项 | 状态 |
|--------|------|
| Dashboard 段位名称/图标正确 | ⚡🧠🎯🔬🌱 |
| Dashboard 勋章系统就绪 | BadgeWall + BadgeIcon |
| 生产数据库 demo 数据已清除 | 仅保留 4 名真实成员 |
| 评分/快照/段位数据已重置 | 全部清零 |
| Period 1（破冰期）已开启 | 等待明天测试 |
| 飞书 WebSocket 正常连接 | Bot 在线 |
| LLM 评分服务就绪 | GLM-4.7 可用 |
| Dashboard 可访问 | `http://114.215.170.79:3000/dashboard/` |
| 冒烟测试清单已准备 | 明天 4 人执行 |
| 飞书成员同步脚本就绪 | 学员入群后可自动导入 |
| 数据重置脚本就绪 | 测试后可再次重置 |
