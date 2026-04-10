import { describe, expect, test } from "vitest";
import {
  buildC1EchoCard,
  C1_ECHO_TEMPLATE_ID,
  type C1EchoState
} from "../../../../../src/services/feishu/cards/templates/c1-echo-v1.js";
import { assertCardSize } from "../../../../../src/services/feishu/cards/renderer.js";

function makeState(overrides: Partial<C1EchoState> = {}): C1EchoState {
  return {
    memberId: "m-alice",
    memberName: "Alice",
    text: "用 Claude 帮我自动分析竞品文章，每天节省2小时！",
    messageId: "om-1",
    ...overrides
  };
}

describe("c1-echo-v1 template", () => {
  test("C1_ECHO_TEMPLATE_ID is 'c1-echo-v1'", () => {
    expect(C1_ECHO_TEMPLATE_ID).toBe("c1-echo-v1");
  });

  test("header contains memberName and 创意用法分享", () => {
    const card = buildC1EchoCard(makeState({ memberName: "张三" }));
    const json = JSON.stringify(card);
    expect(json).toContain("张三");
    expect(json).toContain("创意用法分享");
  });

  test("body contains text and C2 emoji reaction prompt", () => {
    const card = buildC1EchoCard(makeState({
      text: "用 Claude 生成了一份完整的商业计划书",
      memberName: "李四"
    }));
    const json = JSON.stringify(card);
    expect(json).toContain("用 Claude 生成了一份完整的商业计划书");
    expect(json).toContain("李四");
    expect(json).toContain("C2");
  });

  test("card stays within size budget", () => {
    const card = buildC1EchoCard(makeState());
    expect(() => assertCardSize(card)).not.toThrow();
  });
});
