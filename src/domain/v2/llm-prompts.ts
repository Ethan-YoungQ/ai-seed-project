export type LlmScorableItemCode = "K3" | "K4" | "C1" | "C3" | "H2" | "G2";

export interface LlmPromptPayload {
  text: string;
  /**
   * Optional Feishu file_key for multimodal items (specifically H2
   * "实操截图"). When present, the LLM worker (Phase E4) downloads
   * the image via Feishu IM scope and routes to glm-4v-flash instead
   * of the text-only model. The prompt template includes a reference
   * to the image but the actual image bytes are NOT embedded in the
   * prompt text — the worker handles multimodal assembly.
   */
  fileKey?: string;
}

const SYSTEM_PREFIX = `你是 AI 训练营评分助手。根据学员的提交内容判断是否合格。
必须只输出严格 JSON,格式: {"pass": boolean, "score": number, "reason": string}
reason 必须用中文口语化表达,便于学员理解。`;

const ITEM_BODIES: Record<LlmScorableItemCode, string> = {
  K3: `评分项: K3 知识总结打卡
合格标准:
1. 有明确的 AI 相关知识点(至少 1 个)
2. 用学员自己的话表达,不是复制粘贴官方定义
3. 字数 >= 30
满分 3, 不合格 0。`,
  K4: `评分项: K4 AI 纠错或补充
合格标准:
1. 指出 AI 输出的具体错误或遗漏
2. 有明确的纠正或补充内容
3. 不是笼统的"AI 说错了"
满分 4, 不合格 0。`,
  C1: `评分项: C1 AI 创意用法
合格标准:
1. 描述一个具体的 AI 应用场景或新玩法
2. 有可执行性(不是空想)
3. 和学员本职工作或日常生活相关
满分 4, 不合格 0。`,
  C3: `评分项: C3 自创提示词模板
合格标准:
1. 模板有明确的结构(角色 / 任务 / 约束 / 输出 至少覆盖其中 2 项)
2. 可复用,不绑定单次对话
3. 有具体场景说明
满分 5, 不合格 0。`,
  H2: `评分项: H2 AI 实操分享
合格标准:
1. 描述清楚用了什么 AI 工具
2. 描述清楚做了什么任务
3. 描述清楚结果如何
4. 附带的截图应展示 AI 工具的实际使用界面（若有截图）
满分 3, 不合格 0。`,
  G2: `评分项: G2 课外好资源
合格标准:
1. 链接或内容确实和 AI 相关
2. 有简单的为什么推荐(至少一句话理由)
3. 不是纯广告
满分 3, 不合格 0。`
};

export function renderPrompt(
  itemCode: LlmScorableItemCode,
  payload: LlmPromptPayload
): string {
  const body = ITEM_BODIES[itemCode];
  if (!body) {
    throw new Error(`unknown llm item code: ${itemCode}`);
  }
  const safeText = payload.text ?? "";
  return `${SYSTEM_PREFIX}\n\n${body}\n学员提交:\n"""\n${safeText}\n"""`;
}
