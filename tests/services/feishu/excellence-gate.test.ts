import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  evaluateExcellence,
  checkPraiseRateLimit,
  createPraiseRateState,
  type PraiseRateState,
  type SemanticScoreItem,
} from "../../../src/services/feishu/chat-bot/excellence-gate";

function items(scores: Array<[string, number]>): SemanticScoreItem[] {
  return scores.map(([code, score]) => ({
    code: code as SemanticScoreItem["code"],
    score,
    reason: "test",
  }));
}

describe("evaluateExcellence", () => {
  it("returns none for score < 3", () => {
    const result = evaluateExcellence(items([["K3", 2]]));
    expect(result.shouldPraise).toBe(false);
    expect(result.level).toBe("none");
  });

  it("returns nice for score 3-5", () => {
    const result = evaluateExcellence(items([["K3", 3], ["C1", 1]]) );
    expect(result.shouldPraise).toBe(true);
    expect(result.level).toBe("nice");
    expect(result.totalScore).toBe(4);
  });

  it("returns great for score 6-9", () => {
    const result = evaluateExcellence(items([["C1", 4], ["G1", 3]]) );
    expect(result.shouldPraise).toBe(true);
    expect(result.level).toBe("great");
  });

  it("returns outstanding for score 10+", () => {
    const result = evaluateExcellence(items([["C1", 4], ["C3", 5], ["G1", 3]]) );
    expect(result.shouldPraise).toBe(true);
    expect(result.level).toBe("outstanding");
    expect(result.totalScore).toBe(12);
  });

  it("collects unique highlight codes", () => {
    const result = evaluateExcellence(items([["K3", 3], ["K3", 2], ["C1", 4]]) );
    expect(result.highlights).toEqual(["K3", "C1"]);
  });
});

describe("checkPraiseRateLimit", () => {
  let state: PraiseRateState;
  let now: number;

  beforeEach(() => {
    state = createPraiseRateState();
    now = Date.now();
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows first praise", () => {
    expect(checkPraiseRateLimit(state, "student-1").allowed).toBe(true);
  });

  it("blocks when student daily cap reached", () => {
    // Exhaust student quota (advance time between calls to bypass cooldown)
    checkPraiseRateLimit(state, "student-1");
    vi.advanceTimersByTime(121_000);
    checkPraiseRateLimit(state, "student-1");
    vi.advanceTimersByTime(121_000);
    checkPraiseRateLimit(state, "student-1");
    vi.advanceTimersByTime(121_000);
    // 4th attempt should fail
    expect(checkPraiseRateLimit(state, "student-1")).toEqual({
      allowed: false,
      reason: "student_daily_cap",
    });
  });

  it("blocks when chat hourly cap reached", () => {
    for (let i = 0; i < 5; i++) {
      checkPraiseRateLimit(state, `student-${i}`);
      vi.advanceTimersByTime(121_000); // bypass cooldown
    }
    expect(checkPraiseRateLimit(state, "student-6")).toEqual({
      allowed: false,
      reason: "chat_hourly_cap",
    });
  });

  it("blocks during cooldown period", () => {
    checkPraiseRateLimit(state, "student-1"); // succeeds
    // Immediate second attempt should fail on cooldown
    expect(checkPraiseRateLimit(state, "student-2").allowed).toBe(false);
  });

  it("allows after cooldown expires", () => {
    checkPraiseRateLimit(state, "student-1");
    // Advance past cooldown
    vi.advanceTimersByTime(121_000);
    expect(checkPraiseRateLimit(state, "student-2").allowed).toBe(true);
  });
});
