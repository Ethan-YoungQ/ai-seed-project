import type { NormalizedFeishuMessage } from "./normalize-message.js";

export type OperationsAdminCommand =
  | "admin_panel"
  | "review_queue"
  | "manual_adjust"
  | "member_mgmt"
  | "dashboard"
  | "quiz"
  | "peer_review";

export type OperationsIntent =
  | { kind: "admin_command"; command: OperationsAdminCommand }
  | { kind: "score_opt_out"; reason: string }
  | { kind: "score_candidate"; reason: string }
  | { kind: "learner_qa"; reason: string }
  | { kind: "none" };

export interface OperationsIntentContext {
  botOpenId?: string;
}

const ADMIN_COMMANDS: Array<{
  command: OperationsAdminCommand;
  keywords: string[];
  requiresBotMention?: boolean;
}> = [
  { command: "review_queue", keywords: ["审核", "审核队列", "待审核", "复核", "复核队列"] },
  { command: "quiz", keywords: ["测验", "随堂测验", "考试"] },
  { command: "peer_review", keywords: ["互评", "互评投票", "投票"] },
  { command: "manual_adjust", keywords: ["调分", "手动调分"] },
  { command: "member_mgmt", keywords: ["成员管理", "成员"] },
  { command: "admin_panel", keywords: ["管理面板", "控制面板", "管理"] },
  { command: "dashboard", keywords: ["看板", "排行", "排行榜", "成长看板", "天梯榜"], requiresBotMention: true },
];

const SCORE_OPT_OUT_RE =
  /(不用加分|不要加分|不用计分|不要计分|不用评分|不要评分|别加分|别计分|不算分|别算分|纯瞎聊|撤回加分|撤销加分|取消加分)/;
const SCORE_CANDIDATE_RE =
  /(AI实践|AI实战|海报|复盘|提示词|prompt|作品|作业|生成了|做了|分享)/i;
const LEARNER_QA_RE =
  /(怎么|如何|规则|提交|作业|任务|在哪|哪里|什么时候|多少分|为什么|能不能|可以吗|咋)/;
const MENTIONED_BOT_REQUEST_RE =
  /(帮我|帮忙|请你|麻烦|看下|看看|分析|讲一下|讲讲|解释|分享一下|推荐|给我|能否|可以帮)/;

export function classifyOperationsIntent(
  message: NormalizedFeishuMessage,
  context: OperationsIntentContext = {},
): OperationsIntent {
  const text = cleanIntentText(message.cleanedText || message.rawText);
  const mentionedBot = Boolean(
    context.botOpenId && message.mentionedBotIds.includes(context.botOpenId),
  );

  for (const candidate of ADMIN_COMMANDS) {
    if (candidate.requiresBotMention && !mentionedBot) continue;
    if (candidate.keywords.some((keyword) => text.includes(keyword))) {
      return { kind: "admin_command", command: candidate.command };
    }
  }

  if (SCORE_OPT_OUT_RE.test(text)) {
    return { kind: "score_opt_out", reason: "explicit_opt_out" };
  }

  if (mentionedBot && (LEARNER_QA_RE.test(text) || MENTIONED_BOT_REQUEST_RE.test(text))) {
    return { kind: "learner_qa", reason: "learner_question" };
  }

  if (isScoreCandidateMessage(message, text)) {
    return { kind: "score_candidate", reason: "contribution_signal" };
  }

  return { kind: "none" };
}

function isScoreCandidateMessage(
  message: NormalizedFeishuMessage,
  normalizedText: string,
): boolean {
  if (message.messageType === "image") return true;
  if (message.attachmentTypes.includes("image")) return true;
  return SCORE_CANDIDATE_RE.test(normalizedText);
}

function cleanIntentText(raw: string): string {
  return raw
    .replace(/@\S+/g, "")
    .replace(/[\s　 ]+/g, "")
    .replace(/[​-‏﻿]+/g, "")
    .replace(/[。！？，、；：""''（）《》【】…—！￥：“”‘’\-\+\.\,\!\?\:\;\(\)\[\]\{\}]/g, "")
    .trim();
}
