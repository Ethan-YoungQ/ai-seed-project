/**
 * 手动调分卡片 — Schema 2.0（column_set 布局）
 *
 * 运营在群聊中发 "调分" → 弹出此卡片。
 * 用户通过 3 个 select_static 选择成员/评分项/分值变化，
 * 然后点按钮确认。WS 模式下 select 值通过服务端缓存注入。
 */

import type { FeishuCardJson, MemberLite } from "../types.js";
import { buildHeader } from "./common/header.js";

export const MANUAL_ADJUST_TEMPLATE_ID = "manual-adjust-v1" as const;

/** 可调整的评分项 */
const ITEM_CODES = ["K1", "K2", "K3", "K4", "H1", "H2", "H3", "C1", "C2", "C3", "S1", "S2", "G1", "G2", "G3"];

/** 预设分值选项 */
const DELTA_OPTIONS = [
  { label: "+1", value: "1" },
  { label: "+2", value: "2" },
  { label: "+3", value: "3" },
  { label: "+5", value: "5" },
  { label: "+10", value: "10" },
  { label: "-1", value: "-1" },
  { label: "-2", value: "-2" },
  { label: "-3", value: "-3" },
  { label: "-5", value: "-5" },
];

export interface ManualAdjustState {
  members: MemberLite[];
}

export function buildManualAdjustCard(state: ManualAdjustState): FeishuCardJson {
  const memberOptions = state.members.map((m) => ({
    text: { tag: "plain_text", content: `${m.displayName} (Lv${m.currentLevel})` },
    value: m.id
  }));

  const itemOptions = ITEM_CODES.map((code) => ({
    text: { tag: "plain_text", content: code },
    value: code
  }));

  const deltaOptions = DELTA_OPTIONS.map((d) => ({
    text: { tag: "plain_text", content: d.label },
    value: d.value
  }));

  const elements: Array<Record<string, unknown>> = [
    {
      tag: "markdown",
      content: "**请依次选择：成员 → 评分项 → 分值变化，然后点确认**\n操作将直接写入评分系统，无法撤销。"
    },
    // 成员选择
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
              value: { action: "manual_adjust_select_member" },
              options: memberOptions
            }
          ]
        }
      ]
    },
    // 评分项选择
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
              placeholder: { tag: "plain_text", content: "选择评分项" },
              value: { action: "manual_adjust_select_item" },
              options: itemOptions
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
              placeholder: { tag: "plain_text", content: "分值变化" },
              value: { action: "manual_adjust_select_delta" },
              options: deltaOptions
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
              text: { tag: "plain_text", content: "✅ 确认调分" },
              type: "primary",
              value: { action: "manual_adjust_confirm" }
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
      title: "⚙️ 手动调分",
      subtitle: "运营专用 · 请谨慎操作",
      template: "grey"
    }) as unknown as Record<string, unknown>,
    body: { elements }
  };
}
