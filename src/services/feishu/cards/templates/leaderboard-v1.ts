import type { FeishuCardJson, LeaderboardState } from "../types.js";
import { buildHeader } from "./common/header.js";

export const LEADERBOARD_TEMPLATE_ID = "leaderboard-v1" as const;

const LEVEL_BADGES: Record<number, string> = {
  1: "🌱",
  2: "🌿",
  3: "🌳",
  4: "🌟",
  5: "💎"
};

function levelBadge(level: number): string {
  return LEVEL_BADGES[level] ?? `Lv${level}`;
}

function renderRankLine(
  rank: number,
  entry: LeaderboardState["topN"][number]
): string {
  const badge = levelBadge(entry.currentLevel);
  const medal = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : `${rank}.`;
  return `${medal} **${entry.displayName}** ${badge} · AQ ${entry.cumulativeAq}`;
}

export function buildLeaderboardCard(state: LeaderboardState): FeishuCardJson {
  const rankLines = state.topN.map((entry, i) => renderRankLine(i + 1, entry));
  const content = rankLines.join("\n");

  const elements: Array<Record<string, unknown>> = [
    {
      tag: "markdown",
      content
    }
  ];

  if (state.radarImageUrl) {
    elements.push({
      tag: "img",
      img_key: state.radarImageUrl,
      alt: { tag: "plain_text", content: "雷达图" }
    });
  }

  elements.push({
    tag: "action",
    actions: [
      {
        tag: "button",
        text: { tag: "plain_text", content: "🔄 刷新排行榜" },
        type: "default",
        value: { action: "leaderboard_refresh" }
      }
    ]
  });

  return {
    schema: "2.0",
    header: buildHeader({
      title: "🏆 排行榜",
      subtitle: `更新于 ${state.generatedAt}`,
      template: "blue"
    }) as unknown as Record<string, unknown>,
    body: { elements }
  };
}
