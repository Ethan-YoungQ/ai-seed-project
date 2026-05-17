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

  it("instructs the bot to use grounded operational praise", () => {
    const prompt = buildPraisePrompt("学员", ["C1"], 5);
    expect(prompt).toMatch(/运营助教|具体亮点|学习价值|下一步/i);
    expect(prompt).toMatch(/图片、流程、复盘、失败经验、工具用法、同伴答疑/);
  });

  it("bans high-repeat slang from proactive praise instructions", () => {
    const prompt = buildPraisePrompt("学员", ["C1"], 5);
    expect(prompt).toMatch(/禁止使用/);
    expect(prompt).toMatch(/绝绝子、yyds、天花板、杀疯了、封神、拿捏、炸场、卷王、含金量拉满/);
  });

  it("does not pressure students to share prompts for image or artifact praise", () => {
    const prompt = buildPraisePrompt("学员", ["ai_artifact"], 5);
    expect(prompt).not.toMatch(/快分享\s*prompt|share\s+prompt|抄作业|用 ChatGPT 设计的\?/i);
    expect(prompt).not.toMatch(/大家.*围观|小伙伴们快来围观|欢迎其他同学/i);
  });

  it("uses separate praise examples for artifact, reflection, method sharing, and peer help", () => {
    const prompt = buildPraisePrompt("学员", ["ai_artifact", "peer_help"], 7);
    expect(prompt).toContain("AI 产物");
    expect(prompt).toContain("实践复盘");
    expect(prompt).toContain("方法分享");
    expect(prompt).toContain("同伴互助");
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

  it("does not force repetitive generic praise openings", () => {
    const prompt = buildSystemPrompt("student", "李明");
    expect(prompt).not.toContain("哪怕问题很基础，也说\"这个问题问得好\"类似的话");
    expect(prompt).toContain("不要固定使用");
    expect(prompt).toContain("这个问题问得");
  });

  it("asks for short specific internet-style micro praise when praising", () => {
    const prompt = buildSystemPrompt("student", "李明");
    expect(prompt).toContain("具体微夸");
    expect(prompt).toContain("15-35 字");
    expect(prompt).toContain("抓住对方内容里的一个具体亮点");
  });

  it("generates output for any role without throwing", () => {
    for (const role of ["student", "trainer", "operator", "observer"] as const) {
      expect(() => buildSystemPrompt(role, "测试")).not.toThrow();
    }
  });
});
