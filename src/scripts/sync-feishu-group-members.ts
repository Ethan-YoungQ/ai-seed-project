/**
 * sync-feishu-group-members.ts
 * 从飞书群自动获取成员列表，非管理员导入为 student。
 * 用法: npx tsx src/scripts/sync-feishu-group-members.ts
 */
import * as lark from "@larksuiteoapi/node-sdk";
import Database from "better-sqlite3";
import { resolve } from "path";
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

// 管理员 open_id — 这些人不会被导入为学员
const ADMIN_OPEN_IDS = new Set([
  "ou_789911abef736a08f44286493d3285c5", // YongQ
  "ou_84bdbb1c09ed08547cb700a15acdd0c8", // Karen
  "ou_0f43d5637375d7914b609b33e8672753", // Dorothy
]);

const client = new lark.Client({ appId, appSecret, appType: lark.AppType.SelfBuild });

async function main(): Promise<void> {
  console.log(`[sync] 飞书群 ID: ${chatId}`);
  console.log(`[sync] 数据库: ${dbPath}`);

  // 1. 获取群成员列表（分页）
  const members: Array<{ openId: string; name: string }> = [];
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
          members.push({ openId: item.member_id, name: item.name });
        }
      }
    }
    pageToken = resp.data?.page_token;
  } while (pageToken);

  console.log(`[sync] 群内共 ${members.length} 人`);

  // 2. 过滤掉管理员和 Bot
  const students = members.filter((m) => !ADMIN_OPEN_IDS.has(m.openId));
  console.log(`[sync] 排除管理员后: ${students.length} 名学员待导入`);

  if (students.length === 0) {
    console.log(`[sync] 无新学员需要导入`);
    return;
  }

  // 3. 写入数据库
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");

  // 获取 camp_id
  const camp = db.prepare(`SELECT id FROM camps LIMIT 1`).get() as { id: string } | undefined;
  const campId = camp?.id ?? "camp-demo";

  const upsert = db.prepare(`
    INSERT INTO members (id, camp_id, name, display_name, avatar_url, department, role_type, source_feishu_open_id, is_participant, is_excluded_from_board, status)
    VALUES (?, ?, ?, '', '', '', 'student', ?, 1, 0, 'active')
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      source_feishu_open_id = excluded.source_feishu_open_id
  `);

  const insertMany = db.transaction((items: typeof students) => {
    let inserted = 0;
    let updated = 0;
    for (const s of items) {
      const memberId = `user-${s.openId.slice(-8)}`;
      const existing = db.prepare(`SELECT id FROM members WHERE id = ?`).get(memberId);
      upsert.run(memberId, campId, s.name, s.openId);
      if (existing) {
        updated++;
        console.log(`  ~ ${s.name} (${memberId}) 已存在，更新 open_id`);
      } else {
        inserted++;
        console.log(`  + ${s.name} (${memberId}) → 新增学员`);
      }
    }
    return { inserted, updated };
  });

  const result = insertMany(students);
  console.log(`\n[sync] 新增 ${result.inserted} 人, 更新 ${result.updated} 人`);

  // 验证
  const total = db.prepare(`SELECT COUNT(*) as cnt FROM members WHERE camp_id = ?`).get(campId) as { cnt: number };
  console.log(`[sync] 数据库成员总数: ${total.cnt}`);

  db.close();
  console.log(`[sync] 同步完成！`);
}

main().catch((err: unknown) => {
  console.error("[sync] 错误:", err);
  process.exit(1);
});
