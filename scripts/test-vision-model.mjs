const API_KEY = process.env.LLM_API_KEY;
const BASE_URL = "https://open.bigmodel.cn/api/paas/v4";
const MODEL = "glm-4.6v-flash";

const prompt = `你是 AI 训练营评分助手。必须只输出严格 JSON: {"pass": boolean, "score": number, "reason": string}

评分项: H2 AI 实操分享。满分3,不合格0。合格标准: 描述清楚用了什么AI工具、做了什么任务、结果如何。

学员提交:
"""用 Claude 写了一段 python 脚本自动处理 CSV 数据,效果很好,跑通了本地环境,节省了两小时"""`;

console.log("Testing vision model:", MODEL);
const start = Date.now();

const res = await fetch(BASE_URL + "/chat/completions", {
  method: "POST",
  headers: {
    "content-type": "application/json",
    authorization: "Bearer " + API_KEY,
  },
  body: JSON.stringify({
    model: MODEL,
    response_format: { type: "json_object" },
    messages: [{ role: "user", content: prompt }],
  }),
  signal: AbortSignal.timeout(60000),
});

console.log("HTTP:", res.status, "Latency:", (Date.now() - start) + "ms");
const body = await res.json();
console.log("Response:", JSON.stringify(body, null, 2));
