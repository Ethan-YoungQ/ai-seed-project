export type BotQuestionIntentKind =
  | "level_status"
  | "cs_interaction_check"
  | "score_missing_check"
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
];

const CS_INTERACTION_PATTERNS = [
  /c\s*\/\s*s/i,
  /点赞|评论|互动|同学.*(?:赞|点赞)|给同学/,
  /(?:点赞|评论|互动).*?(?:算|计|有分|加分|得分)/,
];

const SCORE_MISSING_PATTERNS = [
  /漏分|没算|没记|没加|少算|少记|补分|查分|分数.*不对/,
  /(?:刚才|刚刚|那条|这条|海报|作业|作品|帖子|消息).*?(?:漏|没算|没记|没加|少算|少记|分)/,
];

const RULES_PATTERNS = [
  /规则|天梯榜|排行榜|计分|评分|加分|得分|积分/,
  /prompt|提示词|必须发|一定要发|要不要发/,
];

const COURSE_OR_HOMEWORK_PATTERNS = [
  /结合(?:上文|前文|刚才|上下文|我交的|作业|文件)/,
  /rag|prompt|提示词|作业|课程|课上|题目|解释|帮我看|分析一下/i,
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

  if (matchesAny(text, RULES_PATTERNS.slice(0, 1)) && matchesAny(text, RULES_PATTERNS.slice(1))) {
    return { kind: "rules_query" };
  }

  if (matchesAny(text, COURSE_OR_HOMEWORK_PATTERNS)) {
    return { kind: "course_or_homework_qa" };
  }

  return { kind: "general_chat" };
}
