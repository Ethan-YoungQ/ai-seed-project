import { describe, expect, test } from "vitest";

import {
  normalizeDecision,
  noScoreDecision,
  parseScoringDecision
} from "../../../src/domain/v3/scoring-decision.js";

describe("v3 scoring decision schema", () => {
  test("clamps ai_artifact decisions to 3-5", () => {
    expect(
      parseScoringDecision({
        status: "approved",
        category: "ai_artifact",
        scoreDelta: 9,
        confidence: "high",
        notifyPolicy: "group_praise",
        reason: "Built a useful AI artifact.",
        evidence: "Shared a working prototype.",
        badges: []
      }).scoreDelta
    ).toBe(5);

    expect(
      parseScoringDecision({
        status: "approved",
        category: "ai_artifact",
        scoreDelta: 1,
        confidence: "medium",
        notifyPolicy: "personal_reply",
        reason: "Artifact is valid but modest.",
        evidence: "Shared a short workflow.",
        badges: ["artifact"]
      }).scoreDelta
    ).toBe(3);
  });

  test("rejects unknown category", () => {
    expect(() =>
      parseScoringDecision({
        status: "approved",
        category: "random",
        scoreDelta: 5,
        confidence: "high",
        notifyPolicy: "group_praise",
        reason: "Unknown category should not pass.",
        evidence: "category=random",
        badges: []
      })
    ).toThrow();
  });

  test("rejects blank reason and evidence without trimming non-blank values", () => {
    const validDecision = {
      status: "approved",
      category: "ai_artifact",
      scoreDelta: 5,
      confidence: "high",
      notifyPolicy: "group_praise",
      reason: "  Preserved reason spacing.  ",
      evidence: "\nPreserved evidence spacing.\n",
      badges: []
    };

    expect(parseScoringDecision(validDecision)).toMatchObject({
      reason: "  Preserved reason spacing.  ",
      evidence: "\nPreserved evidence spacing.\n"
    });

    expect(() =>
      parseScoringDecision({ ...validDecision, reason: "" })
    ).toThrow();
    expect(() =>
      parseScoringDecision({ ...validDecision, reason: "   \n\t" })
    ).toThrow();
    expect(() =>
      parseScoringDecision({ ...validDecision, evidence: "" })
    ).toThrow();
    expect(() =>
      parseScoringDecision({ ...validDecision, evidence: "   \n\t" })
    ).toThrow();
  });

  test("rejects numeric string scoreDelta values", () => {
    expect(() =>
      parseScoringDecision({
        status: "approved",
        category: "ai_artifact",
        scoreDelta: "5",
        confidence: "high",
        notifyPolicy: "group_praise",
        reason: "Numeric strings should fail loudly.",
        evidence: "scoreDelta was emitted as a string.",
        badges: []
      })
    ).toThrow();
  });

  test("normalizeDecision rejects numeric string scoreDelta values", () => {
    expect(() =>
      normalizeDecision({
        status: "approved",
        category: "ai_artifact",
        scoreDelta: "5",
        confidence: "high",
        notifyPolicy: "group_praise",
        reason: "Numeric strings should fail loudly.",
        evidence: "scoreDelta was passed through normalizeDecision.",
        badges: []
      } as unknown)
    ).toThrow();
  });

  test("rounds fractional scoreDelta values before clamping", () => {
    expect(
      parseScoringDecision({
        status: "approved",
        category: "prompt_or_method",
        scoreDelta: 4.4,
        confidence: "medium",
        notifyPolicy: "personal_reply",
        reason: "Fraction should round down.",
        evidence: "scoreDelta=4.4",
        badges: []
      }).scoreDelta
    ).toBe(4);

    expect(
      parseScoringDecision({
        status: "approved",
        category: "prompt_or_method",
        scoreDelta: 4.5,
        confidence: "medium",
        notifyPolicy: "personal_reply",
        reason: "Fraction should round up.",
        evidence: "scoreDelta=4.5",
        badges: []
      }).scoreDelta
    ).toBe(5);

    expect(
      parseScoringDecision({
        status: "approved",
        category: "ai_artifact",
        scoreDelta: 2.5,
        confidence: "medium",
        notifyPolicy: "personal_reply",
        reason: "Rounded result should still respect category minimum.",
        evidence: "scoreDelta=2.5",
        badges: []
      }).scoreDelta
    ).toBe(3);
  });

  test("rejects blank badge strings", () => {
    expect(() =>
      parseScoringDecision({
        status: "approved",
        category: "ai_artifact",
        scoreDelta: 5,
        confidence: "high",
        notifyPolicy: "group_praise",
        reason: "Badge text must be auditable.",
        evidence: "Blank badge supplied.",
        badges: ["artifact", "   "]
      })
    ).toThrow();
  });

  test("normalizeDecision rejects blank audit fields and badges", () => {
    const validDecision = {
      status: "approved",
      category: "ai_artifact",
      scoreDelta: 5,
      confidence: "high",
      notifyPolicy: "group_praise",
      reason: "Valid reason.",
      evidence: "Valid evidence.",
      badges: ["artifact"]
    };

    expect(() =>
      normalizeDecision({ ...validDecision, reason: "" } as unknown)
    ).toThrow();
    expect(() =>
      normalizeDecision({ ...validDecision, reason: "  \n\t" } as unknown)
    ).toThrow();
    expect(() =>
      normalizeDecision({ ...validDecision, evidence: "" } as unknown)
    ).toThrow();
    expect(() =>
      normalizeDecision({ ...validDecision, evidence: "  \n\t" } as unknown)
    ).toThrow();
    expect(() =>
      normalizeDecision({ ...validDecision, badges: ["artifact", " "] } as unknown)
    ).toThrow();
  });

  test("dedupes badges in order and caps them to 5", () => {
    const decision = parseScoringDecision({
      status: "approved",
      category: "ai_artifact",
      scoreDelta: 5,
      confidence: "high",
      notifyPolicy: "group_praise",
      reason: "Badge list should be compact.",
      evidence: "Duplicate and excess badges supplied.",
      badges: [
        "artifact",
        "builder",
        "artifact",
        "share",
        "practice",
        "helper",
        "extra"
      ]
    });

    expect(decision.badges).toEqual([
      "artifact",
      "builder",
      "share",
      "practice",
      "helper"
    ]);
  });

  test("forces daily_participation decisions to score 1", () => {
    const decision = parseScoringDecision({
      status: "approved",
      category: "daily_participation",
      scoreDelta: 99,
      confidence: "high",
      notifyPolicy: "personal_reply",
      reason: "Participated today.",
      evidence: "Sent a valid check-in.",
      badges: []
    });

    expect(decision.scoreDelta).toBe(1);
  });

  test("normalizeDecision accepts valid already-typed decisions", () => {
    const decision = normalizeDecision({
      status: "approved",
      category: "ai_artifact",
      scoreDelta: 9,
      confidence: "high",
      notifyPolicy: "group_praise",
      reason: "Already typed decision.",
      evidence: "Score should still clamp.",
      badges: ["artifact"]
    });

    expect(decision).toMatchObject({
      category: "ai_artifact",
      scoreDelta: 5,
      reason: "Already typed decision.",
      evidence: "Score should still clamp.",
      badges: ["artifact"]
    });
  });

  test("forces no_score decisions to score 0 and notify silent", () => {
    const decision = parseScoringDecision({
      status: "no_score",
      category: "prompt_or_method",
      scoreDelta: 6,
      confidence: "low",
      notifyPolicy: "group_praise",
      reason: "Message did not qualify for points.",
      evidence: "Only reacted with an emoji.",
      badges: ["ignored"]
    });

    expect(decision).toMatchObject({
      scoreDelta: 0,
      notifyPolicy: "silent",
      reason: "Message did not qualify for points.",
      evidence: "Only reacted with an emoji.",
      confidence: "low",
      category: "prompt_or_method",
      badges: ["ignored"]
    });
  });

  test("forces rejected decisions to score 0 and notify silent", () => {
    const decision = parseScoringDecision({
      status: "rejected",
      category: "ai_artifact",
      scoreDelta: 5,
      confidence: "medium",
      notifyPolicy: "group_praise",
      reason: "Rejected by policy.",
      evidence: "Duplicate submission.",
      badges: ["duplicate"]
    });

    expect(decision.scoreDelta).toBe(0);
    expect(decision.notifyPolicy).toBe("silent");
  });

  test("review-required decisions preserve reason and evidence", () => {
    const reason = "Needs operator review before awarding points.";
    const evidence = "  Multiline evidence is preserved.\nDo not trim audit text.  ";

    const decision = parseScoringDecision({
      status: "review_required",
      category: "formal_task",
      scoreDelta: 12,
      confidence: "low",
      notifyPolicy: "daily_digest",
      reason,
      evidence,
      badges: ["review"]
    });

    expect(decision.reason).toBe(reason);
    expect(decision.evidence).toBe(evidence);
    expect(decision.scoreDelta).toBe(10);
  });

  test("noScoreDecision returns a normalized no-score decision", () => {
    expect(noScoreDecision("Not score-bearing.", "FYI message.")).toEqual({
      status: "no_score",
      category: "daily_participation",
      scoreDelta: 0,
      confidence: "low",
      notifyPolicy: "silent",
      reason: "Not score-bearing.",
      evidence: "FYI message.",
      badges: []
    });
  });

  test("noScoreDecision rejects blank reason and evidence", () => {
    expect(() => noScoreDecision("", "Evidence.")).toThrow();
    expect(() => noScoreDecision("   ", "Evidence.")).toThrow();
    expect(() => noScoreDecision("Reason.", "")).toThrow();
    expect(() => noScoreDecision("Reason.", " \n\t ")).toThrow();
  });
});
