/**
 * Handler for operator member management card actions (#16).
 *
 * Actions:
 *   member_toggle_hidden  — show/hide a member from the leaderboard
 *   member_change_role    — change a member's role type
 *
 * All actions require operator role.
 */

import {
  buildMemberMgmtCard,
  MEMBER_MGMT_TEMPLATE_ID,
  type MemberMgmtState
} from "../templates/member-mgmt-v1.js";
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

async function buildRefreshedCard(deps: CardHandlerDeps): Promise<MemberMgmtState> {
  const members = await deps.adminApiClient.listMembers();
  return { members };
}

// ============================================================================
// member_toggle_hidden handler
// ============================================================================

export const memberToggleHiddenHandler: CardHandler = async (
  ctx: CardActionContext,
  deps: CardHandlerDeps
): Promise<CardActionResult> => {
  const denied = requireOperator(deps, ctx.operatorOpenId);
  if (denied) return denied;

  const memberId = ctx.actionPayload.memberId;
  const hidden = ctx.actionPayload.hidden;

  if (!memberId || typeof memberId !== "string") {
    return { toast: { type: "error", content: "缺少 memberId 参数" } };
  }
  if (typeof hidden !== "boolean") {
    return { toast: { type: "error", content: "缺少 hidden 参数" } };
  }

  await deps.adminApiClient.patchMember(memberId, { hiddenFromBoard: hidden });

  const state = await buildRefreshedCard(deps);
  const newCardJson = buildMemberMgmtCard(state);

  return { newCardJson };
};

// ============================================================================
// member_change_role handler
// ============================================================================

export const memberChangeRoleHandler: CardHandler = async (
  ctx: CardActionContext,
  deps: CardHandlerDeps
): Promise<CardActionResult> => {
  const denied = requireOperator(deps, ctx.operatorOpenId);
  if (denied) return denied;

  const memberId = ctx.actionPayload.memberId;
  const roleType = ctx.actionPayload.roleType ?? ctx.actionPayload.value;

  if (!memberId || typeof memberId !== "string") {
    return { toast: { type: "error", content: "缺少 memberId 参数" } };
  }

  const validRoles = ["student", "operator", "trainer", "observer"];
  if (!roleType || typeof roleType !== "string" || !validRoles.includes(roleType)) {
    return { toast: { type: "error", content: "无效的角色类型" } };
  }

  await deps.adminApiClient.patchMember(memberId, { roleType });

  const state = await buildRefreshedCard(deps);
  const newCardJson = buildMemberMgmtCard(state);

  return { newCardJson };
};

export { MEMBER_MGMT_TEMPLATE_ID };
