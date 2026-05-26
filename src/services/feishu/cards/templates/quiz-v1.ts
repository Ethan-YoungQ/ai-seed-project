import { buildHeader } from "./common/header.js";
import type { FeishuCardJson } from "../types.js";
import { assertCardSize } from "../renderer.js";

/** Stable template identifier for the quiz card. */
export const QUIZ_TEMPLATE_ID = "quiz-v1";

export interface QuizOption {
  id: string;
  text: string;
  isCorrect: boolean;
}

export interface QuizQuestion {
  id: string;
  text: string;
  options: QuizOption[];
}

export interface QuizCardState {
  setCode: string;
  periodNumber: number;
  title: string;
  questions: QuizQuestion[];
  showSubmit?: boolean;
}

/**
 * Schema 2.0 helper: wrap buttons in column_set.
 * Feishu Schema 2.0 does NOT support the "action" element type.
 */
function buttonRow(buttons: Array<Record<string, unknown>>): Record<string, unknown> {
  return {
    tag: "column_set",
    flex_mode: "none",
    background_style: "default",
    columns: buttons.map((button) => ({
        tag: "column",
        width: "weighted",
        weight: 1,
        elements: [button],
      })),
  };
}

/**
 * Renders a quiz card using Schema 2.0 (column_set for buttons).
 * value is an object (not JSON string) — value.action is used for routing.
 */
export function buildQuizCard(state: QuizCardState): FeishuCardJson {
  const { setCode, periodNumber, title, questions, showSubmit = true } = state;

  const header = buildHeader({
    title,
    subtitle: `第 ${periodNumber} 期 · ${setCode}`,
    template: "blue",
  });

  const elements: Array<Record<string, unknown>> = [];

  questions.forEach((question, questionIndex) => {
    elements.push({
      tag: "markdown",
      content: `**${question.text}**`,
    });

    // Option buttons — each needs a unique name (Schema 2.0 requirement).
    // Render two buttons per row to keep large quiz cards below Feishu's size limit.
    for (let i = 0; i < question.options.length; i += 2) {
      const rowOptions = question.options.slice(i, i + 2);
      elements.push(buttonRow(rowOptions.map((option) => ({
          tag: "button",
          name: `quiz_select_${question.id}_${option.id}`,
          text: { tag: "plain_text", content: option.text },
          type: "default",
          value: {
            action: "quiz_select",
            setCode,
            questionId: question.id,
            optionId: option.id,
          },
      }))));
    }

    if (questionIndex < questions.length - 1) {
      elements.push({ tag: "hr" });
    }
  });

  if (showSubmit) {
    elements.push(
      buttonRow([{
        tag: "button",
        name: "quiz_submit",
        text: { tag: "plain_text", content: "📝 提交答案" },
        type: "primary",
        value: {
          action: "quiz_submit",
          setCode,
        },
      }]),
    );
  }

  const card: FeishuCardJson = {
    schema: "2.0",
    header: header as unknown as Record<string, unknown>,
    body: { elements },
  };

  assertCardSize(card);
  return card;
}
