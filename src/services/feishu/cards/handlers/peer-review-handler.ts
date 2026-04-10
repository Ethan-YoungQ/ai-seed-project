import type {
  CardActionContext,
  CardActionResult,
  CardHandler,
  CardHandlerDeps
} from "../types.js";

/**
 * Handler for "peer_review_vote" action.
 * Records a peer review vote via repo and returns a success toast.
 */
export const peerReviewVoteHandler: CardHandler = async (
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
  const votedMemberId = String(ctx.actionPayload["votedMemberId"] ?? "");

  if (!sessionId || !votedMemberId) {
    return {
      toast: { type: "error", content: "无效的投票数据,请联系运营" }
    };
  }

  const now = deps.clock().toISOString();

  await deps.repo.insertPeerReviewVote({
    id: deps.uuid(),
    peerReviewSessionId: sessionId,
    voterMemberId: member.id,
    votedMemberId,
    votedAt: now
  });

  return {
    toast: { type: "success", content: "✅ 投票成功！" }
  };
};
