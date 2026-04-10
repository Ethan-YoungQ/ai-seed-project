import type { FeishuCardJson } from "../types.js";
import { buildHeader } from "./common/header.js";

export const GRADUATION_TEMPLATE_ID = "graduation-v1" as const;

export interface GraduationState {
  campName: string;
  totalPeriods: number;
  graduatedAt: string;
}

export function buildGraduationCard(state: GraduationState): FeishuCardJson {
  return {
    schema: "2.0",
    header: buildHeader({
      title: `🎓 ${state.campName} 结业典礼`,
      template: "purple"
    }) as unknown as Record<string, unknown>,
    body: {
      elements: [
        {
          tag: "markdown",
          content: `**${state.campName}** 全 ${state.totalPeriods} 期圆满结束！\n🎉 感谢所有学员和运营的努力！\n⏰ ${state.graduatedAt}`
        }
      ]
    }
  };
}
