import type { OperationalFacts, ScoreFact, InteractionFact } from "./fact-service.js";
import type { BotQuestionIntent } from "./intent-router.js";
import { getRuleKnowledgeText } from "./rule-knowledge.js";

export interface FactAnswerInput {
  intent: BotQuestionIntent;
  facts: OperationalFacts | null;
  question: string;
}

export interface FactAnswerResult {
  handled: boolean;
  text: string;
}

const PASS_THROUGH_INTENTS = new Set<BotQuestionIntent["kind"]>([
  "course_or_homework_qa",
  "general_chat",
]);

function formatDimensions(dimensions: Record<"K" | "H" | "C" | "S" | "G", number>): string {
  return `K${dimensions.K} / H${dimensions.H} / C${dimensions.C} / S${dimensions.S} / G${dimensions.G}`;
}

function formatRank(rank: number | null): string {
  return rank === null ? "暂无排名" : `第 ${rank} 名`;
}

function formatNextLevel(facts: Extract<OperationalFacts, { kind: "found" }>): string {
  const { status } = facts;
  if (!status.nextLevel || !status.nextLevelName) return "下一段位：已是最高段位。缺口：暂无。";

  const nextLevel = `Lv${status.nextLevel} ${status.nextLevelName}`;
  if (status.currentLevel === 1 && status.nextLevel === 2) {
    const csg = status.dimensions.C + status.dimensions.S + status.dimensions.G;
    if (status.totalScore >= 24 && csg === 0) {
      return `下一段位：${nextLevel}。缺口：总分已达到 24 分主路径门槛，但 C/S/G 有效贡献仍为 0，需要至少一条可审计的作品/互动/复盘贡献。`;
    }
    if (status.totalScore < 24) {
      const scoreGap = 24 - status.totalScore;
      const signalGap = csg > 0 ? "C/S/G 已有有效贡献" : "还需要至少一条 C/S/G 有效贡献";
      return `下一段位：${nextLevel}。缺口：主路径还差 ${scoreGap} 分，且${signalGap}。`;
    }
    return `下一段位：${nextLevel}。缺口：需要继续满足 Lv2 的 C/S/G 或多维实践信号。`;
  }

  return `下一段位：${nextLevel}。缺口：请按该段位对应的总分、维度和实践信号规则核对。`;
}

function buildMissingMemberAnswer(): string {
  return [
    "我没有在学员天梯榜里找到你当前账号的段位/分数数据。",
    "如果你是在帮同学测试，请让学员本人 @我；如果要查指定同学，请补充姓名或转发/引用原消息，我再按榜单和事实记录核对。",
  ].join("\n");
}

function buildMissingStatusAnswer(facts: Extract<OperationalFacts, { kind: "missing_status" }>): string {
  return [
    `@${facts.member.displayName} 我找到了你的学员账号，但暂时没有查到可用的段位快照。`,
    "请让运营先确认榜单数据是否已同步；同步后我会按总分、K/H/C/S/G 维度和晋升规则回答。",
  ].join("\n");
}

function formatScoreFact(fact: ScoreFact): string {
  const audit = [
    `categoryOrItem=${fact.categoryOrItem}`,
    `source=${fact.source}`,
    `status=${fact.status}`,
    fact.eventId ? `eventId=${fact.eventId}` : null,
    fact.sourceRef ? `sourceRef=${fact.sourceRef}` : null,
    fact.sourceMessageId ? `sourceMessageId=${fact.sourceMessageId}` : null,
  ].filter(Boolean).join(" ");

  const decided = fact.decidedAt ?? fact.createdAt;
  return `- ${decided} ${fact.dimension}${fact.scoreDelta >= 0 ? "+" : ""}${fact.scoreDelta}，${audit}`;
}

function formatInteractionFact(fact: InteractionFact): string {
  const audit = [
    `categoryOrItem=${fact.categoryOrItem}`,
    fact.sourceRef ? `sourceRef=${fact.sourceRef}` : null,
    fact.eventId ? `eventId=${fact.eventId}` : null,
    fact.sourceMessageId ? `sourceMessageId=${fact.sourceMessageId}` : null,
    `status=${fact.status}`,
  ].filter(Boolean).join(" ");

  return `- ${fact.occurredAt} ${fact.type} ${fact.scoreDelta >= 0 ? "+" : ""}${fact.scoreDelta}，${audit}`;
}

function buildLevelStatusAnswer(facts: Extract<OperationalFacts, { kind: "found" }>): string {
  const { status } = facts;
  return [
    `@${facts.member.displayName} 这不是泛泛聊天，我按当前榜单事实回答：你现在是 Lv${status.currentLevel} ${status.currentLevelName}，总分 ${status.totalScore} 分，排名 ${formatRank(status.rank)}。`,
    `当前维度：${formatDimensions(status.dimensions)}。`,
    formatNextLevel(facts),
  ].join("\n");
}

function buildScoreBreakdownAnswer(facts: Extract<OperationalFacts, { kind: "found" }>): string {
  const { status } = facts;
  const scoreLines = facts.scoreFacts.length > 0
    ? facts.scoreFacts.slice(0, 5).map(formatScoreFact)
    : ["- 暂时没有查到最近 score fact。"];

  return [
    `@${facts.member.displayName} 当前总分 ${status.totalScore} 分，排名 ${formatRank(status.rank)}。`,
    `维度分：${formatDimensions(status.dimensions)}。`,
    "最近 score facts：",
    ...scoreLines,
  ].join("\n");
}

function buildCsInteractionAnswer(facts: Extract<OperationalFacts, { kind: "found" }>): string {
  if (facts.interactionFacts.length === 0) {
    return [
      `@${facts.member.displayName} 暂时没有查到已计入的 C/S 互动分。`,
      "我不会编造互动记录；如果你觉得有点赞、互助或反馈漏记，请转发/引用原消息，我再按消息记录核对。",
    ].join("\n");
  }

  return [
    `@${facts.member.displayName} 查到最近已计入的 C/S 互动事实：`,
    ...facts.interactionFacts.slice(0, 5).map(formatInteractionFact),
  ].join("\n");
}

function buildRulesAnswer(question: string): string {
  return [
    "按当前轻量规则知识库：",
    getRuleKnowledgeText(question),
    "结论：Prompt 必须发吗？不是唯一硬条件；关键是证据能被核对，并能对应到 K/H/C/S/G 的有效贡献。",
  ].join("\n");
}

function buildMissingScoreAnswer(facts: Extract<OperationalFacts, { kind: "found" }>): string {
  const scoreLines = facts.scoreFacts.length > 0
    ? facts.scoreFacts.slice(0, 5).map(formatScoreFact)
    : ["- 暂时没有查到最近 score fact。"];

  return [
    `@${facts.member.displayName} 我先列出近期已计入/已记录的分数事实，不能直接判断你说的那条是否已处理：`,
    ...scoreLines,
    "下一步：请转发/引用原消息核对，或说明消息大概时间、作品/作业名称和希望核对的得分项；我再按原消息与审计记录查漏分。",
  ].join("\n");
}

export function buildFactAnswer(input: FactAnswerInput): FactAnswerResult {
  if (PASS_THROUGH_INTENTS.has(input.intent.kind)) {
    return { handled: false, text: "" };
  }

  if (input.intent.kind === "rules_query") {
    return { handled: true, text: buildRulesAnswer(input.question) };
  }

  if (!input.facts) {
    return { handled: false, text: "" };
  }

  if (input.facts.kind === "missing_member") {
    return { handled: true, text: buildMissingMemberAnswer() };
  }

  if (input.facts.kind === "missing_status") {
    return { handled: true, text: buildMissingStatusAnswer(input.facts) };
  }

  switch (input.intent.kind) {
    case "level_status":
      return { handled: true, text: buildLevelStatusAnswer(input.facts) };
    case "score_breakdown":
      return { handled: true, text: buildScoreBreakdownAnswer(input.facts) };
    case "cs_interaction_check":
      return { handled: true, text: buildCsInteractionAnswer(input.facts) };
    case "score_missing_check":
      return { handled: true, text: buildMissingScoreAnswer(input.facts) };
    default:
      return { handled: false, text: "" };
  }
}
