/**
 * Dashboard pin card template — persistent/pinned card in Feishu group chat.
 *
 * Shows a compact leaderboard summary (top 5) with a link to the full
 * web dashboard. Supports refresh via card action button.
 */

import type { FeishuCardJson } from "../types.js";
import { buildHeader } from "./common/header.js";

export const DASHBOARD_PIN_TEMPLATE_ID = "dashboard_pin" as const;

// ============================================================================
// State shape
// ============================================================================

export interface DashboardPinEntry {
  displayName: string;
  cumulativeAq: number;
  currentLevel: number;
}

export interface DashboardPinState {
  topN: DashboardPinEntry[];
  totalMembers: number;
  generatedAt: string;
  dashboardUrl: string;
}

// ============================================================================
// Rendering helpers
// ============================================================================

const LEVEL_BADGES: Record<number, string> = {
  1: "🌱",
  2: "🌿",
  3: "🌳",
  4: "🌟",
  5: "💎"
};

const RANK_MEDALS = ["🥇", "🥈", "🥉"];

function levelBadge(level: number): string {
  return LEVEL_BADGES[level] ?? `Lv${level}`;
}

function renderRankLine(rank: number, entry: DashboardPinEntry): string {
  const medal = rank <= 3 ? RANK_MEDALS[rank - 1] : `${rank}.`;
  const badge = levelBadge(entry.currentLevel);
  return `${medal} **${entry.displayName}** ${badge}　AQ ${entry.cumulativeAq}`;
}

// ============================================================================
// Card builder
// ============================================================================

export function buildDashboardPinCard(state: DashboardPinState): FeishuCardJson {
  const rankLines = state.topN.map((entry, i) => renderRankLine(i + 1, entry));
  const content = rankLines.length > 0
    ? rankLines.join("\n")
    : "暂无排行数据";

  const elements: Array<Record<string, unknown>> = [
    {
      tag: "markdown",
      content
    }
  ];

  // 分隔线
  elements.push({ tag: "hr" });

  // 底部信息 + 按钮行
  const actions: Array<Record<string, unknown>> = [];

  // "查看完整看板" URL 跳转按钮
  if (state.dashboardUrl) {
    actions.push({
      tag: "button",
      text: { tag: "plain_text", content: "📊 查看完整看板" },
      type: "primary",
      multi_url: {
        url: state.dashboardUrl,
        pc_url: state.dashboardUrl,
        android_url: state.dashboardUrl,
        ios_url: state.dashboardUrl
      }
    });
  }

  // 刷新按钮
  actions.push({
    tag: "button",
    text: { tag: "plain_text", content: "🔄 刷新" },
    type: "default",
    value: { action: "dashboard_pin_refresh" }
  });

  elements.push({
    tag: "action",
    actions
  });

  // 底部备注
  elements.push({
    tag: "note",
    elements: [
      {
        tag: "plain_text",
        content: `共 ${state.totalMembers} 名学员 · 更新于 ${state.generatedAt}`
      }
    ]
  });

  return {
    schema: "2.0",
    config: {
      update_multi: true,
      enable_forward: true,
    },
    header: buildHeader({
      title: "📊 成长看板 · 实时排行",
      subtitle: "点击查看完整数据看板",
      template: "purple"
    }) as unknown as Record<string, unknown>,
    body: { elements }
  };
}
