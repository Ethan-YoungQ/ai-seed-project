import { randomUUID } from "node:crypto";
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { loadLocalEnv } from "../config/load-env.js";
import { readAiBootConfig } from "../services/feishu/ai-boot/config.js";
import { createAiBootOrchestrator } from "../services/feishu/ai-boot/orchestrator.js";
import { LarkFeishuApiClient } from "../services/feishu/client.js";
import { readFeishuConfig } from "../services/feishu/config.js";
import type { NormalizedFeishuMessage } from "../services/feishu/normalize-message.js";
import { readLlmProviderConfig } from "../services/llm/provider-config.js";
import { OpenAiCompatibleLlmScoringClient } from "../services/v2/llm-scoring-client.js";
import { SqliteRepository } from "../storage/sqlite-repository.js";

interface LarkExportMessage {
  message_id: string;
  chat_id?: string;
  chat_type?: string;
  msg_type?: string;
  content?: string;
  create_time?: string;
  sender?: {
    id?: string;
    sender_type?: string;
  };
}

interface ReplayResult {
  dryRun: boolean;
  messagesSeen: number;
  userMessages: number;
  skippedWrongChat: number;
  replayed: number;
  scoreEventsBefore: number;
  scoreEventsAfter: number;
}

function parseArgs(argv: string[]) {
  const result: {
    messagesPath?: string;
    databaseUrl?: string;
    campId?: string;
    chatId?: string;
    limit?: number;
    dryRun: boolean;
  } = { dryRun: true };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--messages" && argv[i + 1]) {
      result.messagesPath = argv[i + 1];
      i += 1;
    } else if (arg === "--database-url" && argv[i + 1]) {
      result.databaseUrl = argv[i + 1];
      i += 1;
    } else if (arg === "--camp-id" && argv[i + 1]) {
      result.campId = argv[i + 1];
      i += 1;
    } else if (arg === "--chat-id" && argv[i + 1]) {
      result.chatId = argv[i + 1];
      i += 1;
    } else if (arg === "--limit" && argv[i + 1]) {
      result.limit = Number(argv[i + 1]);
      i += 1;
    } else if (arg === "--apply") {
      result.dryRun = false;
    }
  }

  return result;
}

function parseCreateTime(value: string | undefined): string {
  if (!value) {
    return new Date().toISOString();
  }
  const normalized = value.includes("T")
    ? value
    : `${value.replace(" ", "T")}:00+08:00`;
  const date = new Date(normalized);
  return Number.isFinite(date.getTime()) ? date.toISOString() : new Date().toISOString();
}

function inferFileKey(input: { content: string; msgType: string }) {
  if (input.msgType === "image") {
    return input.content.match(/\[Image:\s*([^\]\s]+)\]/)?.[1];
  }
  return input.content.match(/key="([^"]+)"/)?.[1];
}

function inferFileName(content: string) {
  return content.match(/name="([^"]+)"/)?.[1];
}

function attachmentTypes(input: { msgType: string; fileKey?: string }) {
  if (input.msgType === "image" || input.msgType === "file" || input.msgType === "media") {
    return [input.msgType];
  }
  if (input.msgType === "post" && input.fileKey) {
    return ["image"];
  }
  return [];
}

function normalizeExportedMessage(
  input: LarkExportMessage,
  fallbackChatId: string,
): NormalizedFeishuMessage | undefined {
  const senderId = input.sender?.id;
  if (!input.message_id || !senderId) {
    return undefined;
  }
  const msgType = input.msg_type ?? "text";
  const content = input.content ?? "";
  const fileKey = inferFileKey({ content, msgType });
  const fileName = inferFileName(content);
  const attachments = attachmentTypes({ msgType, fileKey });
  return {
    messageId: input.message_id,
    memberId: senderId,
    chatId: input.chat_id ?? fallbackChatId,
    chatType: input.chat_type ?? "group",
    senderType: input.sender?.sender_type,
    messageType: msgType,
    eventTime: parseCreateTime(input.create_time),
    rawText: msgType === "text" || msgType === "post" ? content : "",
    parsedTags: [],
    attachmentCount: attachments.length,
    attachmentTypes: attachments,
    fileKey,
    fileName,
    fileExt: fileName?.split(".").at(-1)?.toLowerCase(),
    documentText: "",
    documentParseStatus: msgType === "file" ? "pending" : "not_applicable",
    eventUrl: `feishu://message/${input.message_id}`,
    mentionedBotIds: [],
    cleanedText: msgType === "text" || msgType === "post" ? content : "",
  };
}

function readExportedMessages(messagesPath: string): LarkExportMessage[] {
  const parsed = JSON.parse(readFileSync(messagesPath, "utf8")) as unknown;
  if (Array.isArray(parsed)) {
    return parsed as LarkExportMessage[];
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error("messages file must be an array or lark-cli output with data.messages");
  }
  const root = parsed as Record<string, unknown>;
  const data = root.data && typeof root.data === "object"
    ? root.data as Record<string, unknown>
    : undefined;
  if (Array.isArray(data?.messages)) {
    return data.messages as LarkExportMessage[];
  }
  if (Array.isArray(root.messages)) {
    return root.messages as LarkExportMessage[];
  }
  throw new Error("messages file must be an array or lark-cli output with data.messages");
}

export async function replayFeishuMessages(input: {
  messagesPath: string;
  databaseUrl: string;
  campId: string;
  chatId: string;
  limit?: number;
  dryRun?: boolean;
}): Promise<ReplayResult> {
  if (!existsSync(input.databaseUrl)) {
    throw new Error(`database not found: ${input.databaseUrl}`);
  }
  if (!existsSync(input.messagesPath)) {
    throw new Error(`messages file not found: ${input.messagesPath}`);
  }

  const dryRun = input.dryRun ?? true;
  let tempDir: string | undefined;
  let databaseUrl = input.databaseUrl;
  if (dryRun) {
    tempDir = mkdtempSync(join(tmpdir(), "ai-boot-replay-"));
    databaseUrl = join(tempDir, "app.replay.db");
    copyFileSync(input.databaseUrl, databaseUrl);
  }

  const repository = new SqliteRepository(databaseUrl);
  try {
    const camp = repository.getCamp(input.campId);
    if (!camp) {
      throw new Error(`camp not found: ${input.campId}`);
    }
    if (camp.groupId !== input.chatId) {
      throw new Error(`camp ${input.campId} is bound to ${camp.groupId}, not ${input.chatId}`);
    }

    const feishuConfig = readFeishuConfig(process.env);
    const feishuClient = feishuConfig.enabled
      ? new LarkFeishuApiClient(feishuConfig)
      : {
          async getMessageFile(): Promise<never> {
            throw new Error("Feishu credentials are not configured for file download");
          },
          async sendTextMessage(): Promise<{ messageId: string }> {
            throw new Error("Feishu credentials are not configured for message sending");
          },
        };
    const llmConfig = readLlmProviderConfig(process.env);
    const aiBootConfig = {
      ...readAiBootConfig(process.env),
      engineMode: "v3_shadow" as const,
      allowGroupPraise: false,
      allowDailyDigest: false,
    };
    const messages = readExportedMessages(input.messagesPath);
    const before = repository.countAiBootScoreEvents({ campId: input.campId });
    let currentNow = new Date().toISOString();

    const orchestrator = createAiBootOrchestrator({
      repo: repository,
      campId: input.campId,
      chatId: input.chatId,
      memberResolver: {
        findMemberByOpenId: (openId: string) => {
          const member = repository.findMemberByFeishuOpenId(openId);
          if (member?.campId !== input.campId) {
            return null;
          }
          return {
            id: member.id,
            displayName: member.displayName || member.name || "同学",
            roleType: member.roleType,
            isParticipant: member.isParticipant,
            isExcludedFromBoard: member.isExcludedFromBoard,
            currentLevel: 1,
          };
        },
      },
      llmClient: llmConfig.enabled ? new OpenAiCompatibleLlmScoringClient(llmConfig) : undefined,
      botOpenId: process.env.FEISHU_BOT_OPEN_ID,
      feishuClient,
      config: aiBootConfig,
      now: () => currentNow,
      uuid: () => randomUUID(),
    });

    let replayed = 0;
    let userMessages = 0;
    let skippedWrongChat = 0;
    for (const exported of messages) {
      if (input.limit && replayed >= input.limit) {
        break;
      }
      if (exported.sender?.sender_type !== "user") {
        continue;
      }
      if (exported.chat_id && exported.chat_id !== input.chatId) {
        skippedWrongChat += 1;
        continue;
      }
      userMessages += 1;
      const normalized = normalizeExportedMessage(exported, input.chatId);
      if (!normalized) {
        continue;
      }
      currentNow = normalized.eventTime;
      await orchestrator.handleMessage(normalized);
      replayed += 1;
    }

    await orchestrator.drainPendingWork();

    const after = repository.countAiBootScoreEvents({ campId: input.campId });
    return {
      dryRun,
      messagesSeen: messages.length,
      userMessages,
      skippedWrongChat,
      replayed,
      scoreEventsBefore: before,
      scoreEventsAfter: after,
    };
  } finally {
    repository.close();
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  }
}

if (process.argv[1]?.endsWith("ai-boot-replay-feishu-messages.ts")) {
  loadLocalEnv();
  const args = parseArgs(process.argv.slice(2));
  if (!args.messagesPath || !args.databaseUrl || !args.campId || !args.chatId) {
    console.error(JSON.stringify({
      ok: false,
      error: "missing required --messages <path> --database-url <path> --camp-id <camp> --chat-id <chat>",
    }));
    process.exit(1);
  }
  replayFeishuMessages({
    messagesPath: args.messagesPath,
    databaseUrl: args.databaseUrl,
    campId: args.campId,
    chatId: args.chatId,
    limit: args.limit,
    dryRun: args.dryRun,
  })
    .then((result) => console.log(JSON.stringify({ ok: true, ...result })))
    .catch((error) => {
      console.error(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }));
      process.exit(1);
    });
}
