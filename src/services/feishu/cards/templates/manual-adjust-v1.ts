/**
 * Card template for operator manual score adjustment (#17).
 *
 * Renders a form with memberId selector, itemCode dropdown, delta input,
 * and note input. Confirm button sends manual_adjust_confirm action.
 * Grey header "⚙️ 手动调分".
 */

import type { FeishuCardJson, MemberLite } from "../types.js";
import { buildHeader } from "./common/header.js";

// ============================================================================
// Public API
// ============================================================================

export const MANUAL_ADJUST_TEMPLATE_ID = "manual-adjust-v1" as const;

/** Item codes available for manual adjustment */
const ITEM_CODES = ["K1", "K2", "K3", "K4", "H1", "H2", "C1", "C2", "C3", "S1", "G1", "G2"];

export interface ManualAdjustState {
  /** Available members to select from */
  members: MemberLite[];
  /** Pre-selected values (for re-rendering with error) */
  selectedMemberId?: string;
  selectedItemCode?: string;
  delta?: number;
  note?: string;
}

// ============================================================================
// Card builder
// ============================================================================

export function buildManualAdjustCard(state: ManualAdjustState): FeishuCardJson {
  const header = buildHeader({
    title: "⚙️ 手动调分",
    subtitle: "运营专用 · 请谨慎操作",
    template: "grey"
  });

  const memberOptions = state.members.map((m) => ({
    text: { tag: "plain_text", content: `${m.displayName} (Lv${m.currentLevel})` },
    value: m.id
  }));

  const itemOptions = ITEM_CODES.map((code) => ({
    text: { tag: "plain_text", content: code },
    value: code
  }));

  const elements: Array<Record<string, unknown>> = [
    {
      tag: "markdown",
      content: "**请填写调分信息**\n操作将直接写入评分系统,无法撤销。"
    },
    {
      tag: "action",
      actions: [
        {
          tag: "select_static",
          placeholder: { tag: "plain_text", content: "选择成员" },
          initial_option: state.selectedMemberId ?? undefined,
          value: { action: "manual_adjust_select_member" },
          options: memberOptions
        }
      ]
    },
    {
      tag: "action",
      actions: [
        {
          tag: "select_static",
          placeholder: { tag: "plain_text", content: "选择项目 (itemCode)" },
          initial_option: state.selectedItemCode ?? undefined,
          value: { action: "manual_adjust_select_item" },
          options: itemOptions
        }
      ]
    },
    {
      tag: "markdown",
      content: "**分值变化 (delta)** 和 **备注** 请在下方提交时填写"
    },
    {
      tag: "action",
      actions: [
        {
          tag: "button",
          text: { tag: "plain_text", content: "✅ 确认调分" },
          type: "primary",
          value: {
            action: "manual_adjust_confirm",
            memberId: state.selectedMemberId ?? "",
            itemCode: state.selectedItemCode ?? "",
            delta: state.delta ?? 0,
            note: state.note ?? ""
          }
        }
      ]
    }
  ];

  return {
    schema: "2.0",
    header: header as unknown as Record<string, unknown>,
    body: { elements }
  };
}
