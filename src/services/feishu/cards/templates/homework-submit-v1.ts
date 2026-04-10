import type { FeishuCardJson } from "../types.js";
import { buildHeader } from "./common/header.js";

export const HOMEWORK_SUBMIT_TEMPLATE_ID = "homework-submit-v1" as const;

export interface HomeworkCardState {
  sessionId: string;
  title: string;
  deadline: string;
  submitterCount: number;
}

export function buildHomeworkSubmitCard(state: HomeworkCardState): FeishuCardJson {
  return {
    schema: "2.0",
    header: buildHeader({
      title: "📝 作业提交",
      template: "orange"
    }) as unknown as Record<string, unknown>,
    body: {
      elements: [
        {
          tag: "markdown",
          content: `**${state.title}**\n\n⏰ 截止时间：${state.deadline}\n👥 已提交：${state.submitterCount} 人`
        },
        {
          tag: "action",
          actions: [
            {
              tag: "button",
              text: { tag: "plain_text", content: "提交作业 📤" },
              type: "primary",
              value: { action: "homework_submit", sessionId: state.sessionId }
            }
          ]
        }
      ]
    }
  };
}
