# 2026-05-08 段位晋升公告功能

## 改动概述

新增段位晋升公告功能：在每个计分周期的窗口结算后，自动检测哪些成员晋升了段位，按全群首次/第二/第三位的顺序，用游戏化语言群公告前三名晋升者。同时激活了生产环境的真实结算引擎，替代了原有的空桩。

## 改动文件

### 新增文件

| 文件 | 说明 |
|------|------|
| `src/domain/v2/promotion-announcer.ts` | 晋升公告检测核心逻辑，判断晋升是否属于前三位并写入 DB |
| `src/services/feishu/cards/templates/first-three-announcement-v1.ts` | 游戏化公告卡片模板，包含段位名映射和序号文案 |
| `tests/domain/v2/promotion-announcer.test.ts` | 10 个单元测试覆盖各种边界情况 |
| `tests/services/feishu/cards/templates/first-three-announcement-v1.test.ts` | 5 个单元测试验证卡片渲染 |

### 修改文件

| 文件 | 说明 |
|------|------|
| `src/storage/sqlite-repository.ts` | 新增 `v2_level_announcement_ordinals` 表 DDL；新增 9 个查询方法 |
| `src/v2-production-wiring.ts` | 替换 `buildWindowSettler` 空桩为真实结算引擎；串联公告流程 |
| `src/server.ts` | 创建飞书客户端实例，传入 `wireV2Production` 用于发送公告卡片 |

## 核心逻辑

### 晋升公告检测 (`promotion-announcer.ts`)
- `detectAnnounceablePromotions(windowId, deps)` 函数
- 读取本窗口的晋升记录 (`promoted=true, toLevel>fromLevel`)
- 读取已公告的 `v2_level_announcement_ordinals` 表获取各段位已有计数
- 对每个晋升者，若该段位计数<3，分配下一序号并写入 DB
- 返回待公告列表

### 真实结算引擎 (`v2-production-wiring.ts`)
- `buildRealWindowSettler` 适配 `SettlerDependencies` 接口，调用 `settleWindow()`
- 在 `buildPeriodLifecycle.openNewPeriod` 中，当窗口填满触发结算时：
  1. 运行真实结算（产生 `v2_promotion_records`）
  2. 检测可公告的晋升
  3. 发送游戏化公告卡片到飞书群

### 公告卡片内容
- 第一位：`🎉 恭喜 {成员名} 成为全群第一位晋升【{段位名}】的英雄！`
- 第二位：`🎉 恭喜 {成员名} 成为全群第二位晋升【{段位名}】的英雄！`
- 第三位：`🎉 恭喜 {成员名} 成为全群第三位晋升【{段位名}】的英雄！` + 边界说明

## 段位映射
- Lv2: AI 研究员
- Lv3: AI 操盘手
- Lv4: AI 智慧顾问
- Lv5: AI 奇点玩家

## 验证
- `npm test` — 所有测试通过（+15 个新测试）
- TypeScript 编译无新增错误
