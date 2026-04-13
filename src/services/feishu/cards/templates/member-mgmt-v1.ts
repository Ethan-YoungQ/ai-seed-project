/**
 * 成员管理卡片 — Schema 2.0（column_set 布局）
 *
 * 运营在群聊中发 "成员" → 弹出此卡片。
 * 上方展示成员列表信息，下方用 select + button 统一控制，
 * 避免每行都渲染交互组件导致卡片体积超限。
 */

import type { FeishuCardJson, MemberLite } from "../types.js";
import { buildHeader } from "./common/header.js";

export const MEMBER_MGMT_TEMPLATE_ID = "member-mgmt-v1" as const;

export interface MemberMgmtState {
  members: MemberLite[];
}

const ROLE_LABELS: Record<string, string> = {
  student: "学员",
  operator: "运营",
  trainer: "讲师",
  observer: "旁听"
};

/** 操作选项 */
const ACTION_OPTIONS = [
  { label: "隐藏（从排行榜移除）", value: "hide" },
  { label: "取消隐藏（恢复排行榜）", value: "show" },
  { label: "改为学员", value: "role_student" },
  { label: "改为运营", value: "role_operator" },
  { label: "改为讲师", value: "role_trainer" },
  { label: "改为旁听", value: "role_observer" },
];

function renderMemberLine(m: MemberLite): string {
  const role = ROLE_LABELS[m.roleType] ?? m.roleType;
  const hidden = m.isExcludedFromBoard ? "🔒隐藏" : "";
  return `**${m.displayName}** · ${role} · Lv${m.currentLevel} ${hidden}`;
}

export function buildMemberMgmtCard(state: MemberMgmtState): FeishuCardJson {
  // 成员列表（纯文本展示）
  const memberLines = state.members.length > 0
    ? state.members.map((m, i) => `${i + 1}. ${renderMemberLine(m)}`).join("\n")
    : "暂无成员数据";

  // 成员下拉选项
  const memberOptions = state.members.map((m) => ({
    text: { tag: "plain_text", content: `${m.displayName} (${ROLE_LABELS[m.roleType] ?? m.roleType})` },
    value: m.id
  }));

  const actionOptions = ACTION_OPTIONS.map((a) => ({
    text: { tag: "plain_text", content: a.label },
    value: a.value
  }));

  const elements: Array<Record<string, unknown>> = [
    // 成员列表
    {
      tag: "markdown",
      content: memberLines
    },
    { tag: "hr" },
    // 操作区
    {
      tag: "markdown",
      content: "**选择成员和操作，然后点确认：**"
    },
    // 成员选择 + 操作选择
    {
      tag: "column_set",
      flex_mode: "none",
      background_style: "default",
      columns: [
        {
          tag: "column",
          width: "weighted",
          weight: 1,
          vertical_align: "center",
          elements: [
            {
              tag: "select_static",
              placeholder: { tag: "plain_text", content: "选择成员" },
              value: { action: "member_mgmt_select_member" },
              options: memberOptions
            }
          ]
        },
        {
          tag: "column",
          width: "weighted",
          weight: 1,
          vertical_align: "center",
          elements: [
            {
              tag: "select_static",
              placeholder: { tag: "plain_text", content: "选择操作" },
              value: { action: "member_mgmt_select_action" },
              options: actionOptions
            }
          ]
        }
      ]
    },
    // 确认按钮
    {
      tag: "column_set",
      flex_mode: "none",
      background_style: "default",
      columns: [
        {
          tag: "column",
          width: "weighted",
          weight: 1,
          vertical_align: "center",
          elements: [
            {
              tag: "button",
              text: { tag: "plain_text", content: "✅ 确认操作" },
              type: "primary",
              value: { action: "member_mgmt_confirm" }
            }
          ]
        }
      ]
    }
  ];

  return {
    schema: "2.0",
    config: { update_multi: true },
    header: buildHeader({
      title: "👥 成员管理",
      subtitle: `共 ${state.members.length} 位成员`,
      template: "blue"
    }) as unknown as Record<string, unknown>,
    body: { elements }
  };
}
