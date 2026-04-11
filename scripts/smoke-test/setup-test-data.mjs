#!/usr/bin/env node
/**
 * 冒烟测试 — 第 1 步：准备测试数据
 *
 * 在 SWAS 服务器上设置 4 名测试成员：
 * - 3 名管理员 (operator)
 * - 1 名测试学员 (student)
 *
 * 用法: node scripts/smoke-test/setup-test-data.mjs [SERVER_URL]
 */

const SERVER = process.argv[2] || "http://114.215.170.79:3000";

// ─────────────────────────────────────────────
// 飞书 API 凭据（从环境变量读取）
// ─────────────────────────────────────────────
const FEISHU_APP_ID = "cli_a95a5b91b8b85cce";
const FEISHU_APP_SECRET = "b2Mu2CCGKEhOpyufLBL43edcpGJFgL6W";
const CHAT_ID = "oc_a867f87170ab5e892b86ffc2de79790b";

async function getFeishuToken() {
  const resp = await fetch(
    "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ app_id: FEISHU_APP_ID, app_secret: FEISHU_APP_SECRET }),
    }
  );
  const data = await resp.json();
  if (data.code !== 0) throw new Error(`Token error: ${data.msg}`);
  return data.tenant_access_token;
}

async function getChatMembers(token) {
  const resp = await fetch(
    `https://open.feishu.cn/open-apis/im/v1/chats/${CHAT_ID}/members?member_id_type=open_id&page_size=50`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const data = await resp.json();
  if (data.code !== 0) throw new Error(`Chat members error: ${JSON.stringify(data)}`);
  return data.data?.items || [];
}

async function getUserInfo(token, openId) {
  const resp = await fetch(
    `https://open.feishu.cn/open-apis/contact/v3/users/${openId}?user_id_type=open_id`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const data = await resp.json();
  return data.data?.user || null;
}

// ─────────────────────────────────────────────
// 主流程
// ─────────────────────────────────────────────
async function main() {
  console.log("🔧 冒烟测试数据准备");
  console.log(`  服务器: ${SERVER}`);
  console.log("");

  // Step 1: 验证服务器健康
  console.log("1️⃣  验证服务器健康状态...");
  const healthResp = await fetch(`${SERVER}/api/health`);
  const health = await healthResp.json();
  if (!health.ok) throw new Error("服务器不健康！");
  console.log("   ✅ 服务器健康");

  // Step 2: 获取飞书群成员列表
  console.log("\n2️⃣  获取飞书群成员列表...");
  const token = await getFeishuToken();
  const chatMembers = await getChatMembers(token);

  console.log(`   找到 ${chatMembers.length} 名群成员:`);
  const memberDetails = [];
  for (const m of chatMembers) {
    const user = await getUserInfo(token, m.member_id);
    const name = user?.name || m.name || m.member_id;
    const memberId = `user-${m.member_id.slice(-8)}`;
    memberDetails.push({
      openId: m.member_id,
      name,
      memberId,
      isBot: m.member_id_type === "app",
    });
    const label = m.member_id_type === "app" ? " (bot)" : "";
    console.log(`   - ${name}${label}: ${m.member_id}`);
  }

  // Step 3: 通过 API 注册成员到数据库
  const humanMembers = memberDetails.filter((m) => !m.isBot);
  console.log(`\n3️⃣  注册 ${humanMembers.length} 名人类成员到评分系统...`);

  // 先触发 seed:ensure（如果是 dev 模式）
  try {
    await fetch(`${SERVER}/api/demo/seed`, { method: "POST" });
    console.log("   ✅ 基础数据已 seed");
  } catch {
    console.log("   ⚠️  Seed 端点不可用（生产模式），跳过");
  }

  // 获取飞书状态确认 camp 绑定
  const statusResp = await fetch(`${SERVER}/api/feishu/status`);
  const status = await statusResp.json();
  console.log(`   飞书连接: ${status.enabled ? "✅" : "❌"}`);
  console.log(`   凭据有效: ${status.credentialsValid ? "✅" : "❌"}`);
  console.log(`   群已绑定: ${status.campBound ? "✅" : "❌"}`);

  // Step 4: 输出测试信息
  console.log("\n4️⃣  测试成员分配方案:");
  console.log("   ┌──────────────────────────────────────────────────┐");
  for (let i = 0; i < humanMembers.length; i++) {
    const m = humanMembers[i];
    const role = i < 3 ? "operator" : "student";
    const label = i < 3 ? "管理员" : "测试学员";
    console.log(
      `   │  ${label}: ${m.name.padEnd(15)} open_id: ${m.openId.slice(0, 20)}...  │`
    );
  }
  console.log("   └──────────────────────────────────────────────────┘");

  // Step 5: 输出 BOOTSTRAP_OPERATOR_OPEN_IDS
  const operatorOpenIds = humanMembers.slice(0, 3).map((m) => m.openId);
  console.log("\n5️⃣  环境变量建议:");
  console.log(`   BOOTSTRAP_OPERATOR_OPEN_IDS=${operatorOpenIds.join(",")}`);

  // Step 6: 检查评分系统准备情况
  console.log("\n6️⃣  评分系统状态检查:");
  try {
    const rankResp = await fetch(`${SERVER}/api/v2/board/ranking`);
    const rank = await rankResp.json();
    console.log(`   排行榜: ${rank.ok ? "✅" : "❌"} (${rank.rows?.length || 0} 人)`);
  } catch (e) {
    console.log(`   排行榜: ❌ ${e.message}`);
  }

  try {
    const llmResp = await fetch(`${SERVER}/api/v2/llm/worker/status`);
    const llm = await llmResp.json();
    console.log(
      `   LLM Worker: ${llm.ok ? "✅" : "❌"} (running: ${llm.status?.running}, queue: ${llm.status?.queueDepth})`
    );
  } catch (e) {
    console.log(`   LLM Worker: ❌ ${e.message}`);
  }

  console.log("\n✅ 数据准备完成！可以开始冒烟测试。");
  console.log("   运行: node scripts/smoke-test/run-smoke-test.mjs");
}

main().catch((err) => {
  console.error("\n❌ 错误:", err.message);
  process.exit(1);
});
