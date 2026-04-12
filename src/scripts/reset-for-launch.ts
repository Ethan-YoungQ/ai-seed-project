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

// 要清除的 demo 成员 ID
const DEMO_MEMBER_IDS = [
  "user-alice",
  "user-bob",
  "user-charlie",
  "user-diana",
];

const placeholders = DEMO_MEMBER_IDS.map(() => "?").join(",");

const run = db.transaction(() => {
  // 1. 删除 demo 成员关联的所有数据
  const tables = [
    "v2_scoring_item_events",
    "v2_member_dimension_scores",
    "v2_window_snapshots",
    "v2_member_levels",
    "v2_promotion_records",
    "v2_llm_scoring_tasks",
    "v2_card_interactions",
    "peer_review_votes",
  ];

  for (const table of tables) {
    try {
      const col = table === "peer_review_votes" ? "voter_member_id" : "member_id";
      const result = db.prepare(`DELETE FROM ${table} WHERE ${col} IN (${placeholders})`).run(...DEMO_MEMBER_IDS);
      if (result.changes > 0) console.log(`[reset] ${table}: 删除 ${result.changes} 条`);
    } catch {
      // 表可能不存在，跳过
    }
  }

  // 2. 删除 demo 成员
  const memResult = db.prepare(`DELETE FROM members WHERE id IN (${placeholders})`).run(...DEMO_MEMBER_IDS);
  console.log(`[reset] 删除 demo 成员: ${memResult.changes} 人`);

  // 3. 清除所有评分数据（全局重置）
  const globalTables = [
    "v2_scoring_item_events",
    "v2_member_dimension_scores",
    "v2_window_snapshots",
    "v2_member_levels",
    "v2_promotion_records",
    "v2_llm_scoring_tasks",
    "v2_card_interactions",
    "peer_review_votes",
    "reaction_tracked_messages",
    "feishu_live_cards",
    "feishu_card_patch_deadletters",
  ];

  for (const table of globalTables) {
    try {
      const result = db.prepare(`DELETE FROM ${table}`).run();
      if (result.changes > 0) console.log(`[reset] ${table}: 清除 ${result.changes} 条`);
    } catch {
      // 表可能不存在，跳过
    }
  }

  // 4. 关闭所有活跃期间和窗口
  db.prepare(`UPDATE v2_periods SET ended_at = datetime('now'), closed_reason = 'launch_reset' WHERE ended_at IS NULL`).run();
  db.prepare(`UPDATE v2_windows SET settlement_state = 'settled', settled_at = datetime('now') WHERE settlement_state IN ('open', 'active')`).run();
  console.log(`[reset] 关闭所有活跃期间和窗口`);

  // 5. 验证保留成员
  const remaining = db.prepare(`SELECT id, name, role_type, source_feishu_open_id FROM members`).all() as Array<{
    id: string;
    name: string;
    role_type: string;
    source_feishu_open_id: string;
  }>;

  console.log(`\n[reset] 保留成员 (${remaining.length} 人):`);
  for (const m of remaining) {
    console.log(`  - ${m.id}: ${m.name} (${m.role_type}) open_id=${m.source_feishu_open_id.slice(0, 10)}...`);
  }
});

run();
db.close();
console.log(`\n[reset] 数据重置完成！系统已准备好进行冒烟测试。`);
