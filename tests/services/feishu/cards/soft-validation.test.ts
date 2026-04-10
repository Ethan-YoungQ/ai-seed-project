import { describe, expect, test } from "vitest";

import {
  validateLlmSubmission,
  validateG2Submission,
  validateH2Submission,
  stripEmojiAndSpace
} from "../../../../src/services/feishu/cards/soft-validation.js";

describe("soft validation", () => {
  describe("validateLlmSubmission (K3/K4/C1/C3/G2 text path)", () => {
    test("accepts text >= 20 chars with real content", () => {
      const r = validateLlmSubmission({
        text: "今天用 ChatGPT 做了一段翻译,效果比 DeepL 好很多"
      });
      expect(r.ok).toBe(true);
    });

    test("rejects text shorter than 20 characters", () => {
      const r = validateLlmSubmission({ text: "还可以" });
      expect(r).toEqual({ ok: false, reason: "text_too_short" });
    });

    test("rejects whitespace-only text", () => {
      const r = validateLlmSubmission({ text: "                    " });
      expect(r).toEqual({ ok: false, reason: "text_too_short" });
    });

    test("rejects pure-emoji text even if long", () => {
      const r = validateLlmSubmission({
        text: "😀😁😂😃😄😅😆😇😈😉😊😋😌😍😎😏😐😑😒😓"
      });
      expect(r).toEqual({ ok: false, reason: "text_too_short" });
    });
  });

  describe("validateG2Submission (课外好资源)", () => {
    test("passes with a proper http URL + rationale", () => {
      const r = validateG2Submission({
        text: "推荐文章 https://example.com/ai-guide 讲解 Claude 使用非常清晰"
      });
      expect(r.ok).toBe(true);
    });

    test("rejects when no URL present", () => {
      const r = validateG2Submission({ text: "我觉得 AI 很有用,大家去看那个文档吧挺好的" });
      expect(r).toEqual({ ok: false, reason: "missing_url" });
    });

    test("rejects short-text even if URL present", () => {
      const r = validateG2Submission({ text: "https://x.co" });
      expect(r).toEqual({ ok: false, reason: "text_too_short" });
    });
  });

  describe("validateH2Submission (实操截图+描述)", () => {
    test("passes with sufficient text + non-empty file_key", () => {
      const r = validateH2Submission({
        text: "用 Claude 写了一段 python 代码处理 csv 效果很好",
        fileKey: "file_v2_xyz"
      });
      expect(r.ok).toBe(true);
    });

    test("rejects when file_key is empty", () => {
      const r = validateH2Submission({
        text: "用 Claude 写了一段 python 代码处理 csv 效果很好",
        fileKey: ""
      });
      expect(r).toEqual({ ok: false, reason: "missing_file_key" });
    });

    test("rejects when text too short even if file_key present", () => {
      const r = validateH2Submission({ text: "好用", fileKey: "file_v2_xyz" });
      expect(r).toEqual({ ok: false, reason: "text_too_short" });
    });
  });

  describe("stripEmojiAndSpace helper", () => {
    test("removes common emoji and whitespace", () => {
      expect(stripEmojiAndSpace(" 😀 hello 🤖 world ")).toBe("helloworld");
    });

    test("returns empty for only emojis", () => {
      expect(stripEmojiAndSpace("🤖🤖🤖")).toBe("");
    });
  });
});
