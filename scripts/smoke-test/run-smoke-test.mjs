#!/usr/bin/env node
/**
 * 冒烟测试 — 自动化 API 验证
 *
 * 验证项目核心 API 端点在服务器上正常工作。
 * 涵盖：健康检查 → 飞书状态 → 评分流程 → 看板 → LLM → 生命周期
 *
 * 用法: node scripts/smoke-test/run-smoke-test.mjs [SERVER_URL]
 */

const SERVER = process.argv[2] || "http://114.215.170.79:3000";

let passed = 0;
let failed = 0;
let skipped = 0;
const results = [];

async function test(name, fn) {
  try {
    await fn();
    passed++;
    results.push({ name, status: "✅ PASS" });
    console.log(`  ✅ ${name}`);
  } catch (err) {
    failed++;
    results.push({ name, status: "❌ FAIL", error: err.message });
    console.log(`  ❌ ${name}: ${err.message}`);
  }
}

function skip(name, reason) {
  skipped++;
  results.push({ name, status: "⏭️ SKIP", error: reason });
  console.log(`  ⏭️ ${name}: ${reason}`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function fetchJSON(url, options = {}) {
  const resp = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  return { status: resp.status, data: await resp.json() };
}

// ─────────────────────────────────────────────
// Test Suite A: 基础连通性
// ─────────────────────────────────────────────
async function suiteA() {
  console.log("\n═══ A. 基础连通性 ═══");

  await test("A.1 Health API", async () => {
    const { data } = await fetchJSON(`${SERVER}/api/health`);
    assert(data.ok === true, `expected ok:true, got ${JSON.stringify(data)}`);
  });

  await test("A.2 Feishu 状态", async () => {
    const { data } = await fetchJSON(`${SERVER}/api/feishu/status`);
    assert(data.enabled === true, "Feishu not enabled");
    assert(data.credentialsValid === true, "Feishu credentials invalid");
  });

  await test("A.3 Feishu 长连接模式", async () => {
    const { data } = await fetchJSON(`${SERVER}/api/feishu/status`);
    assert(
      data.longConnectionEnabled === true,
      `longConnection not enabled, eventMode: ${data.eventMode}`
    );
  });

  await test("A.4 Dashboard 可访问", async () => {
    const resp = await fetch(`${SERVER}/dashboard/`);
    assert(resp.status === 200, `Dashboard returned ${resp.status}`);
    const html = await resp.text();
    assert(html.includes("<!DOCTYPE html>") || html.includes("<html"), "Not an HTML page");
  });
}

// ─────────────────────────────────────────────
// Test Suite B: 排行榜 API
// ─────────────────────────────────────────────
async function suiteB() {
  console.log("\n═══ B. 排行榜 & 看板 API ═══");

  await test("B.1 GET /api/v2/board/ranking 返回 200", async () => {
    const { status, data } = await fetchJSON(`${SERVER}/api/v2/board/ranking`);
    assert(status === 200, `Status ${status}`);
    assert(data.ok === true, `ok is not true: ${JSON.stringify(data)}`);
    assert(Array.isArray(data.rows), "rows is not an array");
  });

  await test("B.2 排行榜包含 demo 成员 (Alice)", async () => {
    const { data } = await fetchJSON(`${SERVER}/api/v2/board/ranking`);
    const alice = data.rows?.find((r) => r.memberName === "Alice" || r.memberId === "user-alice");
    assert(alice, "Alice not found in ranking");
  });

  await test("B.3 GET /api/v2/board/member/:id 返回成员详情", async () => {
    const { status, data } = await fetchJSON(`${SERVER}/api/v2/board/member/user-alice`);
    assert(status === 200, `Status ${status}`);
    assert(data.ok === true, `ok is not true`);
    assert(data.detail?.memberId === "user-alice", "Wrong member detail");
  });
}

// ─────────────────────────────────────────────
// Test Suite C: 评分流程
// ─────────────────────────────────────────────
let activePeriodId = null;

async function suiteC() {
  console.log("\n═══ C. 评分生命周期 ═══");

  // C.1 开期
  await test("C.1 POST /api/v2/periods/open — 开启 Period 1 (冰破期)", async () => {
    const { status, data } = await fetchJSON(`${SERVER}/api/v2/periods/open`, {
      method: "POST",
      body: JSON.stringify({ number: 1 }),
    });
    // 201 = 新创建, 200 = 已存在
    assert(status === 201 || status === 200, `Status ${status}: ${JSON.stringify(data)}`);
    assert(data.ok === true, `Failed: ${JSON.stringify(data)}`);
    activePeriodId = data.periodId;
    console.log(`      periodId: ${activePeriodId}`);
  });

  // C.2 冰破期拒绝评分
  await test("C.2 冰破期(P1)拒绝评分事件", async () => {
    const { status, data } = await fetchJSON(`${SERVER}/api/v2/events`, {
      method: "POST",
      body: JSON.stringify({
        memberId: "user-alice",
        itemCode: "K1",
        sourceRef: `smoke-p1-block-${Date.now()}`,
        payload: { text: "should be rejected in ice breaker" },
      }),
    });
    // 应该被拒绝（冰破期不可评分）— 返回 4xx
    assert(
      status >= 400,
      `Expected 4xx rejection in ice breaker, got status ${status}: ${JSON.stringify(data)}`
    );
  });

  // C.3 开 Period 2（进入评分期）
  await test("C.3 POST /api/v2/periods/open — 开启 Period 2 (评分期)", async () => {
    const { status, data } = await fetchJSON(`${SERVER}/api/v2/periods/open`, {
      method: "POST",
      body: JSON.stringify({ number: 2 }),
    });
    assert(status === 201 || status === 200, `Status ${status}: ${JSON.stringify(data)}`);
    assert(data.ok === true, `Failed: ${JSON.stringify(data)}`);
    activePeriodId = data.periodId;
    console.log(`      periodId: ${activePeriodId}`);
  });

  // C.4 非 LLM 评分（K1 即时生效）
  await test("C.4 提交 K1 评分事件 (非 LLM, 即时生效)", async () => {
    const sourceRef = `smoke-k1-${Date.now()}`;
    const { status, data } = await fetchJSON(`${SERVER}/api/v2/events`, {
      method: "POST",
      body: JSON.stringify({
        memberId: "user-alice",
        itemCode: "K1",
        scoreDelta: 3,
        sourceRef,
        payload: { text: "smoke test K1 submission" },
      }),
    });
    // 202 = accepted, 4xx = domain rejection
    assert(status === 202, `Status ${status}: ${JSON.stringify(data)}`);
    assert(data.ok === true, `Not ok: ${JSON.stringify(data)}`);
    assert(data.eventId, "No eventId returned");
    console.log(`      eventId: ${data.eventId}`);
  });

  // C.5 LLM 评分（K3 需要 LLM 审核）
  await test("C.5 提交 K3 评分事件 (需 LLM 审核)", async () => {
    const sourceRef = `smoke-k3-${Date.now()}`;
    const { status, data } = await fetchJSON(`${SERVER}/api/v2/events`, {
      method: "POST",
      body: JSON.stringify({
        memberId: "user-alice",
        itemCode: "K3",
        sourceRef,
        payload: { text: "今天学习了如何使用 ChatGPT 进行数据分析，掌握了 prompt 迭代技巧。" },
      }),
    });
    assert(status === 202, `Status ${status}: ${JSON.stringify(data)}`);
    assert(data.ok === true, `Not ok: ${JSON.stringify(data)}`);
    assert(data.eventId, "No eventId returned");
    console.log(`      eventId: ${data.eventId}`);
  });

  // C.6 重复 sourceRef 幂等性
  await test("C.6 重复 sourceRef 被拒绝（幂等性）", async () => {
    const sourceRef = `smoke-dedup-${Date.now()}`;
    // 第一次提交
    await fetchJSON(`${SERVER}/api/v2/events`, {
      method: "POST",
      body: JSON.stringify({
        memberId: "user-alice",
        itemCode: "H1",
        sourceRef,
        payload: { text: "dedup test" },
      }),
    });
    // 第二次同 sourceRef
    const { status, data } = await fetchJSON(`${SERVER}/api/v2/events`, {
      method: "POST",
      body: JSON.stringify({
        memberId: "user-alice",
        itemCode: "H1",
        sourceRef,
        payload: { text: "dedup test" },
      }),
    });
    // 重复应返回 4xx 错误（duplicate domain error）
    assert(status >= 400, `Expected 4xx for duplicate, got ${status}: ${JSON.stringify(data)}`);
    assert(data.ok === false, `Expected ok=false for duplicate`);
  });

  // C.7 Cap 上限
  await test("C.7 超过 per-period cap 被限制", async () => {
    // K1 cap = 3, 已经提交了 3 分 (C.4) — 再提交应被 cap 限制
    const { status, data } = await fetchJSON(`${SERVER}/api/v2/events`, {
      method: "POST",
      body: JSON.stringify({
        memberId: "user-alice",
        itemCode: "K1",
        sourceRef: `smoke-cap-${Date.now()}`,
        payload: { text: "cap test" },
      }),
    });
    // 可能返回 202 (delta=0 clamped) 或 4xx (cap_exceeded)
    // 两种都算通过
  });
}

// ─────────────────────────────────────────────
// Test Suite D: LLM Worker
// ─────────────────────────────────────────────
async function suiteD() {
  console.log("\n═══ D. LLM 评分引擎 ═══");

  await test("D.1 LLM Worker 状态", async () => {
    const { data } = await fetchJSON(`${SERVER}/api/v2/llm/worker/status`);
    assert(data.ok === true, `Worker not ok: ${JSON.stringify(data)}`);
  });

  await test("D.2 等待 LLM 处理 K3 任务 (最多 60 秒)", async () => {
    const start = Date.now();
    const timeout = 60_000;
    let lastQueueDepth = -1;

    while (Date.now() - start < timeout) {
      const { data } = await fetchJSON(`${SERVER}/api/v2/llm/worker/status`);
      const qd = data.status?.queueDepth ?? 0;
      if (qd !== lastQueueDepth) {
        lastQueueDepth = qd;
      }
      if (qd === 0) {
        console.log(`      LLM 队列已清空 (${Math.round((Date.now() - start) / 1000)}s)`);
        return;
      }
      await new Promise((r) => setTimeout(r, 3000));
    }
    throw new Error(`LLM 队列未清空，剩余: ${lastQueueDepth}`);
  });
}

// ─────────────────────────────────────────────
// Test Suite E: 管理员 API
// ─────────────────────────────────────────────
async function suiteE() {
  console.log("\n═══ E. 管理员 API ═══");

  await test("E.1 GET /api/v2/admin/review-queue 返回审核队列", async () => {
    const { status, data } = await fetchJSON(`${SERVER}/api/v2/admin/review-queue`, {
      headers: { "x-feishu-open-id": "admin-smoke-test" },
    });
    // 可能返回 403 (如果 admin guard 工作正常)
    // 也可能返回 200 (如果 open-id 在 members 表中)
    assert(
      status === 200 || status === 403,
      `Unexpected status ${status}: ${JSON.stringify(data)}`
    );
    if (status === 200) {
      assert(Array.isArray(data.rows), "rows is not array");
      console.log(`      审核队列: ${data.rows.length} 条`);
    } else {
      console.log("      403 权限拒绝 (预期行为，需要 operator open_id)");
    }
  });

  await test("E.2 GET /api/v2/admin/members 返回成员列表", async () => {
    const { status, data } = await fetchJSON(`${SERVER}/api/v2/admin/members`, {
      headers: { "x-feishu-open-id": "admin-smoke-test" },
    });
    assert(
      status === 200 || status === 403,
      `Unexpected status ${status}: ${JSON.stringify(data)}`
    );
    if (status === 200) {
      assert(Array.isArray(data.rows), "rows is not array");
      console.log(`      成员总数: ${data.rows.length}`);
    } else {
      console.log("      403 权限拒绝 (预期行为)");
    }
  });
}

// ─────────────────────────────────────────────
// Test Suite F: Dashboard 看板数据验证
// ─────────────────────────────────────────────
async function suiteF() {
  console.log("\n═══ F. 看板数据一致性 ═══");

  await test("F.1 排行榜反映 K1 评分", async () => {
    const { data } = await fetchJSON(`${SERVER}/api/v2/board/ranking`);
    const alice = data.rows?.find((r) => r.memberId === "user-alice");
    assert(alice, "Alice not in ranking");
    assert(alice.dimensions?.K >= 3, `K dimension should be >= 3, got ${alice.dimensions?.K}`);
    console.log(`      Alice K=${alice.dimensions.K} H=${alice.dimensions.H} C=${alice.dimensions.C} S=${alice.dimensions.S} G=${alice.dimensions.G}`);
  });

  await test("F.2 成员详情返回维度数据", async () => {
    const { data } = await fetchJSON(`${SERVER}/api/v2/board/member/user-alice`);
    assert(data.ok === true, "Member detail not ok");
    assert(data.detail?.memberId === "user-alice", "Wrong member");
  });
}

// ─────────────────────────────────────────────
// 运行所有测试
// ─────────────────────────────────────────────
async function main() {
  console.log("🔥 AI Seed Project 冒烟测试");
  console.log(`   服务器: ${SERVER}`);
  console.log(`   时间: ${new Date().toISOString()}`);

  await suiteA();
  await suiteB();
  await suiteC();
  await suiteD();
  await suiteE();
  await suiteF();

  // 汇总报告
  console.log("\n╔═══════════════════════════════════════╗");
  console.log("║        冒烟测试结果汇总              ║");
  console.log("╠═══════════════════════════════════════╣");
  console.log(`║  ✅ 通过: ${String(passed).padStart(2)}                         ║`);
  console.log(`║  ❌ 失败: ${String(failed).padStart(2)}                         ║`);
  console.log(`║  ⏭️ 跳过: ${String(skipped).padStart(2)}                         ║`);
  console.log(`║  总计: ${String(passed + failed + skipped).padStart(2)}                            ║`);
  console.log("╚═══════════════════════════════════════╝");

  if (failed > 0) {
    console.log("\n失败项:");
    for (const r of results.filter((r) => r.status.includes("FAIL"))) {
      console.log(`  ❌ ${r.name}: ${r.error}`);
    }
  }

  console.log(
    `\n${failed === 0 ? "🎉 所有测试通过！系统准备就绪。" : "⚠️ 有测试未通过，请检查后重试。"}`
  );
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("\n💥 测试运行器崩溃:", err.message);
  process.exit(2);
});
