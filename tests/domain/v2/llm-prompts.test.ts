import { describe, expect, test } from "vitest";

import {
  renderPrompt,
  type LlmScorableItemCode,
  type LlmPromptPayload
} from "../../../src/domain/v2/llm-prompts.js";

const SYSTEM_PREFIX_SNIPPET = "AI 训练营评分助手";

function payload(text: string): LlmPromptPayload {
  return { text };
}

describe("renderPrompt", () => {
  test("K3 template contains system prefix, item heading, and payload", () => {
    const out = renderPrompt("K3", payload("今天学到了 Transformer 的 attention 机制"));
    expect(out).toContain(SYSTEM_PREFIX_SNIPPET);
    expect(out).toContain("K3 知识总结打卡");
    expect(out).toContain("今天学到了 Transformer");
    expect(out).toContain("字数 >= 30");
    expect(out).toContain("满分 3");
  });

  test("K4 template describes correction/补充 rules", () => {
    const out = renderPrompt("K4", payload("AI 说 ReLU 会梯度爆炸,其实会梯度消失"));
    expect(out).toContain("K4 AI 纠错或补充");
    expect(out).toContain("指出 AI 输出的具体错误或遗漏");
    expect(out).toContain("满分 4");
  });

  test("C1 template describes creative application rules", () => {
    const out = renderPrompt("C1", payload("用 AI 生成每周会议纪要"));
    expect(out).toContain("C1 AI 创意用法");
    expect(out).toContain("可执行性");
    expect(out).toContain("满分 4");
  });

  test("C3 template describes prompt template rules", () => {
    const out = renderPrompt("C3", payload("# 角色\n你是...\n# 任务\n..."));
    expect(out).toContain("C3 自创提示词模板");
    expect(out).toContain("角色 / 任务 / 约束 / 输出");
    expect(out).toContain("满分 5");
  });

  test("H2 template describes hands-on share rules", () => {
    const out = renderPrompt("H2", payload("用 ChatGPT 做翻译,效果不错"));
    expect(out).toContain("H2 AI 实操分享");
    expect(out).toContain("AI 工具");
    expect(out).toContain("满分 3");
  });

  test("G2 template describes external resource share rules", () => {
    const out = renderPrompt("G2", payload("https://example.com 一个 AI 研究博客"));
    expect(out).toContain("G2 课外好资源");
    expect(out).toContain("不是纯广告");
    expect(out).toContain("满分 3");
  });

  test("throws on unknown item code", () => {
    expect(() =>
      renderPrompt("K1" as LlmScorableItemCode, payload("x"))
    ).toThrow(/unknown llm item/i);
    expect(() =>
      renderPrompt("ZZ" as LlmScorableItemCode, payload("x"))
    ).toThrow(/unknown llm item/i);
  });

  test("rendered prompt is deterministic for the same payload", () => {
    const a = renderPrompt("K3", payload("hello"));
    const b = renderPrompt("K3", payload("hello"));
    expect(a).toBe(b);
  });

  test("H2 template accepts fileKey in payload without error", () => {
    const out = renderPrompt("H2", { text: "用 ChatGPT 做翻译", fileKey: "file_v2_abc" });
    expect(out).toContain("H2 AI 实操分享");
    // fileKey is NOT embedded in prompt text — it's consumed by the worker
    expect(out).not.toContain("file_v2_abc");
  });
});
