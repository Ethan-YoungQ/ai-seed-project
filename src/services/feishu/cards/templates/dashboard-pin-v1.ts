/**
 * 战绩天梯榜 — 飞书群聊常驻卡片
 *
 * 简洁的链接卡片，不调用排行 API，仅展示入口链接。
 * 参考飞书"AI奇点看板已上线"卡片样式。
 */

import type { FeishuCardJson } from "../types.js";
import { buildHeader } from "./common/header.js";

export const DASHBOARD_PIN_TEMPLATE_ID = "dashboard_pin" as const;

// ============================================================================
// State shape — 极简，只需要 URL
// ============================================================================

export interface DashboardPinState {
  dashboardUrl: string;
}

// ============================================================================
// Card builder
// ============================================================================

export function buildDashboardPinCard(state: DashboardPinState): FeishuCardJson {
  const elements: Array<Record<string, unknown>> = [
    {
      tag: "markdown",
      content: "**战绩天梯榜已上线！**\n\n点击下方按钮查看实时排行榜和个人成绩详情。"
    },
    {
      tag: "column_set",
      flex_mode: "none",
      background_style: "default",
      columns: [
        {
          tag: "column",
          width: "auto",
          vertical_align: "center",
          elements: [
            {
              tag: "button",
              text: { tag: "plain_text", content: "📊 打开天梯榜" },
              type: "primary",
              multi_url: {
                url: state.dashboardUrl,
                pc_url: state.dashboardUrl,
                android_url: state.dashboardUrl,
                ios_url: state.dashboardUrl
              }
            }
          ]
        }
      ]
    }
  ];

  return {
    schema: "2.0",
    config: {
      update_multi: true,
      enable_forward: true,
    },
    header: buildHeader({
      title: "🏆 战绩天梯榜",
      subtitle: "查看排行榜和个人成绩",
      template: "green"
    }) as unknown as Record<string, unknown>,
    body: { elements }
  };
}
