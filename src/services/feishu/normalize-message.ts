import type { DocumentParseStatus } from "../../domain/types.js";

// Inlined from domain/tag-parser.ts (deleted as part of v1 legacy cleanup)
function parseTags(text: string): string[] {
  return [...new Set(text.match(/#[^\s#]+/g) ?? [])];
}

// Inlined from services/documents/file-format.ts (deleted as part of v1 legacy cleanup)
const MIME_TYPE_EXTENSIONS: Record<string, string> = {
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx"
};

function normalizeMimeType(mimeType: string | undefined) {
  return mimeType?.split(";")[0]?.trim().toLowerCase();
}

function inferDocumentFileExt(input: { fileName?: string; mimeType?: string }) {
  const fileNameExt = input.fileName?.split(".").at(-1)?.trim().toLowerCase();
  const normalizedMimeType = normalizeMimeType(input.mimeType);
  const mimeTypeExt = normalizedMimeType ? MIME_TYPE_EXTENSIONS[normalizedMimeType] : undefined;

  if (mimeTypeExt === "pdf" || mimeTypeExt === "docx") {
    return mimeTypeExt;
  }

  if (fileNameExt) {
    return fileNameExt;
  }

  return mimeTypeExt;
}

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
  mentionedBotIds: string[];
  cleanedText: string;
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

interface PostContentBlock {
  tag?: string;
  text?: string;
  href?: string;
  image_key?: string;
}

function isPostContent(body: unknown): body is { content: PostContentBlock[][]; title?: string } {
  const obj = body as Record<string, unknown> | null;
  if (!obj || !Array.isArray(obj.content)) {
    return false;
  }
  return (obj.content as unknown[]).every(
    (row) => Array.isArray(row) && row.every((block) => typeof block === "object" && block !== null)
  );
}

function extractPostText(body: { content: PostContentBlock[][]; title?: string }): string {
  const fragments: string[] = [];

  if (body.title) {
    fragments.push(body.title);
  }

  for (const row of body.content) {
    for (const block of row) {
      if (block.tag === "text" && block.text) {
        fragments.push(block.text);
      }
    }
  }

  return fragments.join(" ");
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
      content?: PostContentBlock[][];
      title?: string;
    };

    // Post (rich text) message format: content is an array of arrays of blocks
    if (isPostContent(parsed)) {
      return {
        text: extractPostText(parsed),
        fileKey: undefined,
        fileName: undefined,
        mimeType: undefined
      };
    }

    // Standard text/file message format
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
        mentions?: Array<{
          key?: string;
          id?: { open_id?: string };
          name?: string;
        }>;
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

  const mentions = raw.event?.message?.mentions ?? [];
  const mentionedBotIds = mentions
    .map((m) => m.id?.open_id)
    .filter((id): id is string => Boolean(id));
  const cleanedText = rawText.replace(/@_user_\d+\s*/g, "").trim();

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
    eventUrl: `feishu://message/${messageId}`,
    mentionedBotIds,
    cleanedText
  };
}
