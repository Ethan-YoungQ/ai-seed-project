import type {
  CardActionContext,
  CardActionResult,
  CardHandler,
  CardHandlerDeps
} from "../types.js";

/**
 * Handler for "video_checkin_complete" action.
 * Records G1 scoring for the member who completed the video session.
 */
export const videoCheckinCompleteHandler: CardHandler = async (
  ctx: CardActionContext,
  deps: CardHandlerDeps
): Promise<CardActionResult> => {
  const { operatorOpenId } = ctx;

  const member = deps.repo.findMemberByOpenId(operatorOpenId);
  if (!member) {
    return {
      toast: { type: "error", content: "未找到对应成员,请联系运营" }
    };
  }

  const now = deps.clock().toISOString();

  await deps.ingestor.ingest({
    memberId: member.id,
    itemCode: "G1",
    sourceType: "card_interaction",
    sourceRef: ctx.triggerId,
    payload: { triggerId: ctx.triggerId, messageId: ctx.messageId },
    requestedAt: now
  });

  return {
    toast: { type: "success", content: "✅ 视频打卡完成，已记录 G1 得分！" }
  };
};
