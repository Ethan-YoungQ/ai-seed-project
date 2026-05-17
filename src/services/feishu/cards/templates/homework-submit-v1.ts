import type { FeishuCardJson } from "../types.js";
import { buildHeader } from "./common/header.js";

export const HOMEWORK_SUBMIT_TEMPLATE_ID = "homework-submit-v1" as const;

export interface HomeworkCardState {
  sessionId: string;
  title: string;
  deadline: string;
  submitterCount: number;
}

function singleButtonRow(button: Record<string, unknown>): Record<string, unknown> {
  return {
    tag: "column_set",
    flex_mode: "none",
    background_style: "default",
    columns: [
      {
        tag: "column",
        width: "weighted",
        weight: 1,
        vertical_align: "center",
        elements: [button],
      },
    ],
  };
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
        singleButtonRow({
          tag: "button",
          name: "homework_submit",
          text: { tag: "plain_text", content: "提交作业 📤" },
          type: "primary",
          value: { action: "homework_submit", sessionId: state.sessionId }
        })
      ]
    }
  };
}
