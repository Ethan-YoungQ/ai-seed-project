/**
 * 手动调分处理器 — WS 模式下从 actionPayload 读取缓存的 select 值
 *
 * 流程：
 *   1. 用户选 select_static → ws-runtime 缓存值
 *   2. 用户点 "确认调分" → ws-runtime 注入缓存值到 actionPayload
 *   3. 本处理器读取 actionPayload 中的 memberId/itemCode/delta
 *   4. 调用 ingestor.ingest 完成调分
 *
 * 权限：仅运营(operator)和讲师(trainer)可执行。
 */

import { MANUAL_ADJUST_TEMPLATE_ID } from "../templates/manual-adjust-v1.js";
import type {
  CardActionContext,
  CardActionResult,
  CardHandler,
  CardHandlerDeps
} from "../types.js";

function requireAdmin(
  deps: CardHandlerDeps,
  openId: string,
): CardActionResult | null {
  const member = deps.repo.findMemberByOpenId(openId);
  if (!member) {
    return { toast: { type: "error", content: "未找到对应成员" } };
  }
  if (member.roleType !== "operator" && member.roleType !== "trainer") {
    return { toast: { type: "error", content: "仅运营/讲师可执行此操作" } };
  }
  return null;
}

export const manualAdjustConfirmHandler: CardHandler = async (
  ctx: CardActionContext,
  deps: CardHandlerDeps,
): Promise<CardActionResult> => {
  const denied = requireAdmin(deps, ctx.operatorOpenId);
  if (denied) return denied;

  // WS 模式：select 值通过 ws-runtime 缓存注入到 actionPayload
  const memberId = ctx.actionPayload["manual_adjust_select_member"] as string | undefined;
  const itemCode = ctx.actionPayload["manual_adjust_select_item"] as string | undefined;
  const deltaStr = ctx.actionPayload["manual_adjust_select_delta"] as string | undefined;

  if (!memberId) {
    return { toast: { type: "error", content: "请先选择成员" } };
  }
  if (!itemCode) {
    return { toast: { type: "error", content: "请先选择评分项" } };
  }
  if (!deltaStr) {
    return { toast: { type: "error", content: "请先选择分值变化" } };
  }

  const deltaNum = Number(deltaStr);
  if (!Number.isFinite(deltaNum) || deltaNum === 0) {
    return { toast: { type: "error", content: "分值变化无效" } };
  }

  try {
    const result = await deps.ingestor.ingest({
      memberId,
      itemCode,
      sourceType: "operator_manual",
      sourceRef: `manual:${ctx.triggerId}`,
      payload: { operatorOpenId: ctx.operatorOpenId },
      requestedDelta: deltaNum,
      requestedAt: ctx.receivedAt,
    });

    return {
      toast: {
        type: "success",
        content: `调分成功: ${itemCode} ${deltaNum > 0 ? "+" : ""}${deltaNum} (${result.eventId.slice(0, 8)})`,
      },
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "未知错误";
    return { toast: { type: "error", content: `调分失败: ${msg}` } };
  }
};

export { MANUAL_ADJUST_TEMPLATE_ID };
