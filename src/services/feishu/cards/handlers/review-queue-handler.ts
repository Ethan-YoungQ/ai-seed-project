/**
 * Handler for operator review queue card actions (#15).
 *
 * Actions:
 *   review_approve  — approve a review_required event
 *   review_reject   — reject a review_required event
 *   review_page     — load page N from the review queue
 *
 * All actions require operator role.
 */

import { InvalidDecisionStateError } from "../../../../domain/v2/errors.js";
import { buildReviewQueueCard, REVIEW_QUEUE_TEMPLATE_ID } from "../templates/review-queue-v1.js";
import type {
  CardActionContext,
  CardActionResult,
  CardHandler,
  CardHandlerDeps,
  ReviewQueueState
} from "../types.js";

// ============================================================================
// Constants
// ============================================================================

const PAGE_SIZE = 10;

// ============================================================================
// Helpers
// ============================================================================

function requireOperator(
  deps: CardHandlerDeps,
  openId: string
): CardActionResult | null {
  const member = deps.repo.findMemberByOpenId(openId);
  if (!member) {
    return { toast: { type: "error", content: "未找到对应成员,请联系管理员" } };
  }
  if (member.roleType !== "operator") {
    return { toast: { type: "error", content: "仅运营人员可执行此操作" } };
  }
  return null;
}

async function loadQueuePage(
  deps: CardHandlerDeps,
  page: number
): Promise<ReviewQueueState> {
  const offset = (page - 1) * PAGE_SIZE;
  const [events, totalEvents] = await Promise.all([
    deps.repo.listReviewRequiredEvents({ limit: PAGE_SIZE, offset }),
    deps.repo.countReviewRequiredEvents()
  ]);
  const totalPages = Math.max(1, Math.ceil(totalEvents / PAGE_SIZE));
  return { currentPage: page, totalPages, totalEvents, events };
}

// ============================================================================
// review_approve handler
// ============================================================================

export const reviewApproveHandler: CardHandler = async (
  ctx: CardActionContext,
  deps: CardHandlerDeps
): Promise<CardActionResult> => {
  const denied = requireOperator(deps, ctx.operatorOpenId);
  if (denied) return denied;

  const eventId = ctx.actionPayload.eventId;
  if (!eventId || typeof eventId !== "string") {
    return { toast: { type: "error", content: "缺少 eventId 参数" } };
  }

  try {
    await deps.aggregator.applyDecision(eventId, "approved");
  } catch (err) {
    if (err instanceof InvalidDecisionStateError) {
      return { toast: { type: "error", content: "此条已被其他运营处理,请刷新队列" } };
    }
    throw err;
  }

  await deps.repo.insertCardInteraction({
    id: deps.uuid(),
    memberId: null,
    periodId: null,
    cardType: "review_queue",
    actionName: "review_approve",
    feishuMessageId: ctx.messageId,
    feishuCardVersion: ctx.currentVersion,
    payloadJson: ctx.actionPayload,
    receivedAt: ctx.receivedAt,
    triggerId: ctx.triggerId,
    operatorOpenId: ctx.operatorOpenId,
    rejectedReason: null
  });

  return { toast: { type: "success", content: "已通过" } };
};

// ============================================================================
// review_reject handler
// ============================================================================

export const reviewRejectHandler: CardHandler = async (
  ctx: CardActionContext,
  deps: CardHandlerDeps
): Promise<CardActionResult> => {
  const denied = requireOperator(deps, ctx.operatorOpenId);
  if (denied) return denied;

  const eventId = ctx.actionPayload.eventId;
  if (!eventId || typeof eventId !== "string") {
    return { toast: { type: "error", content: "缺少 eventId 参数" } };
  }

  try {
    await deps.aggregator.applyDecision(eventId, "rejected");
  } catch (err) {
    if (err instanceof InvalidDecisionStateError) {
      return { toast: { type: "error", content: "此条已被其他运营处理,请刷新队列" } };
    }
    throw err;
  }

  await deps.repo.insertCardInteraction({
    id: deps.uuid(),
    memberId: null,
    periodId: null,
    cardType: "review_queue",
    actionName: "review_reject",
    feishuMessageId: ctx.messageId,
    feishuCardVersion: ctx.currentVersion,
    payloadJson: ctx.actionPayload,
    receivedAt: ctx.receivedAt,
    triggerId: ctx.triggerId,
    operatorOpenId: ctx.operatorOpenId,
    rejectedReason: null
  });

  return { toast: { type: "success", content: "已拒绝" } };
};

// ============================================================================
// review_page handler
// ============================================================================

export const reviewPageHandler: CardHandler = async (
  ctx: CardActionContext,
  deps: CardHandlerDeps
): Promise<CardActionResult> => {
  const denied = requireOperator(deps, ctx.operatorOpenId);
  if (denied) return denied;

  const pageRaw = ctx.actionPayload.page;
  const page = typeof pageRaw === "number" && pageRaw >= 1 ? pageRaw : 1;

  const state = await loadQueuePage(deps, page);
  const newCardJson = buildReviewQueueCard(state);

  return { newCardJson };
};

export { REVIEW_QUEUE_TEMPLATE_ID };
