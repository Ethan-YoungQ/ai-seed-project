/**
 * Card template for the operator member management interface (#16).
 *
 * Lists all members with role, level, and hidden status.
 * Per-member actions: toggle hidden, change role dropdown.
 * Blue header "👥 成员管理".
 */

import type { FeishuCardJson, MemberLite } from "../types.js";
import { buildHeader } from "./common/header.js";

// ============================================================================
// Public API
// ============================================================================

export const MEMBER_MGMT_TEMPLATE_ID = "member-mgmt-v1" as const;

export interface MemberMgmtState {
  members: MemberLite[];
}

// ============================================================================
// Internal helpers
// ============================================================================

const ROLE_LABELS: Record<string, string> = {
  student: "学员",
  operator: "运营",
  trainer: "讲师",
  observer: "旁听"
};

function buildMemberRow(member: MemberLite): Array<Record<string, unknown>> {
  const roleLabel = ROLE_LABELS[member.roleType] ?? member.roleType;
  const hiddenLabel = member.isExcludedFromBoard ? "已隐藏" : "显示中";

  return [
    {
      tag: "markdown",
      content: [
        `**${member.displayName}** · ${roleLabel} · Lv${member.currentLevel}`,
        `排行榜: ${hiddenLabel}`
      ].join("  |  ")
    },
    {
      tag: "action",
      actions: [
        {
          tag: "button",
          text: {
            tag: "plain_text",
            content: member.isExcludedFromBoard ? "取消隐藏" : "隐藏排行榜"
          },
          type: "default",
          value: {
            action: "member_toggle_hidden",
            memberId: member.id,
            hidden: !member.isExcludedFromBoard
          }
        },
        {
          tag: "select_static",
          placeholder: { tag: "plain_text", content: "更改角色" },
          value: {
            action: "member_change_role",
            memberId: member.id
          },
          options: [
            { text: { tag: "plain_text", content: "学员" }, value: "student" },
            { text: { tag: "plain_text", content: "运营" }, value: "operator" },
            { text: { tag: "plain_text", content: "讲师" }, value: "trainer" },
            { text: { tag: "plain_text", content: "旁听" }, value: "observer" }
          ]
        }
      ]
    }
  ];
}

// ============================================================================
// Card builder
// ============================================================================

export function buildMemberMgmtCard(state: MemberMgmtState): FeishuCardJson {
  const header = buildHeader({
    title: "👥 成员管理",
    subtitle: `共 ${state.members.length} 位成员`,
    template: "blue"
  });

  const elements: Array<Record<string, unknown>> = [];

  if (state.members.length === 0) {
    elements.push({
      tag: "markdown",
      content: "暂无成员数据"
    });
  } else {
    for (let i = 0; i < state.members.length; i++) {
      const rows = buildMemberRow(state.members[i]);
      elements.push(...rows);
      if (i < state.members.length - 1) {
        elements.push({ tag: "hr" });
      }
    }
  }

  return {
    schema: "2.0",
    header: header as unknown as Record<string, unknown>,
    body: { elements }
  };
}
