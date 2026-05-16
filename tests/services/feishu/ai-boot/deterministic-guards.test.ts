import { describe, expect, it } from "vitest";

import {
  runDeterministicGuards,
  type GuardContext,
} from "../../../../src/services/feishu/ai-boot/deterministic-guards";
import type { EvidenceBundle } from "../../../../src/services/feishu/ai-boot/content-extractor";

function evidence(overrides: Partial<EvidenceBundle> = {}): EvidenceBundle {
  return {
    sanitizedText: "这里是具体复盘和改进方案",
    urls: [],
    attachments: [],
    documentText: "",
    extractionStatus: "not_applicable",
    extractionReason: "",
    contentHash: "hash-1",
    ...overrides,
  };
}

function context(overrides: Partial<GuardContext> = {}): GuardContext {
  return {
    roleType: "student",
    isParticipant: true,
    isExcludedFromBoard: false,
    mentionedBot: false,
    dailyParticipationAlreadyScored: false,
    categoryCapRemaining: null,
    duplicateApprovedContent: false,
    ...overrides,
  };
}

describe("runDeterministicGuards", () => {
  it("ignores operator messages before student auto-scoring", () => {
    expect(runDeterministicGuards(evidence(), context({ roleType: "operator" }))).toEqual({
      kind: "ignore",
      reason: "non_student_role",
    });
  });

  it("ignores trainer messages before student auto-scoring", () => {
    expect(runDeterministicGuards(evidence(), context({ roleType: "trainer" }))).toEqual({
      kind: "ignore",
      reason: "non_student_role",
    });
  });

  it("ignores excluded or non-participant users before scoring", () => {
    expect(runDeterministicGuards(evidence(), context({ isParticipant: false }))).toEqual({
      kind: "ignore",
      reason: "not_participant",
    });

    expect(runDeterministicGuards(evidence(), context({ isExcludedFromBoard: true }))).toEqual({
      kind: "ignore",
      reason: "excluded_from_board",
    });
  });

  it("treats @Bot text as chat and does not auto-score it", () => {
    expect(runDeterministicGuards(evidence({ sanitizedText: "@Bot 这个怎么提交？" }), context({ mentionedBot: true }))).toEqual({
      kind: "ignore",
      reason: "mentioned_bot",
    });
  });

  it("gives pure thanks OK or emoji only daily participation when the daily cap is open", () => {
    for (const sanitizedText of ["谢谢", "OK", "👍"]) {
      expect(runDeterministicGuards(evidence({ sanitizedText }), context())).toEqual({
        kind: "daily_participation",
        reason: "trivial_chat",
      });
    }
  });

  it("ignores pure thanks OK or emoji when daily participation was already scored", () => {
    for (const sanitizedText of ["感谢", "ok", "😊"]) {
      expect(runDeterministicGuards(
        evidence({ sanitizedText }),
        context({ dailyParticipationAlreadyScored: true }),
      )).toEqual({
        kind: "ignore",
        reason: "trivial_chat_daily_cap_used",
      });
    }
  });

  it("returns no-score for a pure link with no explanatory text", () => {
    expect(runDeterministicGuards(
      evidence({
        sanitizedText: "https://example.com/resource",
        urls: ["https://example.com/resource"],
      }),
      context(),
    )).toEqual({
      kind: "no_score",
      reason: "pure_link_without_reason",
    });
  });

  it("ignores repeated content with an existing approved score", () => {
    expect(runDeterministicGuards(evidence(), context({
      duplicateApprovedContent: true,
      duplicateContent: true,
    }))).toEqual({
      kind: "ignore",
      reason: "duplicate_approved_content",
    });
  });

  it("requires review for repeated content without an existing approved score", () => {
    expect(runDeterministicGuards(evidence(), context({ duplicateContent: true }))).toEqual({
      kind: "review_required",
      reason: "duplicate_content",
    });
  });

  it("returns no-score when the category cap is reached", () => {
    expect(runDeterministicGuards(evidence(), context({ categoryCapRemaining: 0 }))).toEqual({
      kind: "no_score",
      reason: "category_cap_reached",
    });
  });

  it("continues for substantive student evidence when no deterministic guard applies", () => {
    expect(runDeterministicGuards(evidence(), context())).toEqual({ kind: "continue" });
  });
});
