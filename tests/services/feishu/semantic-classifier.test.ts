import { describe, expect, it } from "vitest";
import {
  buildUnifiedPrompt,
  filterScorableItems,
  LLM_SCORABLE_ITEMS,
  needsSemanticScoring,
} from "../../../src/services/feishu/semantic-classifier";
import type { NormalizedFeishuMessage } from "../../../src/services/feishu/normalize-message";

function makeMsg(overrides: Partial<NormalizedFeishuMessage> = {}): NormalizedFeishuMessage {
  return {
    messageId: "msg-001",
    memberId: "user-001",
    chatId: "chat-001",
    chatType: "group",
    senderType: "user",
    messageType: "text",
    eventTime: "1775210400000",
    rawText: "",
    parsedTags: [],
    attachmentCount: 0,
    attachmentTypes: [],
    documentText: "",
    documentParseStatus: "not_applicable" as const,
    eventUrl: "",
    mentionedBotIds: [],
    cleanedText: "",
    ...overrides,
  };
}

// ============================================================================
// LLM_SCORABLE_ITEMS — which items go through LLM
// ============================================================================

describe("LLM_SCORABLE_ITEMS", () => {
  it("includes C1, C3, G1, G2, H2, H3, K3, K4, S1", () => {
    const expected = ["C1", "C3", "G1", "G2", "H2", "H3", "K3", "K4", "S1"];
    expect([...LLM_SCORABLE_ITEMS].sort()).toEqual(expected.sort());
  });

  it("does NOT include C2, S2, G3 (independent pipelines)", () => {
    expect(LLM_SCORABLE_ITEMS).not.toContain("C2");
    expect(LLM_SCORABLE_ITEMS).not.toContain("S2");
    expect(LLM_SCORABLE_ITEMS).not.toContain("G3");
  });

  it("does NOT include K1, K2, H1 (fast-path items)", () => {
    expect(LLM_SCORABLE_ITEMS).not.toContain("K1");
    expect(LLM_SCORABLE_ITEMS).not.toContain("K2");
    expect(LLM_SCORABLE_ITEMS).not.toContain("H1");
  });
});

// ============================================================================
// buildUnifiedPrompt — prompt construction
// ============================================================================

describe("buildUnifiedPrompt", () => {
  it("includes the message text in the prompt", () => {
    const text = "今天我学到了很多关于 RAG 的知识，分享一下心得";
    const prompt = buildUnifiedPrompt(text);
    expect(prompt).toContain(text);
    expect(prompt).toContain("RAG");
  });

  it("includes all 9 scoring item codes in the prompt", () => {
    const prompt = buildUnifiedPrompt("test message");
    for (const code of ["K3", "K4", "C1", "C3", "H2", "H3", "G1", "G2", "S1"]) {
      expect(prompt).toContain(code);
    }
  });

  it("includes the JSON output format instruction", () => {
    const prompt = buildUnifiedPrompt("test");
    expect(prompt).toContain('"items"');
    expect(prompt).toContain("JSON");
  });

  it("sanitizes special characters in the message text", () => {
    const prompt = buildUnifiedPrompt('test "quotes" and \n newlines');
    expect(prompt).toContain('test "quotes"');
  });
});

// ============================================================================
// filterScorableItems — post-processing LLM response
// ============================================================================

describe("filterScorableItems", () => {
  it("passes through valid items unchanged", () => {
    const items = [
      { code: "K3", score: 3, reason: "good summary" },
      { code: "C1", score: 4, reason: "creative" },
    ];
    const result = filterScorableItems(items);
    expect(result).toEqual(items);
  });

  it("filters out items with score <= 0", () => {
    const items = [
      { code: "K3", score: 3, reason: "good" },
      { code: "C1", score: 0, reason: "meh" },
      { code: "G1", score: -1, reason: "bad" },
    ];
    const result = filterScorableItems(items);
    expect(result).toHaveLength(1);
    expect(result[0].code).toBe("K3");
  });

  it("filters out items not in LLM_SCORABLE_ITEMS", () => {
    const items = [
      { code: "K3", score: 3, reason: "good" },
      { code: "C2", score: 1, reason: "reaction" }, // C2 not scorable by LLM
      { code: "K1", score: 1, reason: "checkin" },  // K1 not scorable by LLM
    ];
    const result = filterScorableItems(items);
    expect(result).toHaveLength(1);
    expect(result[0].code).toBe("K3");
  });

  it("clamps scores to per-item config max", () => {
    const items = [
      { code: "K3", score: 10, reason: "overscored" }, // max is 3
      { code: "C3", score: 20, reason: "way too high" }, // max is 5
    ];
    const result = filterScorableItems(items);
    expect(result).toHaveLength(2);
    expect(result.find((i) => i.code === "K3")!.score).toBe(3);
    expect(result.find((i) => i.code === "C3")!.score).toBe(5);
  });

  it("returns empty array for empty input", () => {
    expect(filterScorableItems([])).toEqual([]);
  });
});

// ============================================================================
// needsSemanticScoring — preFilter
// ============================================================================

describe("needsSemanticScoring", () => {
  it("returns false for messages shorter than 10 chars", () => {
    expect(needsSemanticScoring(makeMsg({ rawText: "hi" }))).toBe(false);
    expect(needsSemanticScoring(makeMsg({ rawText: "好的" }))).toBe(false);
  });

  it("returns false for reaction synthetic messages", () => {
    expect(needsSemanticScoring(makeMsg({ rawText: "[表情回应: heart]" }))).toBe(false);
    expect(needsSemanticScoring(makeMsg({ rawText: "[表情回应: thumbsup]" }))).toBe(false);
  });

  it("returns true for normal text messages >= 10 chars", () => {
    expect(needsSemanticScoring(makeMsg({ rawText: "今天学到了不少东西分享一下" }))).toBe(true);
  });

  it("returns true for image messages regardless of text length", () => {
    expect(needsSemanticScoring(makeMsg({ messageType: "image", rawText: "一张图" }))).toBe(true);
  });

  it("returns true for file messages regardless of text length", () => {
    expect(needsSemanticScoring(makeMsg({ messageType: "file", rawText: "作业" }))).toBe(true);
  });

  it("returns false for empty text", () => {
    expect(needsSemanticScoring(makeMsg({ rawText: "" }))).toBe(false);
  });
});
