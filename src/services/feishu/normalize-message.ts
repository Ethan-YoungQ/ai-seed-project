import { parseTags } from "../../domain/tag-parser";

export interface NormalizedFeishuMessage {
  messageId: string;
  memberId: string;
  chatId?: string;
  chatType?: string;
  senderType?: string;
  eventTime: string;
  rawText: string;
  parsedTags: string[];
  attachmentCount: number;
  attachmentTypes: string[];
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

function readMessageText(content: string): string {
  try {
    const parsed = JSON.parse(content) as { text?: string };
    return parsed.text ?? "";
  } catch {
    return content;
  }
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

  const rawText = readMessageText(content);
  const attachments = raw.event?.message?.attachments ?? [];
  const attachmentTypes = inferAttachmentTypes(messageType, attachments);

  return {
    messageId,
    memberId,
    chatId: raw.event?.message?.chat_id,
    chatType: raw.event?.message?.chat_type,
    senderType: raw.event?.sender?.sender_type,
    eventTime: new Date(Number(createTime)).toISOString(),
    rawText,
    parsedTags: parseTags(rawText),
    attachmentCount: attachmentTypes.length,
    attachmentTypes,
    eventUrl: `feishu://message/${messageId}`
  };
}
