import type {
  CardActionContext,
  CardActionResult,
  CardHandler,
  CardHandlerDeps
} from "../types.js";

export interface PeerReviewSettlePayloadItem {
  memberId: string;
  s1Delta: number;
  s2Delta: number;
}

/**
 * Handler for "peer_review_settle" action.
 * Fires S1 and S2 ingest calls for each member in the settle payload.
 */
export const peerReviewSettleHandler: CardHandler = async (
  ctx: CardActionContext,
  deps: CardHandlerDeps
): Promise<CardActionResult> => {
  const items = ctx.actionPayload["items"] as PeerReviewSettlePayloadItem[] | undefined;

  if (!Array.isArray(items) || items.length === 0) {
    return {
      toast: { type: "error", content: "无效的结算数据,请联系运营" }
    };
  }

  const now = deps.clock().toISOString();

  const sessionId = ctx.actionPayload["sessionId"];
  for (const item of items) {
    if (item.s1Delta > 0) {
      await deps.ingestor.ingest({
        memberId: item.memberId,
        itemCode: "S1",
        sourceType: "peer_review_settle",
        sourceRef: `${ctx.triggerId}:${item.memberId}:s1`,
        payload: { sessionId },
        requestedDelta: item.s1Delta,
        requestedAt: now
      });
    }

    if (item.s2Delta > 0) {
      await deps.ingestor.ingest({
        memberId: item.memberId,
        itemCode: "S2",
        sourceType: "peer_review_settle",
        sourceRef: `${ctx.triggerId}:${item.memberId}:s2`,
        payload: { sessionId },
        requestedDelta: item.s2Delta,
        requestedAt: now
      });
    }
  }

  return {
    toast: { type: "success", content: "✅ 互评结算完成！" }
  };
};
