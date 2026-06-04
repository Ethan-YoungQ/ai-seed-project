import type { FeishuCardJson } from "../types.js";
import { buildHeader } from "./common/header.js";

const LEVEL_NAMES: Record<number, string> = {
  2: "AI 研究员",
  3: "AI 操盘手",
  4: "AI 智慧顾问",
  5: "AI 奇点玩家",
};

export interface PromotionNudgeState {
  memberName: string;
  targetLevel: 2 | 3 | 4 | 5;
  gap: number;
  totalScore: number;
}

export function buildPromotionNudgeCard(state: PromotionNudgeState): FeishuCardJson {
  const levelName = LEVEL_NAMES[state.targetLevel] ?? `Lv${state.targetLevel}`;
  return {
    schema: "2.0",
    header: buildHeader({
      title: "临近晋升提醒",
      template: "blue",
    }) as unknown as Record<string, unknown>,
    body: {
      elements: [
        {
          tag: "markdown",
          content: [
            `${state.memberName} 已经接近【${levelName}】。`,
            `当前 ${state.totalScore} AQ，还差 ${state.gap} 分。`,
            "继续提交一次高质量 AI 作品、实践复盘、方法分享或帮助同学答疑，就很有机会完成晋升。",
          ].join("\n"),
        },
      ],
    },
  };
}
