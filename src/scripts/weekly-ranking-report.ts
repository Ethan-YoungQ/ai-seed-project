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
      `@${top.memberName} 本周以 ${top.cumulativeAq}AQ 排在第一，说明你在学习、实践和分享上都有持续投入，继续保持这个节奏。`,
      `@${top.memberName} 这周的优势不只是分数高，而是多个维度都有记录，${top.cumulativeAq}AQ 是稳定参与换来的结果。`,
      `@${top.memberName} 本周拿到 ${top.cumulativeAq}AQ，贡献比较持续。下一步可以多补一点复盘，让经验更容易被同学复用。`,
    ];
    text += `\n${compliments[Math.floor(Math.random() * compliments.length)]}\n`;
  }

  // Bottom 3 section
  text += `\n【💪 后三名冲冲冲】\n`;
  for (const entry of bottom3) {
    text += `📌 ${entry.memberName} Lv.${entry.currentLevel} | ${entry.cumulativeAq}AQ\n`;
  }

  const encouragements = [
    `\n🌱 排名只是当前快照。下周可以先从一次作业提交、一次工具复盘或一次同伴答疑开始，把分数慢慢补起来。`,
    `\n💪 暂时落后不代表跟不上。优先完成基础打卡，再补一条可复用的 AI 实践经验，会更容易追上节奏。`,
    `\n📌 下一步很明确：少量但持续地提交、复盘、互助，天梯榜会更快反映你的进展。`,
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
