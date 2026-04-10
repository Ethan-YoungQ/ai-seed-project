/**
 * Handler for the "我要申诉" (appeal) action on LLM decision DM cards.
 *
 * Pipeline:
 *   1. Validate eventId exists in payload.
 *   2. Load live card and check decision status — approved events cannot be appealed.
 *   3. Call deps.requestReappeal(eventId).
 *   4. Write card_interaction.
 *   5. Return success toast.
 */

import type {
  CardActionContext,
  CardActionResult,
  CardHandler,
  CardHandlerDeps
} from "../types.js";
import type { LlmDecisionCardState } from "../templates/llm-decision-v1.js";

// ============================================================================
// Handler
// ============================================================================

export const llmDecisionAppealHandler: CardHandler = async (
  ctx: CardActionContext,
  deps: CardHandlerDeps
): Promise<CardActionResult> => {
  // Step 1: Extract eventId from payload
  const eventId = ctx.actionPayload.eventId;
  if (!eventId || typeof eventId !== "string") {
    return {
      toast: {
        type: "error",
        content: "申诉参数缺失，请刷新后重试"
      }
    };
  }

  // Step 2: Load the live card to check decision status
  const liveRow = deps.repo.findLiveCard("llm_decision", ctx.chatId);
  if (liveRow) {
    const state = liveRow.stateJson as LlmDecisionCardState;
    if (state.decision === "approved") {
      return {
        toast: {
          type: "error",
          content: "已通过的项目无法申诉"
        }
      };
    }
  }

  // Step 3: Request reappeal
  await deps.requestReappeal(eventId);

  // Step 4: Write card interaction log
  await deps.repo.insertCardInteraction({
    id: deps.uuid(),
    memberId: null,
    periodId: null,
    cardType: "llm_decision",
    actionName: "llm_decision_appeal",
    feishuMessageId: ctx.messageId,
    feishuCardVersion: ctx.currentVersion,
    payloadJson: ctx.actionPayload,
    receivedAt: ctx.receivedAt,
    triggerId: ctx.triggerId,
    operatorOpenId: ctx.operatorOpenId,
    rejectedReason: null
  });

  // Step 5: Success toast
  return {
    toast: {
      type: "success",
      content: "申诉已提交，运营将尽快处理"
    }
  };
};
