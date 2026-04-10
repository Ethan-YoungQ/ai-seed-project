import { describe, expect, test } from "vitest";

import {
  buildQuizCard,
  QUIZ_TEMPLATE_ID,
  type QuizCardState
} from "../../../../../src/services/feishu/cards/templates/quiz-v1.js";
import { CARD_SIZE_BUDGET_BYTES } from "../../../../../src/services/feishu/cards/renderer.js";

function sampleState(): QuizCardState {
  return {
    setCode: "W1-Q1",
    periodNumber: 2,
    title: "本期小测验",
    questions: [
      {
        id: "q1",
        text: "以下哪项是正确的?",
        options: [
          { id: "a", text: "选项 A", isCorrect: true },
          { id: "b", text: "选项 B", isCorrect: false }
        ]
      },
      {
        id: "q2",
        text: "下列说法正确的是?",
        options: [
          { id: "a", text: "选项 A", isCorrect: false },
          { id: "b", text: "选项 B", isCorrect: true }
        ]
      }
    ]
  };
}

describe("buildQuizCard (quiz-v1 template)", () => {
  test("header contains quiz title", () => {
    const card = buildQuizCard(sampleState());
    const header = card.header as Record<string, unknown>;
    const titleBlock = header.title as { tag: string; content: string };
    expect(titleBlock.content).toBe("本期小测验");
  });

  test("all questions and options are embedded in the card body", () => {
    const card = buildQuizCard(sampleState());
    const bodyJson = JSON.stringify(card.body);
    expect(bodyJson).toContain("以下哪项是正确的?");
    expect(bodyJson).toContain("下列说法正确的是?");
    expect(bodyJson).toContain("选项 A");
    expect(bodyJson).toContain("选项 B");
  });

  test("submit button has quiz_submit action and setCode", () => {
    const state = sampleState();
    const card = buildQuizCard(state);
    const bodyJson = JSON.stringify(card.body);
    expect(bodyJson).toContain("quiz_submit");
    expect(bodyJson).toContain(state.setCode);
    expect(bodyJson).toContain("提交答案");
  });

  test("option buttons carry quiz_select, questionId and optionId", () => {
    const card = buildQuizCard(sampleState());
    // Collect all button value payloads by recursively scanning body elements
    const buttonValues: Array<Record<string, unknown>> = [];
    for (const el of card.body.elements) {
      if (el["tag"] === "action") {
        const actions = el["actions"] as Array<Record<string, unknown>>;
        for (const action of actions) {
          if (typeof action["value"] === "string") {
            buttonValues.push(JSON.parse(action["value"] as string) as Record<string, unknown>);
          }
        }
      }
    }
    const selectActions = buttonValues.filter((v) => v["action"] === "quiz_select");
    expect(selectActions.length).toBeGreaterThan(0);
    const questionIds = selectActions.map((v) => v["questionId"]);
    const optionIds = selectActions.map((v) => v["optionId"]);
    expect(questionIds).toContain("q1");
    expect(questionIds).toContain("q2");
    expect(optionIds).toContain("a");
    expect(optionIds).toContain("b");
  });

  test("card payload stays within the 25 KB size budget", () => {
    const card = buildQuizCard(sampleState());
    const size = Buffer.byteLength(JSON.stringify(card), "utf8");
    expect(size).toBeLessThanOrEqual(CARD_SIZE_BUDGET_BYTES);
  });

  test("QUIZ_TEMPLATE_ID is 'quiz-v1'", () => {
    expect(QUIZ_TEMPLATE_ID).toBe("quiz-v1");
  });
});
