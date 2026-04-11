import type {
  CardActionContext,
  CardActionResult,
  CardHandler,
  CardHandlerDeps
} from "../types.js";

/**
 * Handler for "homework_submit" action.
 * Validates and ingests H1 scoring for the submitting member.
 */
export const homeworkSubmitHandler: CardHandler = async (
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

  const sessionId = String(ctx.actionPayload["sessionId"] ?? "");
  if (!sessionId) {
    return {
      toast: { type: "error", content: "无效的作业会话 ID,请联系运营" }
    };
  }

  const now = deps.clock().toISOString();

  await deps.ingestor.ingest({
    memberId: member.id,
    itemCode: "H1",
    sourceType: "card_interaction",
    sourceRef: ctx.triggerId,
    payload: { sessionId, triggerId: ctx.triggerId, messageId: ctx.messageId },
    requestedAt: now
  });

  return {
    toast: { type: "success", content: "✅ 作业提交成功，已记录 H1 得分！" }
  };
};
