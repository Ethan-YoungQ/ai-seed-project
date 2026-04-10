import type { FeishuCardJson } from "../types.js";
import { buildHeader } from "./common/header.js";

export const LEVEL_ANNOUNCEMENT_TEMPLATE_ID = "level-announcement-v1" as const;

export interface LevelAnnouncementItem {
  memberName: string;
  oldLevel: number;
  newLevel: number;
  direction: "up" | "down" | "same";
}

export interface LevelAnnouncementState {
  announcements: LevelAnnouncementItem[];
}

function directionEmoji(direction: "up" | "down" | "same"): string {
  if (direction === "up") return "⬆️";
  if (direction === "down") return "⬇️";
  return "➡️";
}

function renderAnnouncementLine(item: LevelAnnouncementItem): string {
  const arrow = directionEmoji(item.direction);
  return `${arrow} **${item.memberName}**: Lv.${item.oldLevel} → Lv.${item.newLevel}`;
}

export function buildLevelAnnouncementCard(state: LevelAnnouncementState): FeishuCardJson {
  const lines = state.announcements.map(renderAnnouncementLine).join("\n");

  return {
    schema: "2.0",
    header: buildHeader({
      title: "🏆 窗口结算 — 等级变化",
      template: "purple"
    }) as unknown as Record<string, unknown>,
    body: {
      elements: [
        {
          tag: "markdown",
          content: `本窗口结算后等级变化如下：\n\n${lines}`
        }
      ]
    }
  };
}
