import type {
  CardActionContext,
  CardActionResult,
  CardHandler,
  CardHandlerDeps,
  LeaderboardState
} from "../types.js";
import {
  buildLeaderboardCard,
  LEADERBOARD_TEMPLATE_ID
} from "../templates/leaderboard-v1.js";
import { registerTemplate } from "../renderer.js";

// Ensure the template is registered when this module is loaded
registerTemplate(LEADERBOARD_TEMPLATE_ID, buildLeaderboardCard);

/**
 * Leaderboard deps extension for injecting snapshot reader.
 * The handler reads the latest leaderboard state from the live card store.
 */
export interface LeaderboardDepsExtension {
  readLeaderboardState: (chatId: string) => Promise<LeaderboardState | null>;
}

export const LEADERBOARD_READER_KEY = "readLeaderboardState";

/**
 * Handler for "leaderboard_refresh" action.
 * Reads the latest leaderboard state and returns a patched card.
 */
export const leaderboardRefreshHandler: CardHandler = async (
  ctx: CardActionContext,
  deps: CardHandlerDeps
): Promise<CardActionResult> => {
  const reader = (deps as unknown as LeaderboardDepsExtension)[LEADERBOARD_READER_KEY];

  if (typeof reader !== "function") {
    // Fallback: load from live card store
    const liveRow = deps.repo.findLiveCard("leaderboard", ctx.chatId);
    if (!liveRow) {
      return {
        toast: { type: "error", content: "未找到排行榜卡片,请联系运营" }
      };
    }

    const state = liveRow.stateJson as LeaderboardState;
    const newCardJson = buildLeaderboardCard(state);
    return { newCardJson };
  }

  const state = await reader(ctx.chatId);
  if (!state) {
    return {
      toast: { type: "error", content: "暂无排行榜数据" }
    };
  }

  const newCardJson = buildLeaderboardCard(state);
  return { newCardJson };
};
