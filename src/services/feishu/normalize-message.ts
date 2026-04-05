import { parseTags } from "../../domain/tag-parser";
import type { DocumentParseStatus } from "../../domain/types";
import { inferDocumentFileExt } from "../documents/file-format";

export interface NormalizedFeishuMessage {
  messageId: string;
  memberId: string;
  chatId?: string;
  chatType?: string;
  senderType?: string;
  messageType?: string;
  eventTime: string;
  rawText: string;
  parsedTags: string[];
  attachmentCount: number;
  attachmentTypes: string[];
  fileKey?: string;
  fileName?: string;
  fileExt?: string;
  mimeType?: string;
  documentText: string;
  documentParseStatus: DocumentParseStatus;
  documentParseReason?: string;
  eventUrl: string;
}

function inferAttachmentTypes(messageType: string | undefined, attachments: Array<{ type?: string }>) {
  if (attachments.length > 0) {
    return attachments.map((attachment) => attachment.type).filter((type): type is string => Boolean(type));
  }

  if (messageType === "image" || messageType === "file" || messageType === "media") {
    return [messageType];
  }

  return [];
}

function readMessageContent(content: string): {
  text: string;
  fileKey?: string;
  fileName?: string;
  mimeType?: string;
} {
  try {
    const parsed = JSON.parse(content) as {
      text?: string;
      file_key?: string;
      file_name?: string;
      mime_type?: string;
    };
    return {
      text: parsed.text ?? "",
      fileKey: parsed.file_key,
      fileName: parsed.file_name,
      mimeType: parsed.mime_type
    };
  } catch {
    return {
      text: content
    };
  }
}

function initialDocumentParseStatus(messageType: string | undefined, fileExt: string | undefined): DocumentParseStatus {
  if (messageType !== "file") {
    return "not_applicable";
  }

  if (!fileExt) {
    return "pending";
  }

  if (fileExt === "pdf" || fileExt === "docx") {
    return "pending";
  }

  return "unsupported";
}

export function normalizeFeishuMessageEvent(payload: unknown): NormalizedFeishuMessage | undefined {
  const raw = payload as {
    event?: {
      sender?: { sender_type?: string; sender_id?: { open_id?: string } };
      message?: {
        message_id?: string;
        chat_id?: string;
        chat_type?: string;
        create_time?: string;
        message_type?: string;
        content?: string;
        attachments?: Array<{ type?: string }>;
      };
    };
  };

  const messageId = raw.event?.message?.message_id;
  const memberId = raw.event?.sender?.sender_id?.open_id;
  const createTime = raw.event?.message?.create_time;
  const content = raw.event?.message?.content ?? "";
  const messageType = raw.event?.message?.message_type;

  if (!messageId || !memberId || !createTime) {
    return undefined;
  }

  const parsedContent = readMessageContent(content);
  const rawText = parsedContent.text;
  const attachments = raw.event?.message?.attachments ?? [];
  const attachmentTypes = inferAttachmentTypes(messageType, attachments);
  const fileExt = inferDocumentFileExt({
    fileName: parsedContent.fileName,
    mimeType: parsedContent.mimeType
  });

  return {
    messageId,
    memberId,
    chatId: raw.event?.message?.chat_id,
    chatType: raw.event?.message?.chat_type,
    senderType: raw.event?.sender?.sender_type,
    messageType,
    eventTime: new Date(Number(createTime)).toISOString(),
    rawText,
    parsedTags: parseTags(rawText),
    attachmentCount: attachmentTypes.length,
    attachmentTypes,
    fileKey: parsedContent.fileKey,
    fileName: parsedContent.fileName,
    fileExt,
    mimeType: parsedContent.mimeType,
    documentText: "",
    documentParseStatus: initialDocumentParseStatus(messageType, fileExt),
    eventUrl: `feishu://message/${messageId}`
  };
}
