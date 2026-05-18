export interface NormalizedReactionEvent {
  messageId: string;
  actorOpenId: string;
  chatId?: string | null;
  emoji: string;
  occurredAt: string;
}

type ReactionPayloadShape = {
  event?: ReactionEventShape;
  context?: { open_chat_id?: string };
} & ReactionEventShape;

interface ReactionEventShape {
  message_id?: string;
  chat_id?: string;
  open_chat_id?: string;
  reaction_type?: { emoji_type?: string };
  operator?: { operator_id?: string };
  user_id?: { open_id?: string };
  create_time?: string;
  context?: { open_chat_id?: string };
}

function readEvent(data: unknown): ReactionEventShape {
  const raw = (data ?? {}) as ReactionPayloadShape;
  return raw.event && typeof raw.event === "object" ? raw.event : raw;
}

function readOccurredAt(createTime: string | undefined, now: () => Date): string {
  if (createTime && /^\d+$/.test(createTime)) {
    const timestampMs = Number(createTime);
    if (Number.isFinite(timestampMs)) {
      return new Date(timestampMs).toISOString();
    }
  }

  return now().toISOString();
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readChatId(raw: ReactionPayloadShape, event: ReactionEventShape): string | null {
  return (
    readString(event.chat_id) ??
    readString(event.open_chat_id) ??
    readString(event.context?.open_chat_id) ??
    readString(raw.chat_id) ??
    readString(raw.open_chat_id) ??
    readString(raw.context?.open_chat_id)
  );
}

export function normalizeReactionEvent(
  data: unknown,
  now: () => Date = () => new Date(),
): NormalizedReactionEvent | null {
  const raw = (data ?? {}) as ReactionPayloadShape;
  const event = readEvent(data);
  const messageId = event.message_id ?? "";
  const actorOpenId = event.user_id?.open_id ?? event.operator?.operator_id ?? "";

  if (!messageId || !actorOpenId) {
    return null;
  }

  return {
    messageId,
    actorOpenId,
    chatId: readChatId(raw, event),
    emoji: event.reaction_type?.emoji_type ?? "",
    occurredAt: readOccurredAt(event.create_time, now),
  };
}
