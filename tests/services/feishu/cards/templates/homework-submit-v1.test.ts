import { describe, expect, test } from "vitest";
import {
  buildHomeworkSubmitCard,
  HOMEWORK_SUBMIT_TEMPLATE_ID,
  type HomeworkCardState
} from "../../../../../src/services/feishu/cards/templates/homework-submit-v1.js";
import { assertCardSize } from "../../../../../src/services/feishu/cards/renderer.js";

function makeState(overrides: Partial<HomeworkCardState> = {}): HomeworkCardState {
  return {
    sessionId: "hw-session-001",
    title: "第一期综合作业",
    deadline: "2026-04-15T23:59:00.000Z",
    submitterCount: 5,
    ...overrides
  };
}

describe("homework-submit-v1 template", () => {
  test("HOMEWORK_SUBMIT_TEMPLATE_ID is 'homework-submit-v1'", () => {
    expect(HOMEWORK_SUBMIT_TEMPLATE_ID).toBe("homework-submit-v1");
  });

  test("header contains 作业提交", () => {
    const card = buildHomeworkSubmitCard(makeState());
    const json = JSON.stringify(card);
    expect(json).toContain("作业提交");
  });

  test("body contains title, deadline, submitterCount, and homework_submit action", () => {
    const card = buildHomeworkSubmitCard(makeState({
      title: "AI 实操综合题",
      deadline: "2026-05-01T18:00:00.000Z",
      submitterCount: 12
    }));
    const json = JSON.stringify(card);
    expect(json).toContain("AI 实操综合题");
    expect(json).toContain("2026-05-01T18:00:00.000Z");
    expect(json).toContain("12");
    expect(json).toContain("homework_submit");
  });

  test("card stays within size budget", () => {
    const card = buildHomeworkSubmitCard(makeState());
    expect(() => assertCardSize(card)).not.toThrow();
  });
});
