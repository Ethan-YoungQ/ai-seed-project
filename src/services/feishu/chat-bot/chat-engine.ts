import type { LlmChatClient, ChatMessage } from "../../v2/llm-scoring-client.js";
import { LlmRetryableError } from "../../../domain/v2/errors.js";
import type { ConversationMemory } from "./conversation-memory.js";
import type { RateLimiter } from "./rate-limiter.js";
import { buildSystemPrompt, type AssistantRole } from "./persona.js";
import type { ChatContextBlock } from "./recent-context.js";

export interface ChatEngineRepo {
  findMemberByOpenId(openId: string): {
    id: string;
    displayName: string;
    roleType: string;
    isParticipant: boolean;
    isExcludedFromBoard: boolean;
    currentLevel: number;
  } | null;
  getLevelStatus?(memberId: string): LevelStatus | null;
}

export interface LevelStatus {
  memberName: string;
  rank: number | null;
  currentLevel: number;
  currentLevelName: string;
  nextLevel: number | null;
  nextLevelName: string | null;
  totalScore: number;
  dimensions: { K: number; H: number; C: number; S: number; G: number };
}

export interface ChatEngineDeps {
  llmClient: LlmChatClient;
  memory: ConversationMemory;
  rateLimiter: RateLimiter;
  repo: ChatEngineRepo;
}

export interface ChatReplyInput {
  chatId: string;
  openId: string;
  messageId: string;
  cleanedText: string;
  contextBlocks?: ChatContextBlock[];
}

export type ChatReplyUsed =
  | "llm"
  | "level_status"
  | "rate_limited"
  | "error_fallback"
  | "empty_prompt";

export interface ChatReplyResult {
  replyText: string;
  used: ChatReplyUsed;
  latencyMs: number;
}

export interface ChatEngine {
  reply(input: ChatReplyInput): Promise<ChatReplyResult>;
}

const LLM_TIMEOUT_MS = 15000;
const LLM_TEMPERATURE = 0.7;
const MAX_CONTEXT_CHARS = 20_000;

function buildRateLimitedReply(
  memberName: string,
  retryAfterSeconds: number | undefined,
  reason: string | undefined
): string {
  const secs = retryAfterSeconds ?? 30;
  if (reason === "user_hourly") {
    return `@${memberName} 你今天问得有点多啦，歇会儿再来找我吧 ⏰`;
  }
  if (reason === "chat_per_minute") {
    return `@${memberName} 群里大家都在问我，稍等 ${secs} 秒再来哦 ⏰`;
  }
  return `@${memberName} 你问得太快啦，${secs} 秒后再问我哦 ⏰`;
}

function formatReply(
  memberName: string,
  content: string,
  role: AssistantRole
): string {
  void memberName;
  void role;
  return content;
}

async function callWithRetry(
  fn: () => Promise<string>
): Promise<string> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof LlmRetryableError) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return await fn();
    }
    throw err;
  }
}

function buildContextMessage(blocks: ChatContextBlock[] | undefined): ChatMessage | null {
  const usableBlocks = (blocks ?? []).filter((block) => block.content.trim().length > 0);
  if (usableBlocks.length === 0) return null;

  const content = usableBlocks
    .map((block) => `【${block.title}】\n${block.content.trim()}`)
    .join("\n\n");

  return {
    role: "user",
    content:
      "以下是群聊最近上下文，只能作为回答依据之一。请优先基于这些上下文回答；" +
      "如果上下文不足或文件解析失败，要明确说明缺少什么，不要编造。\n\n" +
      content.slice(0, MAX_CONTEXT_CHARS),
  };
}

function isLevelStatusQuestion(text: string): boolean {
  const compact = text.replace(/\s+/g, "");
  return /潜力股|段位|晋升|升级|升到|评判标准|加分项目|得分规则|天梯榜规则|为什么.*(没|未|不|还).*升/.test(compact);
}

function formatDimensions(dimensions: LevelStatus["dimensions"]): string {
  return `K${dimensions.K} / H${dimensions.H} / C${dimensions.C} / S${dimensions.S} / G${dimensions.G}`;
}

function buildLevelStatusReply(memberName: string, question: string, status: LevelStatus): string {
  const nextLevel = status.nextLevel && status.nextLevelName
    ? `Lv${status.nextLevel} ${status.nextLevelName}`
    : "最高段位";
  const rankText = status.rank ? `，当前天梯榜第 ${status.rank} 名` : "";
  const lines = [
    `@${memberName} 你现在是 Lv${status.currentLevel} ${status.currentLevelName}，总分 ${status.totalScore} 分${rankText}。`,
    `当前维度：${formatDimensions(status.dimensions)}。下一段位：${nextLevel}。`,
  ];

  if (status.currentLevel === 1 && status.nextLevel === 2) {
    const csg = status.dimensions.C + status.dimensions.S + status.dimensions.G;
    if (status.totalScore >= 24 && csg === 0) {
      lines.push("你卡住的主要原因是缺少 C/S/G 信号：作品/方法分享、同伴互动、经验复盘任意方向出现有效得分后，就能触发 Lv2 的主路径。");
    } else if (status.totalScore < 24) {
      lines.push(`Lv2 的最快路径是 24 分以上且 C/S/G 有有效贡献；你还差 ${24 - status.totalScore} 分，同时需要至少一次作品、互动或复盘类贡献。`);
    } else {
      lines.push("Lv2 还可以走强实践或多维路径：32 分且单维达到 8 分，或 20 分以上、两个维度 5 分以上且 C/S/G 中有一个维度 5 分以上。");
    }
  }

  if (/如何.*潜力股|怎么.*潜力股|成为潜力股/.test(question.replace(/\s+/g, "")) && status.currentLevel === 1) {
    lines.push("如果你问的是“怎么从潜力股往上升”，重点不是多刷屏，而是交付一次可复用的 AI 实践、给同学有效反馈，或写一段真实复盘。");
  }

  lines.push("如果你觉得有互动或作品漏记，可以直接说“@奇点小助教 查一下我的某条消息/点赞”，我会按消息记录核对。");
  return lines.join("\n");
}

function buildMissingLevelStatusReply(memberName: string): string {
  return [
    `@${memberName} 我没有在学员天梯榜里找到你当前账号的段位数据。`,
    "如果你是在帮同学测试，请让学员本人 @我，或直接说明要查哪位同学；我会按榜单总分、K/H/C/S/G 维度和晋升规则核对。",
  ].join("\n");
}

export function createChatEngine(deps: ChatEngineDeps): ChatEngine {
  return {
    async reply(input: ChatReplyInput): Promise<ChatReplyResult> {
      const t0 = Date.now();

      if (!input.cleanedText.trim()) {
        return {
          replyText: "你好！有什么可以帮你的吗？可以直接告诉我你的问题 🤖",
          used: "empty_prompt",
          latencyMs: Date.now() - t0
        };
      }

      const member = deps.repo.findMemberByOpenId(input.openId);
      const role = (member?.roleType ?? "student") as AssistantRole;
      const memberName = member?.displayName ?? "同学";

      if (member && isLevelStatusQuestion(input.cleanedText)) {
        const status = deps.repo.getLevelStatus?.(member.id);
        if (status) {
          return {
            replyText: buildLevelStatusReply(memberName, input.cleanedText, status),
            used: "level_status",
            latencyMs: Date.now() - t0,
          };
        }
        return {
          replyText: buildMissingLevelStatusReply(memberName),
          used: "level_status",
          latencyMs: Date.now() - t0,
        };
      }

      const decision = deps.rateLimiter.check(input.openId, input.chatId);
      if (!decision.allowed) {
        return {
          replyText: buildRateLimitedReply(
            memberName,
            decision.retryAfterSeconds,
            decision.reason
          ),
          used: "rate_limited",
          latencyMs: Date.now() - t0
        };
      }

      const contextMessage = buildContextMessage(input.contextBlocks);
      const messages: ChatMessage[] = [
        { role: "system", content: buildSystemPrompt(role, memberName) },
        ...deps.memory.get(input.openId),
        ...(contextMessage ? [contextMessage] : []),
        { role: "user", content: input.cleanedText }
      ];

      let content: string;
      try {
        content = await callWithRetry(() =>
          deps.llmClient.chat(messages, {
            timeoutMs: LLM_TIMEOUT_MS,
            temperature: LLM_TEMPERATURE
          })
        );
      } catch {
        return {
          replyText: `@${memberName} 我现在有点忙，稍后再问我哦 🤖`,
          used: "error_fallback",
          latencyMs: Date.now() - t0
        };
      }

      deps.rateLimiter.markUsed(input.openId, input.chatId);
      deps.memory.append(input.openId, input.cleanedText, content);

      return {
        replyText: formatReply(memberName, content, role),
        used: "llm",
        latencyMs: Date.now() - t0
      };
    }
  };
}
