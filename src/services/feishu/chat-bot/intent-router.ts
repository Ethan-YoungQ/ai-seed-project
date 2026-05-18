export type BotQuestionIntentKind =
  | "level_status"
  | "cs_interaction_check"
  | "score_missing_check"
  | "score_breakdown"
  | "rules_query"
  | "course_or_homework_qa"
  | "general_chat";

export interface BotQuestionIntent {
  kind: BotQuestionIntentKind;
}

const LEVEL_STATUS_PATTERNS = [
  /潜力股/,
  /等级|级别|升(?:级|阶)|晋级|当前.*段位|段位/,
  /研究员|达人|专家/,
];

const LEVEL_QUESTION_PATTERNS = [
  /为什么|为啥|怎么|怎样|如何/,
  /还是|成为|升(?:级|阶)|晋级|差.*多少|还差/,
  /是什么|什么|多少|现在/,
];

const CS_INTERACTION_PATTERNS = [
  /(?:c\s*[-/]\s*s|cs)\s*(?:点赞|互动).*?(?:算|计|有分|加分|得分|没算|没记|漏分)?/i,
  /(?:点赞|互动).*?(?:c\s*[-/]\s*s|cs).*?(?:算|计|有分|加分|得分|没算|没记|漏分)?/i,
  /(?:同学|互助|点赞|给同学).*?(?:算|计|有分|加分|得分|没算|没记|漏分)/,
  /(?:算|计|有分|加分|得分|没算|没记|漏分).*?(?:同学|互助|点赞|给同学)/,
];

const SCORE_MISSING_PATTERNS = [
  /漏分|没算|没记|没加|少算|少记|补分|查分|分数.*不对/,
  /(?:刚才|刚刚|那条|这条|海报|作业|作品|帖子|消息).*?(?:漏|没算|没记|没加|少算|少记|分)/,
];

const RULES_PATTERNS = [
  /规则|天梯榜|排行榜|计分规则|评分规则|积分规则/,
  /(?:prompt|提示词).*?(?:必须|一定|要不要|要发|发吗)/i,
  /(?:必须|一定|要不要).*?(?:prompt|提示词)/i,
  /得分攻略|加分攻略|积分攻略|怎么得分|如何得分|怎么加分|如何加分/,
];

const SCORE_BREAKDOWN_PATTERNS = [
  /(?:多少分|几分|排名第几|第几名)/,
  /(?:天梯榜|排行榜).*?(?:第几|排名|名次)/,
  /(?:我的|我).*?(?:维度分|分数|排名|天梯榜|排行榜)/,
  /(?:维度分|分数|排名).*?(?:多少|第几|明细|详情)/,
];

const COURSE_OR_HOMEWORK_PATTERNS = [
  /结合(?:上文|前文|刚才|上下文|我交的|作业|文件)/,
  /rag|prompt|提示词|作业|课程|课上|题目|解释|帮我看|分析一下/i,
  /(?:案例|这段|这题).*?(?:怎么理解|是什么意思|解释一下)/,
];

function normalizeQuestion(rawText: string): string {
  return rawText
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[？?！!。.,，]/g, "");
}

function matchesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

export function classifyBotQuestionIntent(rawText: string): BotQuestionIntent {
  const text = normalizeQuestion(rawText);
  if (text.length === 0) return { kind: "general_chat" };

  if (matchesAny(text, LEVEL_STATUS_PATTERNS) && matchesAny(text, LEVEL_QUESTION_PATTERNS)) {
    return { kind: "level_status" };
  }

  if (matchesAny(text, CS_INTERACTION_PATTERNS)) {
    return { kind: "cs_interaction_check" };
  }

  if (matchesAny(text, SCORE_MISSING_PATTERNS)) {
    return { kind: "score_missing_check" };
  }

  if (matchesAny(text, SCORE_BREAKDOWN_PATTERNS)) {
    return { kind: "score_breakdown" };
  }

  if (matchesAny(text, RULES_PATTERNS)) {
    return { kind: "rules_query" };
  }

  if (matchesAny(text, COURSE_OR_HOMEWORK_PATTERNS)) {
    return { kind: "course_or_homework_qa" };
  }

  return { kind: "general_chat" };
}
