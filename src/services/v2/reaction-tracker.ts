export interface ReactionIngestInput {
  memberId: string;
  itemCode: "C2";
  scoreDelta: number;
  sourceRef: string;
}

export interface ReactionIngestor {
  ingest(
    input: ReactionIngestInput
  ): { accepted: boolean; eventId?: string; reason?: string };
}

interface TrackedMessage {
  posterOpenId: string;
  memberId: string;
  reactionCount: number;
  lastTriggeredBatch: number;
}

export class ReactionTracker {
  private readonly messages: Map<string, TrackedMessage> = new Map();

  constructor(private readonly ingestor: ReactionIngestor) {}

  registerTrackedMessage(
    messageId: string,
    posterOpenId: string,
    memberId: string
  ): void {
    this.messages.set(messageId, {
      posterOpenId,
      memberId,
      reactionCount: 0,
      lastTriggeredBatch: 0
    });
  }

  handleReaction(
    messageId: string,
    reactingUserOpenId: string,
    _emoji: string
  ): void {
    const tracked = this.messages.get(messageId);
    if (!tracked) {
      return;
    }
    if (reactingUserOpenId === tracked.posterOpenId) {
      return;
    }
    tracked.reactionCount += 1;
    const batchIndex = Math.floor(tracked.reactionCount / 3);
    if (batchIndex > tracked.lastTriggeredBatch) {
      tracked.lastTriggeredBatch = batchIndex;
      this.ingestor.ingest({
        memberId: tracked.memberId,
        itemCode: "C2",
        scoreDelta: 1,
        sourceRef: `${messageId}:${batchIndex}`
      });
    }
  }
}
