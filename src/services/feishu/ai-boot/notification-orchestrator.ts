import type { AiBootNotifyPolicy } from "../../../domain/v3/ai-boot-types.js";
import type { ScoringDecision } from "../../../domain/v3/scoring-decision.js";

const GLOBAL_COOLDOWN_MS = 120_000;
const ROLLING_CHAT_WINDOW_MS = 60 * 60 * 1_000;
const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1_000;
const TOPIC_TTL_MS = 24 * 60 * 60 * 1_000;
const MAX_STUDENT_DAILY_PRAISE = 3;
const MAX_CHAT_HOURLY_PRAISE = 5;

const PRAISEABLE_CATEGORIES = new Set<ScoringDecision["category"]>([
  "ai_artifact",
  "ai_practice_reflection",
  "prompt_or_method",
  "resource_recommendation",
  "peer_help",
  "formal_task",
]);

export interface NotificationState {
  lastGlobalPraiseAt: number;
  praiseByStudentToday: Map<string, number>;
  praiseByChatHour: Map<string, number>;
  recentTopicHashes: Map<string, number>;
}

export function createNotificationState(): NotificationState {
  return {
    lastGlobalPraiseAt: 0,
    praiseByStudentToday: new Map(),
    praiseByChatHour: new Map(),
    recentTopicHashes: new Map(),
  };
}

export function decideNotification(input: {
  decision: ScoringDecision;
  memberId: string;
  chatId: string;
  topicHash: string;
  now: number;
  state: NotificationState;
}): { shouldSend: boolean; policy: AiBootNotifyPolicy; reason: string } {
  const { decision, state, now } = input;

  if (decision.category === "daily_participation") {
    return silent("daily_participation");
  }

  if (decision.status !== "approved") {
    return silent(`status_${decision.status}`);
  }

  if (decision.notifyPolicy !== "group_praise") {
    return silent(`policy_${decision.notifyPolicy}`);
  }

  if (decision.confidence !== "high") {
    return silent(`confidence_${decision.confidence}`);
  }

  if (!PRAISEABLE_CATEGORIES.has(decision.category)) {
    return silent(`category_${decision.category}`);
  }

  if (decision.scoreDelta <= 0) {
    return silent("non_positive_score");
  }

  pruneRecentTopics(state.recentTopicHashes, now);

  const topicLastSeenAt = state.recentTopicHashes.get(input.topicHash);
  if (topicLastSeenAt !== undefined && now - topicLastSeenAt < TOPIC_TTL_MS) {
    return silent("duplicate_topic");
  }

  if (
    state.lastGlobalPraiseAt > 0 &&
    now - state.lastGlobalPraiseAt < GLOBAL_COOLDOWN_MS
  ) {
    return silent("global_cooldown");
  }

  const studentKey = `${input.memberId}:${shanghaiDayKey(now)}`;
  const studentCount = state.praiseByStudentToday.get(studentKey) ?? 0;
  if (studentCount >= MAX_STUDENT_DAILY_PRAISE) {
    return silent("student_daily_cap");
  }

  pruneRollingChatPraises(state.praiseByChatHour, now);

  const chatCount = countRollingChatPraises(
    state.praiseByChatHour,
    input.chatId,
    now
  );
  if (chatCount >= MAX_CHAT_HOURLY_PRAISE) {
    return silent("chat_hourly_cap");
  }

  state.lastGlobalPraiseAt = now;
  state.praiseByStudentToday.set(studentKey, studentCount + 1);
  state.praiseByChatHour.set(
    rollingChatPraiseKey(input.chatId, now, state.praiseByChatHour.size),
    now
  );
  state.recentTopicHashes.set(input.topicHash, now);

  return {
    shouldSend: true,
    policy: "group_praise",
    reason: "allowed",
  };
}

export function buildPraiseText(input: {
  memberName: string;
  decision: ScoringDecision;
}): string {
  const category = categoryLabel(input.decision.category);
  const reason = compact(input.decision.reason, 34);
  const evidence = compact(input.decision.evidence, 34);

  return `表扬${input.memberName}：${category}获${input.decision.scoreDelta}分。${reason}；依据：${evidence}`;
}

function silent(reason: string): {
  shouldSend: false;
  policy: "silent";
  reason: string;
} {
  return {
    shouldSend: false,
    policy: "silent",
    reason,
  };
}

function pruneRecentTopics(topicHashes: Map<string, number>, now: number): void {
  for (const [topicHash, seenAt] of topicHashes) {
    if (now - seenAt >= TOPIC_TTL_MS) {
      topicHashes.delete(topicHash);
    }
  }
}

function shanghaiDayKey(now: number): string {
  return new Date(now + SHANGHAI_OFFSET_MS).toISOString().slice(0, 10);
}

function pruneRollingChatPraises(
  chatPraises: Map<string, number>,
  now: number
): void {
  for (const [key, praisedAt] of chatPraises) {
    if (now - praisedAt >= ROLLING_CHAT_WINDOW_MS) {
      chatPraises.delete(key);
    }
  }
}

function countRollingChatPraises(
  chatPraises: Map<string, number>,
  chatId: string,
  now: number
): number {
  const prefix = rollingChatPraisePrefix(chatId);
  let count = 0;

  for (const [key, praisedAt] of chatPraises) {
    if (key.startsWith(prefix) && now - praisedAt < ROLLING_CHAT_WINDOW_MS) {
      count += 1;
    }
  }

  return count;
}

function rollingChatPraiseKey(
  chatId: string,
  praisedAt: number,
  nonce: number
): string {
  return `${rollingChatPraisePrefix(chatId)}${praisedAt}:${nonce}`;
}

function rollingChatPraisePrefix(chatId: string): string {
  return `${encodeURIComponent(chatId)}:`;
}

function categoryLabel(category: ScoringDecision["category"]): string {
  switch (category) {
    case "ai_artifact":
      return "AI作品";
    case "ai_practice_reflection":
      return "AI实践复盘";
    case "prompt_or_method":
      return "提示词方法";
    case "resource_recommendation":
      return "资源推荐";
    case "peer_help":
      return "同伴帮助";
    case "formal_task":
      return "正式任务";
    case "daily_participation":
      return "日常参与";
    case "operator_adjustment":
      return "运营调整";
  }
}

function compact(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1)}…`;
}
