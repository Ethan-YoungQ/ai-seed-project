import type { FeishuCardJson } from "../types.js";
import { buildHeader } from "./common/header.js";

export const PERIOD_OPEN_TEMPLATE_ID = "period-open-v1" as const;

export interface PeriodOpenState {
  periodNumber: number;
  campName: string;
  openedAt: string;
}

export function buildPeriodOpenCard(state: PeriodOpenState): FeishuCardJson {
  return {
    schema: "2.0",
    header: buildHeader({
      title: `📣 第 ${state.periodNumber} 期已开启`,
      template: "green"
    }) as unknown as Record<string, unknown>,
    body: {
      elements: [
        {
          tag: "markdown",
          content: `**${state.campName}** 第 ${state.periodNumber} 期正式开始！\n⏰ ${state.openedAt}`
        }
      ]
    }
  };
}
