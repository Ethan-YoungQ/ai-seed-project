/**
 * Sub-project 4: LLM Blind Evaluation Script
 *
 * Runs the same set of test submissions through multiple GLM models
 * and compares their scoring quality, latency, and JSON reliability.
 *
 * Usage: LLM_API_KEY=xxx npx tsx scripts/sub4-blind-eval.ts
 */

const API_KEY = process.env.LLM_API_KEY;
const BASE_URL = "https://open.bigmodel.cn/api/paas/v4";

if (!API_KEY) {
  console.error("ERROR: Set LLM_API_KEY environment variable");
  process.exit(1);
}

// --- Models to evaluate ---
const MODELS = [
  "glm-4.7-flash",   // Free tier
  "glm-4.7",         // Current default
  "glm-4.6",         // Previous gen
] as const;

// --- Prompt templates (from src/domain/v2/llm-prompts.ts) ---
const SYSTEM_PREFIX = `你是 AI 训练营评分助手。根据学员的提交内容判断是否合格。
必须只输出严格 JSON,格式: {"pass": boolean, "score": number, "reason": string}
reason 必须用中文口语化表达,便于学员理解。`;

const ITEM_BODIES: Record<string, { prompt: string; maxScore: number }> = {
  K3: {
    prompt: `评分项: K3 知识总结打卡
合格标准:
1. 有明确的 AI 相关知识点(至少 1 个)
2. 用学员自己的话表达,不是复制粘贴官方定义
3. 字数 >= 30
满分 3, 不合格 0。`,
    maxScore: 3,
  },
  K4: {
    prompt: `评分项: K4 AI 纠错或补充
合格标准:
1. 指出 AI 输出的具体错误或遗漏
2. 有明确的纠正或补充内容
3. 不是笼统的"AI 说错了"
满分 4, 不合格 0。`,
    maxScore: 4,
  },
  C1: {
    prompt: `评分项: C1 AI 创意用法
合格标准:
1. 描述一个具体的 AI 应用场景或新玩法
2. 有可执行性(不是空想)
3. 和学员本职工作或日常生活相关
满分 4, 不合格 0。`,
    maxScore: 4,
  },
  C3: {
    prompt: `评分项: C3 自创提示词模板
合格标准:
1. 模板有明确的结构(角色 / 任务 / 约束 / 输出 至少覆盖其中 2 项)
2. 可复用,不绑定单次对话
3. 有具体场景说明
满分 5, 不合格 0。`,
    maxScore: 5,
  },
  G2: {
    prompt: `评分项: G2 课外好资源
合格标准:
1. 链接或内容确实和 AI 相关
2. 有简单的为什么推荐(至少一句话理由)
3. 不是纯广告
满分 3, 不合格 0。`,
    maxScore: 3,
  },
};

// --- Test submissions (realistic student inputs) ---
interface TestCase {
  id: string;
  itemCode: string;
  text: string;
  expectedPass: boolean;
  label: string;
}

const TEST_CASES: TestCase[] = [
  // K3 cases
  {
    id: "k3-pass-1",
    itemCode: "K3",
    text: "今天学了 Transformer 的自注意力机制。Q K V 三个矩阵分别代表 Query、Key、Value,通过点积计算注意力权重,让模型能同时关注输入序列的不同位置。和传统 RNN 相比,自注意力可以并行计算,训练效率大幅提升。",
    expectedPass: true,
    label: "详细知识总结(应通过)",
  },
  {
    id: "k3-pass-2",
    itemCode: "K3",
    text: "学到了 RAG 的核心思路,先检索再生成。把企业文档切块存入向量库,用户提问时先做语义检索找到相关段落,再把这些段落和问题一起送给 LLM 生成答案,这样能大幅减少幻觉问题。",
    expectedPass: true,
    label: "RAG 知识总结(应通过)",
  },
  {
    id: "k3-fail-1",
    itemCode: "K3",
    text: "AI 很厉害",
    expectedPass: false,
    label: "太短(应不通过)",
  },
  {
    id: "k3-fail-2",
    itemCode: "K3",
    text: "今天看了一些 AI 的东西,感觉还行吧,以后继续学习",
    expectedPass: false,
    label: "无具体知识点(应不通过)",
  },

  // K4 cases
  {
    id: "k4-pass-1",
    itemCode: "K4",
    text: "ChatGPT 说 Python 的 GIL 让多线程完全无法利用多核。这不准确——GIL 只阻塞 CPU 密集型的纯 Python 字节码,I/O 密集型任务(网络请求、文件读写)在等待时会释放 GIL,多线程仍然有效。如果需要真正的多核并行,应该用 multiprocessing 或者 C 扩展。",
    expectedPass: true,
    label: "具体纠错(应通过)",
  },
  {
    id: "k4-fail-1",
    itemCode: "K4",
    text: "AI 说的不对,有很多错误",
    expectedPass: false,
    label: "笼统批评(应不通过)",
  },

  // C1 cases
  {
    id: "c1-pass-1",
    itemCode: "C1",
    text: "用 Claude 写了一个自动周报生成器。每周五下午把 Jira 上本周完成的 ticket 标题导出为 CSV,然后让 Claude 按照公司周报模板(背景-进展-风险-下周计划)自动生成初稿,我只需要花 5 分钟微调就能提交,以前要写半小时。",
    expectedPass: true,
    label: "具体应用场景(应通过)",
  },
  {
    id: "c1-fail-1",
    itemCode: "C1",
    text: "AI 未来可以改变世界,应用场景无穷无尽",
    expectedPass: false,
    label: "空想无可执行性(应不通过)",
  },

  // C3 cases
  {
    id: "c3-pass-1",
    itemCode: "C3",
    text: `场景: 会议纪要自动整理
角色: 你是一位资深的会议助理
任务: 根据我提供的会议录音转写文本,生成结构化会议纪要
约束:
- 输出格式: 议题 / 结论 / 待办事项(含责任人和截止日期)
- 不要添加录音中未提及的内容
- 如果某个议题没有明确结论,标注"待定"
输出: Markdown 格式的会议纪要`,
    expectedPass: true,
    label: "完整提示词模板(应通过)",
  },
  {
    id: "c3-fail-1",
    itemCode: "C3",
    text: "帮我写一个好的提示词,要能让 AI 回答得更好",
    expectedPass: false,
    label: "无结构(应不通过)",
  },

  // G2 cases
  {
    id: "g2-pass-1",
    itemCode: "G2",
    text: "推荐 https://learnprompting.org 这个网站,是目前最全面的 Prompt Engineering 教程,从基础到高级技巧都有,而且有中文版本,适合我们训练营的学员系统学习提示词技巧。",
    expectedPass: true,
    label: "含链接+推荐理由(应通过)",
  },
  {
    id: "g2-fail-1",
    itemCode: "G2",
    text: "大家去看看那个 AI 文章吧,挺好的",
    expectedPass: false,
    label: "无链接无具体内容(应不通过)",
  },
];

// --- API call function ---
interface LlmResult {
  pass: boolean;
  score: number;
  reason: string;
}

interface EvalResult {
  testId: string;
  model: string;
  success: boolean;
  result: LlmResult | null;
  error: string | null;
  latencyMs: number;
  jsonValid: boolean;
}

async function callLlm(
  model: string,
  promptText: string,
  timeoutMs = 30000
): Promise<{ result: LlmResult; latencyMs: number }> {
  const start = Date.now();

  const response = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model,
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: promptText }],
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });

  const latencyMs = Date.now() - start;

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`HTTP ${response.status}: ${body.slice(0, 200)}`);
  }

  const body = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = body.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new Error("Missing content in response");
  }

  const parsed = JSON.parse(content) as LlmResult;
  if (
    typeof parsed.pass !== "boolean" ||
    typeof parsed.score !== "number" ||
    typeof parsed.reason !== "string"
  ) {
    throw new Error(`Invalid JSON shape: ${content.slice(0, 200)}`);
  }

  return { result: parsed, latencyMs };
}

function renderPrompt(itemCode: string, text: string): string {
  const item = ITEM_BODIES[itemCode];
  if (!item) throw new Error(`Unknown item: ${itemCode}`);
  return `${SYSTEM_PREFIX}\n\n${item.prompt}\n学员提交:\n"""\n${text}\n"""`;
}

// --- Main evaluation loop ---
async function runEval(): Promise<void> {
  console.log("=== Sub4 LLM Blind Evaluation ===");
  console.log(`Models: ${MODELS.join(", ")}`);
  console.log(`Test cases: ${TEST_CASES.length}`);
  console.log(`Total API calls: ${MODELS.length * TEST_CASES.length}`);
  console.log("");

  const results: EvalResult[] = [];
  let callCount = 0;
  const totalCalls = MODELS.length * TEST_CASES.length;

  for (const tc of TEST_CASES) {
    const prompt = renderPrompt(tc.itemCode, tc.text);

    for (const model of MODELS) {
      callCount++;
      const progress = `[${callCount}/${totalCalls}]`;

      try {
        const { result, latencyMs } = await callLlm(model, prompt);
        results.push({
          testId: tc.id,
          model,
          success: true,
          result,
          error: null,
          latencyMs,
          jsonValid: true,
        });
        const match = result.pass === tc.expectedPass ? "✓" : "✗";
        console.log(
          `${progress} ${model} | ${tc.id} | ${match} pass=${result.pass} score=${result.score} | ${latencyMs}ms`
        );
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        results.push({
          testId: tc.id,
          model,
          success: false,
          result: null,
          error: errMsg,
          latencyMs: 0,
          jsonValid: false,
        });
        console.log(`${progress} ${model} | ${tc.id} | ERROR: ${errMsg.slice(0, 100)}`);
      }

      // Rate limit: 200ms between calls
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  // --- Generate report ---
  console.log("\n\n========== EVALUATION REPORT ==========\n");

  for (const model of MODELS) {
    const modelResults = results.filter((r) => r.model === model);
    const successes = modelResults.filter((r) => r.success);
    const failures = modelResults.filter((r) => !r.success);
    const correctPredictions = successes.filter(
      (r) =>
        r.result!.pass ===
        TEST_CASES.find((tc) => tc.id === r.testId)!.expectedPass
    );
    const avgLatency =
      successes.length > 0
        ? Math.round(
            successes.reduce((sum, r) => sum + r.latencyMs, 0) /
              successes.length
          )
        : 0;
    const p95Latency =
      successes.length > 0
        ? successes
            .map((r) => r.latencyMs)
            .sort((a, b) => a - b)
            [Math.floor(successes.length * 0.95)]
        : 0;

    console.log(`--- ${model} ---`);
    console.log(`  API 成功率: ${successes.length}/${modelResults.length}`);
    console.log(`  JSON 合规率: ${successes.length}/${modelResults.length}`);
    console.log(
      `  判定准确率: ${correctPredictions.length}/${successes.length} (${successes.length > 0 ? Math.round((correctPredictions.length / successes.length) * 100) : 0}%)`
    );
    console.log(`  平均延迟: ${avgLatency}ms`);
    console.log(`  P95 延迟: ${p95Latency}ms`);

    if (failures.length > 0) {
      console.log(`  失败详情:`);
      for (const f of failures) {
        console.log(`    - ${f.testId}: ${f.error?.slice(0, 80)}`);
      }
    }

    // Show incorrect predictions
    const incorrectPredictions = successes.filter(
      (r) =>
        r.result!.pass !==
        TEST_CASES.find((tc) => tc.id === r.testId)!.expectedPass
    );
    if (incorrectPredictions.length > 0) {
      console.log(`  判定偏差:`);
      for (const r of incorrectPredictions) {
        const tc = TEST_CASES.find((t) => t.id === r.testId)!;
        console.log(
          `    - ${r.testId} (${tc.label}): 预期 pass=${tc.expectedPass}, 实际 pass=${r.result!.pass}, score=${r.result!.score}`
        );
        console.log(`      reason: ${r.result!.reason.slice(0, 80)}`);
      }
    }
    console.log("");
  }

  // --- Summary table ---
  console.log("========== SUMMARY TABLE ==========\n");
  console.log(
    "| 模型 | 成功率 | 准确率 | 平均延迟 | P95 延迟 | 推荐 |"
  );
  console.log("|------|--------|--------|----------|----------|------|");

  for (const model of MODELS) {
    const modelResults = results.filter((r) => r.model === model);
    const successes = modelResults.filter((r) => r.success);
    const correct = successes.filter(
      (r) =>
        r.result!.pass ===
        TEST_CASES.find((tc) => tc.id === r.testId)!.expectedPass
    );
    const avgLat =
      successes.length > 0
        ? Math.round(
            successes.reduce((s, r) => s + r.latencyMs, 0) / successes.length
          )
        : 0;
    const p95 =
      successes.length > 0
        ? successes
            .map((r) => r.latencyMs)
            .sort((a, b) => a - b)
            [Math.floor(successes.length * 0.95)]
        : 0;
    const accuracy =
      successes.length > 0
        ? Math.round((correct.length / successes.length) * 100)
        : 0;
    const rec = accuracy >= 90 ? "✅" : accuracy >= 75 ? "🔶" : "❌";

    console.log(
      `| ${model} | ${successes.length}/${modelResults.length} | ${accuracy}% | ${avgLat}ms | ${p95}ms | ${rec} |`
    );
  }

  // Write raw results to JSON
  const outputPath = "scripts/sub4-eval-results.json";
  const { writeFileSync } = await import("node:fs");
  writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`\n原始数据已保存到: ${outputPath}`);
}

runEval().catch(console.error);
