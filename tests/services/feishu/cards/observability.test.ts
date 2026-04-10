import { beforeEach, describe, expect, test } from "vitest";

import {
  getMetrics,
  incrementMetric,
  resetMetrics
} from "../../../../src/services/feishu/cards/observability.js";

describe("observability counters", () => {
  beforeEach(() => {
    resetMetrics();
  });

  test("initial metrics are all zero", () => {
    const m = getMetrics();
    expect(m.cardActionsReceived).toBe(0);
    expect(m.cardActionsSucceeded).toBe(0);
    expect(m.cardActionsFailed).toBe(0);
    expect(m.patchesSent).toBe(0);
    expect(m.patchesFailed).toBe(0);
    expect(m.deadLettersCreated).toBe(0);
    expect(m.expiryScansRun).toBe(0);
    expect(m.cardsExpired).toBe(0);
  });

  test("incrementMetric updates the correct counter", () => {
    incrementMetric("cardActionsReceived");
    incrementMetric("cardActionsReceived");
    incrementMetric("cardActionsSucceeded");
    incrementMetric("patchesSent", 3);

    const m = getMetrics();
    expect(m.cardActionsReceived).toBe(2);
    expect(m.cardActionsSucceeded).toBe(1);
    expect(m.patchesSent).toBe(3);
    // Others unchanged
    expect(m.cardActionsFailed).toBe(0);
  });

  test("getMetrics returns a frozen (readonly) copy", () => {
    const m = getMetrics();
    expect(Object.isFrozen(m)).toBe(true);
    // Mutation should not affect internal state
    expect(() => {
      (m as Record<string, number>).cardActionsReceived = 999;
    }).toThrow();
    expect(getMetrics().cardActionsReceived).toBe(0);
  });

  test("resetMetrics clears all counters", () => {
    incrementMetric("cardActionsReceived", 5);
    incrementMetric("patchesFailed", 2);
    incrementMetric("cardsExpired", 10);

    resetMetrics();

    const m = getMetrics();
    expect(m.cardActionsReceived).toBe(0);
    expect(m.patchesFailed).toBe(0);
    expect(m.cardsExpired).toBe(0);
  });
});
