import { describe, expect, it } from "vitest";
import { buildPraisePrompt, buildSystemPrompt } from "../../../../src/services/feishu/chat-bot/persona";

describe("buildPraisePrompt", () => {
  it("includes member name and score in prompt", () => {
    const prompt = buildPraisePrompt("杨斌", ["C1", "H2"], 8);
    expect(prompt).toContain("杨斌");
    expect(prompt).toContain("8");
    expect(prompt).toContain("C1");
  });

  it("does not contain overly academic language", () => {
    const prompt = buildPraisePrompt("学员", ["K3"], 3);
    expect(prompt).not.toMatch(/该学员|展示|表现.*良好|值得表扬/i);
  });

  it("instructs the bot to use internet-style praise", () => {
    const prompt = buildPraisePrompt("学员", ["C1"], 5);
    expect(prompt).toMatch(/网感|彩虹屁|绝绝子|yyds|天花板|杀疯了|封神|拿捏|这波操作|秀/i);
  });
});

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
    expect(prompt).toContain("150 字");
  });

  it("generates output for any role without throwing", () => {
    for (const role of ["student", "trainer", "operator", "observer"] as const) {
      expect(() => buildSystemPrompt(role, "测试")).not.toThrow();
    }
  });
});
