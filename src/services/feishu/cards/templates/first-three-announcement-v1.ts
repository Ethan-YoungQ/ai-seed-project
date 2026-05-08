import type { FeishuCardJson } from "../types.js";
import { buildHeader } from "./common/header.js";

export const FIRST_THREE_ANNOUNCEMENT_TEMPLATE_ID = "first-three-announcement-v1" as const;

// Level display names matching system spec
const LEVEL_NAMES: Record<number, string> = {
  2: "AI 研究员",
  3: "AI 操盘手",
  4: "AI 智慧顾问",
  5: "AI 奇点玩家",
};

const ORDINAL_LABELS: Record<number, string> = {
  1: "第一位",
  2: "第二位",
  3: "第三位",
};

export interface FirstThreeAnnouncementItem {
  ordinal: 1 | 2 | 3;
  memberName: string;
  targetLevel: 2 | 3 | 4 | 5;
}

export interface FirstThreeAnnouncementState {
  items: FirstThreeAnnouncementItem[];
}

function renderItem(item: FirstThreeAnnouncementItem): string {
  const levelName = LEVEL_NAMES[item.targetLevel];
  const ordinalText = ORDINAL_LABELS[item.ordinal];

  if (item.ordinal === 3) {
    return (
      `🎉 恭喜 ${item.memberName} 成为全群第三位晋升【${levelName}】的英雄！` +
      "\n━━━━━━━━━━━━━━━\n" +
      "之后晋升该段位的同事不再群公告。"
    );
  }

  return `🎉 恭喜 ${item.memberName} 成为全群${ordinalText}晋升【${levelName}】的英雄！`;
}

export function buildFirstThreeAnnouncementCard(
  state: FirstThreeAnnouncementState
): FeishuCardJson {
  const lines = state.items.map(renderItem).join("\n\n");

  return {
    schema: "2.0",
    header: buildHeader({
      title: "🏆 段位晋升公告",
      template: "purple",
    }) as unknown as Record<string, unknown>,
    body: {
      elements: [
        {
          tag: "markdown",
          content: `本窗口结算后有以下英雄成功晋升段位：\n\n${lines}`,
        },
      ],
    },
  };
}
