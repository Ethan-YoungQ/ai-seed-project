/**
 * 成员管理处理器 — WS 模式下统一确认按钮
 *
 * 流程：
 *   1. 用户选成员 select → 缓存 member_mgmt_select_member
 *   2. 用户选操作 select → 缓存 member_mgmt_select_action
 *   3. 用户点 "确认操作" → 注入缓存值 → 本处理器执行
 *   4. 返回 toast（WS 模式下不能返回 newCardJson）
 *
 * 权限：仅运营(operator)和讲师(trainer)可执行。
 */

import { MEMBER_MGMT_TEMPLATE_ID } from "../templates/member-mgmt-v1.js";
import type {
  CardActionContext,
  CardActionResult,
  CardHandler,
  CardHandlerDeps,
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

export const memberMgmtConfirmHandler: CardHandler = async (
  ctx: CardActionContext,
  deps: CardHandlerDeps,
): Promise<CardActionResult> => {
  const denied = requireAdmin(deps, ctx.operatorOpenId);
  if (denied) return denied;

  const memberId = ctx.actionPayload["member_mgmt_select_member"] as string | undefined;
  const actionType = ctx.actionPayload["member_mgmt_select_action"] as string | undefined;

  if (!memberId) {
    return { toast: { type: "error", content: "请先选择成员" } };
  }
  if (!actionType) {
    return { toast: { type: "error", content: "请先选择操作" } };
  }

  try {
    if (actionType === "hide") {
      await deps.adminApiClient.patchMember(memberId, { hiddenFromBoard: true });
      return { toast: { type: "success", content: "已从排行榜隐藏该成员" } };
    }

    if (actionType === "show") {
      await deps.adminApiClient.patchMember(memberId, { hiddenFromBoard: false });
      return { toast: { type: "success", content: "已恢复该成员在排行榜的显示" } };
    }

    // role_student / role_operator / role_trainer / role_observer
    if (actionType.startsWith("role_")) {
      const roleType = actionType.replace("role_", "");
      const validRoles = ["student", "operator", "trainer", "observer"];
      if (!validRoles.includes(roleType)) {
        return { toast: { type: "error", content: "无效的角色类型" } };
      }
      const ROLE_LABELS: Record<string, string> = {
        student: "学员", operator: "运营", trainer: "讲师", observer: "旁听",
      };
      await deps.adminApiClient.patchMember(memberId, { roleType });
      return { toast: { type: "success", content: `已将角色更改为: ${ROLE_LABELS[roleType] ?? roleType}` } };
    }

    return { toast: { type: "error", content: `未知操作: ${actionType}` } };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "未知错误";
    return { toast: { type: "error", content: `操作失败: ${msg}` } };
  }
};

// 兼容旧处理器名（dispatcher 注册时使用）
export const memberToggleHiddenHandler = memberMgmtConfirmHandler;
export const memberChangeRoleHandler = memberMgmtConfirmHandler;

export { MEMBER_MGMT_TEMPLATE_ID };
