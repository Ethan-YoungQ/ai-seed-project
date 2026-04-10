import { buildHeader } from "./common/header.js";
import type { FeishuCardJson } from "../types.js";
import { assertCardSize } from "../renderer.js";

/** Stable template identifier for the quiz card. */
export const QUIZ_TEMPLATE_ID = "quiz-v1";

/** A single answer option within a quiz question. */
export interface QuizOption {
  id: string;
  text: string;
  isCorrect: boolean;
}

/** A single question in the quiz. */
export interface QuizQuestion {
  id: string;
  text: string;
  options: QuizOption[];
}

/** State required to render a quiz card. */
export interface QuizCardState {
  setCode: string;
  periodNumber: number;
  title: string;
  questions: QuizQuestion[];
}

/**
 * Renders a static quiz card (no live_card row).
 * Students click option buttons (recorded as card_interactions) then
 * press the submit button to compute K1 + K2 scores.
 */
export function buildQuizCard(state: QuizCardState): FeishuCardJson {
  const { setCode, periodNumber, title, questions } = state;

  const header = buildHeader({
    title,
    subtitle: `第 ${periodNumber} 期 · ${setCode}`,
    template: "blue"
  });

  const elements: Array<Record<string, unknown>> = [];

  for (const question of questions) {
    // Question text as a markdown block
    elements.push({
      tag: "markdown",
      content: `**${question.text}**`
    });

    // One action button per option
    const actions: Array<Record<string, unknown>> = question.options.map(
      (option) => ({
        tag: "button",
        text: { tag: "plain_text", content: option.text },
        type: "default",
        value: JSON.stringify({
          action: "quiz_select",
          setCode,
          questionId: question.id,
          optionId: option.id
        })
      })
    );

    elements.push({
      tag: "action",
      actions
    });
  }

  // Submit button
  elements.push({
    tag: "action",
    actions: [
      {
        tag: "button",
        text: { tag: "plain_text", content: "提交答案" },
        type: "primary",
        value: JSON.stringify({
          action: "quiz_submit",
          setCode
        })
      }
    ]
  });

  const card: FeishuCardJson = {
    schema: "2.0",
    header,
    body: { elements }
  };

  assertCardSize(card);
  return card;
}
