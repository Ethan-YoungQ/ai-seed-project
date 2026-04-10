import type { FeishuCardJson } from "../types.js";
import { buildHeader } from "./common/header.js";

export const WINDOW_OPEN_TEMPLATE_ID = "window-open-v1" as const;

export interface WindowOpenState {
  windowCode: string;
  periodNumber: number;
  openedAt: string;
}

export function buildWindowOpenCard(state: WindowOpenState): FeishuCardJson {
  return {
    schema: "2.0",
    header: buildHeader({
      title: `🪟 ${state.windowCode} 窗口已开启`,
      template: "blue"
    }) as unknown as Record<string, unknown>,
    body: {
      elements: [
        {
          tag: "markdown",
          content: `第 ${state.periodNumber} 期 **${state.windowCode}** 窗口正式开放！\n⏰ ${state.openedAt}`
        }
      ]
    }
  };
}
