import { describe, expect, it } from "vitest";
import { buildSystemPrompt } from "../../../../src/services/feishu/chat-bot/persona";

describe("buildSystemPrompt", () => {
  it("includes bot name 奇点小助", () => {
    const prompt = buildSystemPrompt("student", "李明");
    expect(prompt).toContain("奇点小助");
  });

  it("includes member name in prompt", () => {
    const prompt = buildSystemPrompt("student", "李明");
    expect(prompt).toContain("李明");
  });

  it("tells LLM to NOT give homework answers for students", () => {
    const prompt = buildSystemPrompt("student", "李明");
    expect(prompt).toContain("不要直接给答案");
    expect(prompt).toContain("引导");
  });

  it("allows trainer to get direct answers", () => {
    const prompt = buildSystemPrompt("trainer", "Karen");
    expect(prompt).toContain("管理员");
    expect(prompt).toContain("更自由");
  });

  it("allows operator to get direct answers", () => {
    const prompt = buildSystemPrompt("operator", "YongQ");
    expect(prompt).toContain("管理员");
    expect(prompt).toContain("更自由");
  });

  it("includes behavior guidelines", () => {
    const prompt = buildSystemPrompt("student", "李明");
    expect(prompt).toContain("温暖");
    expect(prompt).toContain("鼓励");
    expect(prompt).toContain("200 字");
  });
});
