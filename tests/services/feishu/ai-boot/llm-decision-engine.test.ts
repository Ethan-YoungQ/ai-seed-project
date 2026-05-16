import { describe, expect, it } from "vitest";

import {
  AI_BOOT_PROMPT_VERSION,
  buildScoringPrompt,
  decideWithLlm,
  type AiBootLlmClient,
} from "../../../../src/services/feishu/ai-boot/llm-decision-engine.js";
import type { EvidenceBundle } from "../../../../src/services/feishu/ai-boot/content-extractor.js";

function evidence(overrides: Partial<EvidenceBundle> = {}): EvidenceBundle {
  return {
    sanitizedText: "我用 AI 做了一个客户拜访复盘表，并总结了三个改进点。",
    urls: ["https://example.com/artifact"],
    attachments: [{ type: "file", fileName: "拜访复盘.xlsx", fileExt: "xlsx" }],
    documentText: "复盘表包含客户问题、AI 建议、下一步行动。",
    extractionStatus: "parsed",
    extractionReason: "existing_document_text",
    contentHash: "hash-1",
    ...overrides,
  };
}

describe("buildScoringPrompt", () => {
  it("contains version, evidence, category definitions, and exact score ranges", () => {
    const prompt = buildScoringPrompt({
      evidence: evidence(),
      memberName: "王静Effie",
    });

    expect(AI_BOOT_PROMPT_VERSION).toBe("2026-05-16-v1");
    expect(prompt).toContain("王静Effie");
    expect(prompt).toContain("我用 AI 做了一个客户拜访复盘表");
    expect(prompt).toContain("AI_BOOT_PROMPT_VERSION: 2026-05-16-v1");
    expect(prompt).toContain("AI_BOOT_RULESET_VERSION");

    expect(prompt).toContain("daily_participation: 1");
    expect(prompt).toContain("ai_artifact: 3-5");
    expect(prompt).toContain("ai_practice_reflection: 3-5");
    expect(prompt).toContain("prompt_or_method: 4-6");
    expect(prompt).toContain("resource_recommendation: 2-3");
    expect(prompt).toContain("peer_help: 2-4");
    expect(prompt).toContain("formal_task: 1-10");
    expect(prompt).toContain("operator_adjustment: -20..20");
  });

  it("states prompt is not required except prompt_or_method and artifact evidence can score without prompt sharing", () => {
    const prompt = buildScoringPrompt({
      evidence: evidence(),
      memberName: "学员",
    });

    expect(prompt).toContain("prompt is not required except prompt_or_method");
    expect(prompt).toContain("prompt 不是必需项，除非分类为 prompt_or_method");
    expect(prompt).toContain("AI image");
    expect(prompt).toContain("AI artifact");
    expect(prompt).toContain("workflow result");
    expect(prompt).toContain("practice reflection");
    expect(prompt).toContain("可以在未分享 prompt 时得分");
  });

  it("defines no-score boundaries and JSON-only ScoringDecision output", () => {
    const prompt = buildScoringPrompt({
      evidence: evidence(),
      memberName: "学员",
    });

    expect(prompt).toContain("pure thanks/OK/emoji");
    expect(prompt).toContain("pure link without reason");
    expect(prompt).toContain("bot/admin chat");
    expect(prompt).toContain("duplicates");
    expect(prompt).toContain("vague claims without evidence");
    expect(prompt).toContain("operational/meta chat");
    expect(prompt).toContain("JSON-only");
    expect(prompt).toContain("No markdown");

    for (const field of [
      "status",
      "category",
      "scoreDelta",
      "confidence",
      "notifyPolicy",
      "reason",
      "evidence",
      "badges",
    ]) {
      expect(prompt).toContain(field);
    }
  });

  it("does not include examples that require sharing prompt for image or artifact scoring", () => {
    const prompt = buildScoringPrompt({
      evidence: evidence(),
      memberName: "学员",
    });

    expect(prompt).not.toMatch(/快分享\s*prompt|share\s+prompt|required\s+prompt/i);
    expect(prompt).not.toMatch(/图片.*分享\s*prompt|海报.*分享\s*prompt|artifact.*share\s+prompt/i);
  });
});

describe("decideWithLlm", () => {
  it("sends a system contract and user scoring prompt then parses the JSON response", async () => {
    const calls: Array<{
      messages: Array<{ role: "system" | "user"; content: string }>;
      options: { timeoutMs: number; temperature?: number; maxTokens?: number };
    }> = [];
    const client: AiBootLlmClient = {
      provider: "test-provider",
      model: "test-model",
      async chat(messages, options) {
        calls.push({ messages, options });
        return JSON.stringify({
          status: "approved",
          category: "ai_artifact",
          scoreDelta: 5,
          confidence: "high",
          notifyPolicy: "group_praise",
          reason: "学员提交了可复用的 AI 产物。",
          evidence: "消息和附件展示了客户拜访复盘表。",
          badges: ["artifact"],
        });
      },
    };

    const decision = await decideWithLlm(client, {
      evidence: evidence(),
      memberName: "王静Effie",
    });

    expect(decision).toMatchObject({
      status: "approved",
      category: "ai_artifact",
      scoreDelta: 5,
      confidence: "high",
      notifyPolicy: "group_praise",
      reason: "学员提交了可复用的 AI 产物。",
      evidence: "消息和附件展示了客户拜访复盘表。",
      badges: ["artifact"],
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.messages).toHaveLength(2);
    expect(calls[0]?.messages[0]).toMatchObject({ role: "system" });
    expect(calls[0]?.messages[0]?.content).toContain("ScoringDecision");
    expect(calls[0]?.messages[1]).toMatchObject({ role: "user" });
    expect(calls[0]?.messages[1]?.content).toContain("JSON-only");
    expect(calls[0]?.options).toEqual({
      timeoutMs: 15000,
      temperature: 0.1,
      maxTokens: 600,
    });
  });
});
