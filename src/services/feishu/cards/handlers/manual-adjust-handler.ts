/**
 * Handler for operator manual score adjustment card (#17).
 *
 * Actions:
 *   manual_adjust_confirm — validate inputs and call ingestor.ingest with
 *                           sourceType "operator_manual"
 *
 * Requires operator role.
 */

import { MANUAL_ADJUST_TEMPLATE_ID } from "../templates/manual-adjust-v1.js";
import type {
  CardActionContext,
  CardActionResult,
  CardHandler,
  CardHandlerDeps
} from "../types.js";

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

// ============================================================================
// manual_adjust_confirm handler
// ============================================================================

export const manualAdjustConfirmHandler: CardHandler = async (
  ctx: CardActionContext,
  deps: CardHandlerDeps
): Promise<CardActionResult> => {
  const denied = requireOperator(deps, ctx.operatorOpenId);
  if (denied) return denied;

  const { memberId, itemCode, delta, note } = ctx.actionPayload as {
    memberId?: unknown;
    itemCode?: unknown;
    delta?: unknown;
    note?: unknown;
  };

  // Validate memberId
  if (!memberId || typeof memberId !== "string") {
    return { toast: { type: "error", content: "请选择成员" } };
  }

  // Validate itemCode
  if (!itemCode || typeof itemCode !== "string") {
    return { toast: { type: "error", content: "请选择项目代码" } };
  }

  // Validate delta
  const deltaNum = typeof delta === "number" ? delta : Number(delta);
  if (!Number.isFinite(deltaNum) || deltaNum === 0) {
    return {
      toast: {
        type: "error",
        content: "分值变化不能为 0,请输入有效数值"
      }
    };
  }

  const noteStr = typeof note === "string" ? note.trim() : "";

  const result = await deps.ingestor.ingest({
    memberId,
    itemCode,
    sourceType: "operator_manual",
    sourceRef: deps.uuid(),
    payload: {
      note: noteStr,
      operatorOpenId: ctx.operatorOpenId
    },
    requestedDelta: deltaNum,
    requestedAt: ctx.receivedAt
  });

  return {
    toast: {
      type: "success",
      content: `已提交调分: ${deltaNum > 0 ? "+" : ""}${deltaNum} (eventId: ${result.eventId})`
    }
  };
};

export { MANUAL_ADJUST_TEMPLATE_ID };
