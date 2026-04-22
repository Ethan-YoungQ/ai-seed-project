import type { LlmChatClient, ChatMessage } from "../../v2/llm-scoring-client.js";
import { LlmRetryableError } from "../../../domain/v2/errors.js";
import type { ConversationMemory } from "./conversation-memory.js";
import type { RateLimiter } from "./rate-limiter.js";
import { buildSystemPrompt, type AssistantRole } from "./persona.js";

export interface ChatEngineRepo {
  findMemberByOpenId(openId: string): {
    id: string;
    displayName: string;
    roleType: string;
    isParticipant: boolean;
    isExcludedFromBoard: boolean;
    currentLevel: number;
  } | null;
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
}

export type ChatReplyUsed =
  | "llm"
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
  if (role === "student") {
    return `${content}\n\n💬 欢迎其他同学也来分享你们的想法！`;
  }
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

      const messages: ChatMessage[] = [
        { role: "system", content: buildSystemPrompt(role, memberName) },
        ...deps.memory.get(input.openId),
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
