export interface NormalizedReactionEvent {
  messageId: string;
  actorOpenId: string;
  emoji: string;
  occurredAt: string;
}

type ReactionPayloadShape = {
  event?: ReactionEventShape;
} & ReactionEventShape;

interface ReactionEventShape {
  message_id?: string;
  reaction_type?: { emoji_type?: string };
  operator?: { operator_id?: string };
  user_id?: { open_id?: string };
  create_time?: string;
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

export function normalizeReactionEvent(
  data: unknown,
  now: () => Date = () => new Date(),
): NormalizedReactionEvent | null {
  const event = readEvent(data);
  const messageId = event.message_id ?? "";
  const actorOpenId = event.user_id?.open_id ?? event.operator?.operator_id ?? "";

  if (!messageId || !actorOpenId) {
    return null;
  }

  return {
    messageId,
    actorOpenId,
    emoji: event.reaction_type?.emoji_type ?? "",
    occurredAt: readOccurredAt(event.create_time, now),
  };
}
