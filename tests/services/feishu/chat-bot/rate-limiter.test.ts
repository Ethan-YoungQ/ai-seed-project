import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { createRateLimiter } from "../../../../src/services/feishu/chat-bot/rate-limiter";

describe("RateLimiter", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("allows first request", () => {
    const rl = createRateLimiter();
    const decision = rl.check("u1", "chat1");
    expect(decision.allowed).toBe(true);
  });

  it("blocks second request within 30 seconds (user cooldown)", () => {
    const rl = createRateLimiter();
    rl.markUsed("u1", "chat1");
    const decision = rl.check("u1", "chat1");
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("user_cooldown");
    expect(decision.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("allows request after 30 seconds", () => {
    const rl = createRateLimiter();
    rl.markUsed("u1", "chat1");
    vi.advanceTimersByTime(31_000);
    const decision = rl.check("u1", "chat1");
    expect(decision.allowed).toBe(true);
  });

  it("blocks after 20 requests within an hour (user hourly)", () => {
    const rl = createRateLimiter();
    for (let i = 0; i < 20; i++) {
      rl.markUsed("u1", "chat1");
      vi.advanceTimersByTime(31_000);
    }
    const decision = rl.check("u1", "chat1");
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("user_hourly");
  });

  it("allows requests from different users independently", () => {
    const rl = createRateLimiter();
    rl.markUsed("u1", "chat1");
    const decision = rl.check("u2", "chat1");
    expect(decision.allowed).toBe(true);
  });

  it("blocks when chat exceeds 30 requests per minute", () => {
    const rl = createRateLimiter();
    for (let i = 0; i < 30; i++) {
      rl.markUsed(`user-${i}`, "chat1");
    }
    const decision = rl.check("user-30", "chat1");
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("chat_per_minute");
  });

  it("resets chat-per-minute window after 60 seconds", () => {
    const rl = createRateLimiter();
    for (let i = 0; i < 30; i++) {
      rl.markUsed(`user-${i}`, "chat1");
    }
    vi.advanceTimersByTime(61_000);
    const decision = rl.check("user-new", "chat1");
    expect(decision.allowed).toBe(true);
  });
});
