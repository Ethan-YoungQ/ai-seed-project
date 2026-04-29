#!/usr/bin/env node
/**
 * Weekly Ranking Report
 *
 * Fetches the current leaderboard and posts a settlement card to the
 * configured Feishu group chat. Designed to be triggered by a systemd
 * timer every Thursday at 12:00.
 *
 * Usage: npx tsx src/scripts/weekly-ranking-report.ts
 */

import { loadLocalEnv } from "../config/load-env.js";
import {
  readFeishuConfig,
  withResolvedFeishuConfig,
} from "../services/feishu/config.js";
import { LarkFeishuApiClient } from "../services/feishu/client.js";
import { SqliteRepository } from "../storage/sqlite-repository.js";

const DEFAULT_DB_PATH = "./data/app.db";
const TOP_N = 3;
const BOTTOM_N = 3;

export interface RankingEntry {
  rank: number;
  memberName: string;
  currentLevel: number;
  dimensions: { K: number; H: number; C: number; S: number; G: number };
  cumulativeAq: number;
}

function rankEmoji(rank: number): string {
  if (rank === 1) return "🥇";
  if (rank === 2) return "🥈";
  if (rank === 3) return "🥉";
  return `${rank}.`;
}

export function buildReportCard(
  top3: RankingEntry[],
  bottom3: RankingEntry[],
): string {
  // Top 3 section
  let text = `🏆 每周排行榜速报！\n\n`;
  text += `【🎉 恭喜前三名】\n`;

  for (const entry of top3) {
    const dims = Object.entries(entry.dimensions)
      .filter(([_, v]) => v > 0)
      .map(([k, v]) => `${k}:${v}`)
      .join(" ");
    text += `${rankEmoji(entry.rank)} **${entry.memberName}** Lv.${entry.currentLevel} | ${entry.cumulativeAq}AQ | ${dims}\n`;
  }

  // Praise for #1
  const top = top3[0];
  if (top) {
    const compliments = [
      `👏 恭喜 @${top.memberName} 获得本周冠军！维度全能，稳如泰山！`,
      `🔥 @${top.memberName} 本周表现太亮眼了，全场最佳就是你！`,
      `⭐ @${top.memberName} 以 ${top.cumulativeAq}AQ 高居榜首，继续保持！`,
    ];
    text += `\n${compliments[Math.floor(Math.random() * compliments.length)]}\n`;
  }

  // Bottom 3 section
  text += `\n【💪 加油后三名】\n`;
  for (const entry of bottom3) {
    text += `📌 ${entry.memberName} Lv.${entry.currentLevel} | ${entry.cumulativeAq}AQ\n`;
  }

  const encouragements = [
    `\n🌱 排名不是终点，每一次学习都在积累！下周继续加油！`,
    `\n💡 进步是一点一点积累的，下周一定会更好！`,
    `\n🚀 别人跑得快不代表你跑不远，坚持就是胜利！`,
  ];
  text += encouragements[Math.floor(Math.random() * encouragements.length)];

  return text;
}

async function main() {
  loadLocalEnv();

  const feishuConfig = readFeishuConfig(process.env);
  if (!feishuConfig.botChatId) {
    throw new Error("FEISHU_BOT_CHAT_ID not configured");
  }

  // Initialize repository to fetch ranking
  const dbUrl = process.env.DATABASE_URL || DEFAULT_DB_PATH;
  const repository = new SqliteRepository(dbUrl);

  // Query database for current ranking
  const campId = repository.getDefaultCampId();
  if (!campId) {
    throw new Error("No default camp configured — cannot generate ranking report");
  }
  const ranking = repository.fetchRankingByCamp(campId);

  if (!ranking || ranking.length === 0) {
    console.log("[WeeklyRanking] No ranking data, skipping");
    return;
  }

  const entries: RankingEntry[] = ranking.map((r, i) => ({
    rank: i + 1,
    memberName: r.memberName || "未知",
    currentLevel: r.currentLevel ?? 1,
    dimensions: {
      K: r.dimensions?.K ?? 0,
      H: r.dimensions?.H ?? 0,
      C: r.dimensions?.C ?? 0,
      S: r.dimensions?.S ?? 0,
      G: r.dimensions?.G ?? 0,
    },
    cumulativeAq: r.cumulativeAq ?? 0,
  }));

  const top3 = entries.slice(0, TOP_N);
  const bottom3 = [...entries
    .filter((e) => e.cumulativeAq > 0)
    .slice(-BOTTOM_N)]
    .reverse();

  const cardText = buildReportCard(top3, bottom3);
  console.log(`[WeeklyRanking] Card text:\n${cardText}`);

  // Send via Feishu API
  const resolved = withResolvedFeishuConfig(feishuConfig);
  const client = new LarkFeishuApiClient(resolved);
  await client.sendTextMessage({
    receiveId: feishuConfig.botChatId,
    receiveIdType: "chat_id" as const,
    text: cardText,
  });
  console.log("[WeeklyRanking] Report sent");
}

// Top-level entrypoint — only runs when executed directly, not when imported
const isDirectRun =
  typeof process !== "undefined" &&
  process.argv[1] &&
  import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/"));

if (isDirectRun) {
  main().catch((err) => {
    console.error("[WeeklyRanking] Failed:", err);
    process.exit(1);
  });
}
