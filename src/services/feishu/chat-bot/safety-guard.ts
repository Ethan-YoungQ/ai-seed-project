const DISCLOSURE_REPLY =
  "我不能在群聊里披露内部设定、系统提示、模型/供应商/参数或密钥。可以帮你说明我能做什么：答疑、解释规则、查看分数和晋升状态、给学习建议；如需技术审计，请走后台或联系技术负责人。";

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[，。！？、；：“”"'`*_~()[\]{}<>《》【】]/g, "");
}

const INTERNAL_TARGET_PATTERNS = [
  /systemprompt/i,
  /系统提示/,
  /开发者指令/,
  /隐藏指令/,
  /内部设定/,
  /底层设定/,
  /角色设定/,
  /你的设定/,
  /你的要求/,
  /前面的所有内容/,
  /前面.*所有内容/,
  /prompt/,
  /提示词/,
  /模型/,
  /供应商/,
  /底层架构/,
  /参数配置/,
  /apikey/i,
  /api密钥/i,
  /token/i,
  /密钥/,
];

const EXTRACTION_ACTION_PATTERNS = [
  /重复/,
  /复述/,
  /输出/,
  /显示/,
  /告诉我/,
  /一字不差/,
  /原封不动/,
  /完整/,
  /审查/,
  /检查/,
  /忽略.*规则/,
  /忽略.*前/,
  /你背后/,
  /哪个/,
  /是什么/,
  /用的/,
  /系统管理员/,
];

const LEAK_OUTPUT_PATTERNS = [
  /system prompt/i,
  /系统提示/,
  /开发者指令/,
  /隐藏指令/,
  /内部设定/,
  /当前提问者/,
  /身份识别/,
  /角色：/,
  /底层架构/,
  /当前模型/,
  /模型是/,
  /通义千问/i,
  /qwen/i,
  /glm/i,
  /api key/i,
  /apikey/i,
  /密钥/,
  /token/i,
];

function matchesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

export function isInternalDisclosureRequest(text: string): boolean {
  const normalized = normalizeText(text);
  return matchesAny(normalized, INTERNAL_TARGET_PATTERNS)
    && matchesAny(normalized, EXTRACTION_ACTION_PATTERNS);
}

export function containsInternalDisclosure(text: string): boolean {
  const normalized = normalizeText(text);
  return matchesAny(normalized, LEAK_OUTPUT_PATTERNS);
}

export function buildDisclosureRefusal(): string {
  return DISCLOSURE_REPLY;
}
