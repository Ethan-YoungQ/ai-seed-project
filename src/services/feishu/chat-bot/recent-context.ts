import mammoth from "mammoth";
import pdfParse from "pdf-parse";

import type { FeishuApiClient } from "../client.js";
import type { NormalizedFeishuMessage } from "../normalize-message.js";

export interface ChatContextBlock {
  title: string;
  content: string;
}

export interface DocumentExtractionResult {
  status: "parsed" | "unsupported" | "failed";
  text: string;
  reason?: string;
}

export interface DocumentTextExtractor {
  extract(input: {
    bytes: Buffer;
    fileExt?: string;
    fileName?: string;
    mimeType?: string;
  }): Promise<DocumentExtractionResult>;
}

export interface RecentChatContextProvider {
  record(message: NormalizedFeishuMessage): void;
  resolveMentionContext(input: {
    currentMessage: NormalizedFeishuMessage;
    feishuClient: Pick<FeishuApiClient, "getMessageFile">;
  }): Promise<ChatContextBlock[]>;
}

interface RecentChatContextProviderOptions {
  documentExtractor?: DocumentTextExtractor;
  maxMessagesPerChat?: number;
  userContextHours?: number;
  groupContextMinutes?: number;
  maxUserMessages?: number;
  maxGroupMessages?: number;
  maxUserFiles?: number;
  maxFileTextChars?: number;
  maxTextLineChars?: number;
}

type StoredMessage = NormalizedFeishuMessage & { recordedAtMs: number };

const HOMEWORK_CONTEXT_RE = /(我交的|我的.{0,6}(作业|pdf|PDF|文件|报告)|作业|PDF|pdf|报告|第二提问|第二问|文件)/;
const GROUP_CONTEXT_RE = /(上文|刚才|前面|前文|这个讨论|这段讨论|结合.{0,4}上下文|上下文)/;
const FOLLOW_UP_RE = /(继续|再分析|再看|这个问题|这个提问|是否准确|准不准确)/;

function parseTimeMs(value: string): number {
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function truncate(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars)}\n...[已截断]`;
}

function getMessageTimeLine(message: NormalizedFeishuMessage): string {
  const time = message.eventTime ? new Date(message.eventTime) : null;
  const timeText = time && Number.isFinite(time.getTime())
    ? time.toISOString().replace("T", " ").slice(0, 16)
    : message.eventTime;
  const kind = message.messageType || "text";
  const text = normalizeText(message.rawText);
  if (message.fileName) {
    return `${timeText} ${message.memberId} [${kind}] ${message.fileName}`;
  }
  return `${timeText} ${message.memberId} [${kind}] ${text}`;
}

function isTextLike(message: NormalizedFeishuMessage): boolean {
  return Boolean(normalizeText(message.rawText));
}

function isSupportedDocument(message: NormalizedFeishuMessage): boolean {
  return message.messageType === "file" && Boolean(message.fileKey) &&
    (message.fileExt === "pdf" || message.fileExt === "docx");
}

export function createLocalDocumentTextExtractor(): DocumentTextExtractor {
  return {
    async extract(input): Promise<DocumentExtractionResult> {
      const fileExt = input.fileExt?.toLowerCase() || input.fileName?.split(".").at(-1)?.toLowerCase();
      try {
        if (fileExt === "pdf") {
          const parsed = await pdfParse(input.bytes);
          return {
            status: "parsed",
            text: normalizeText(parsed.text ?? ""),
          };
        }

        if (fileExt === "docx") {
          const parsed = await mammoth.extractRawText({ buffer: input.bytes });
          return {
            status: "parsed",
            text: normalizeText(parsed.value ?? ""),
          };
        }

        return {
          status: "unsupported",
          text: "",
          reason: `unsupported_file_ext:${fileExt ?? "unknown"}`,
        };
      } catch (err) {
        return {
          status: "failed",
          text: "",
          reason: err instanceof Error ? err.message : "document_extract_failed",
        };
      }
    },
  };
}

export function createRecentChatContextProvider(
  options: RecentChatContextProviderOptions = {},
): RecentChatContextProvider {
  const documentExtractor = options.documentExtractor ?? createLocalDocumentTextExtractor();
  const maxMessagesPerChat = options.maxMessagesPerChat ?? 200;
  const userContextHours = options.userContextHours ?? 24;
  const groupContextMinutes = options.groupContextMinutes ?? 10;
  const maxUserMessages = options.maxUserMessages ?? 10;
  const maxGroupMessages = options.maxGroupMessages ?? 10;
  const maxUserFiles = options.maxUserFiles ?? 2;
  const maxFileTextChars = options.maxFileTextChars ?? 12_000;
  const maxTextLineChars = options.maxTextLineChars ?? 500;

  const byChat = new Map<string, StoredMessage[]>();
  const documentCache = new Map<string, DocumentExtractionResult>();

  async function buildFileBlock(
    message: StoredMessage,
    feishuClient: Pick<FeishuApiClient, "getMessageFile">,
  ): Promise<ChatContextBlock> {
    const cacheKey = `${message.messageId}:${message.fileKey ?? ""}`;
    let extraction = documentCache.get(cacheKey);

    if (!extraction) {
      try {
        const file = await feishuClient.getMessageFile({
          messageId: message.messageId,
          fileKey: message.fileKey!,
          fileName: message.fileName,
        });
        extraction = await documentExtractor.extract({
          bytes: file.bytes,
          fileExt: file.fileExt ?? message.fileExt,
          fileName: file.fileName ?? message.fileName,
          mimeType: file.mimeType ?? message.mimeType,
        });
      } catch (err) {
        extraction = {
          status: "failed",
          text: "",
          reason: err instanceof Error ? err.message : "file_download_failed",
        };
      }
      documentCache.set(cacheKey, extraction);
    }

    const text = extraction.text
      ? `内容摘录：\n${truncate(extraction.text, maxFileTextChars)}`
      : `内容摘录：不可用`;

    return {
      title: "用户最近文件",
      content: [
        `发送时间：${message.eventTime}`,
        `发送者：${message.memberId}`,
        `文件名：${message.fileName ?? message.fileKey}`,
        `解析状态：${extraction.status}${extraction.reason ? ` (${extraction.reason})` : ""}`,
        text,
      ].join("\n"),
    };
  }

  function buildLines(messages: StoredMessage[], maxCount: number): string {
    return messages
      .slice(-maxCount)
      .map((message) => truncate(getMessageTimeLine(message), maxTextLineChars))
      .join("\n");
  }

  return {
    record(message: NormalizedFeishuMessage): void {
      if (!message.chatId || message.chatType !== "group") return;

      const stored: StoredMessage = {
        ...message,
        recordedAtMs: parseTimeMs(message.eventTime),
      };
      const existing = byChat.get(message.chatId) ?? [];
      const deduped = existing.filter((item) => item.messageId !== message.messageId);
      const next = [...deduped, stored]
        .sort((left, right) => left.recordedAtMs - right.recordedAtMs)
        .slice(-maxMessagesPerChat);
      byChat.set(message.chatId, next);
    },

    async resolveMentionContext(input): Promise<ChatContextBlock[]> {
      const current = input.currentMessage;
      if (!current.chatId) return [];

      const text = current.cleanedText || current.rawText;
      const wantsHomeworkContext = HOMEWORK_CONTEXT_RE.test(text);
      const wantsGroupContext = GROUP_CONTEXT_RE.test(text);
      const wantsFollowUpContext = FOLLOW_UP_RE.test(text);
      if (!wantsHomeworkContext && !wantsGroupContext && !wantsFollowUpContext) {
        return [];
      }

      const nowMs = parseTimeMs(current.eventTime);
      const allPrior = (byChat.get(current.chatId) ?? []).filter((message) =>
        message.messageId !== current.messageId &&
        message.recordedAtMs <= nowMs
      );
      const userSinceMs = nowMs - userContextHours * 60 * 60 * 1000;
      const sameUser = allPrior.filter((message) =>
        message.memberId === current.memberId && message.recordedAtMs >= userSinceMs
      );
      const blocks: ChatContextBlock[] = [];

      if (wantsHomeworkContext) {
        const files = sameUser
          .filter(isSupportedDocument)
          .slice(-maxUserFiles)
          .reverse();
        for (const fileMessage of files) {
          blocks.push(await buildFileBlock(fileMessage, input.feishuClient));
        }
      }

      if (sameUser.length > 0 && (wantsHomeworkContext || wantsFollowUpContext)) {
        blocks.push({
          title: "用户近期上下文",
          content: buildLines(
            sameUser.filter((message) => isTextLike(message) || message.messageType === "file"),
            maxUserMessages,
          ),
        });
      }

      if (wantsGroupContext) {
        const groupSinceMs = nowMs - groupContextMinutes * 60 * 1000;
        const groupMessages = allPrior.filter((message) =>
          message.recordedAtMs >= groupSinceMs && (isTextLike(message) || message.messageType === "file")
        );
        if (groupMessages.length > 0) {
          blocks.push({
            title: "群聊局部上文",
            content: buildLines(groupMessages, maxGroupMessages),
          });
        }
      }

      return blocks.filter((block) => block.content.trim().length > 0);
    },
  };
}

export const defaultRecentChatContextProvider = createRecentChatContextProvider();
