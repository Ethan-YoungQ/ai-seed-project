import { describe, expect, test, vi } from "vitest";

import { ScoringAggregator } from "../../../src/domain/v2/aggregator.js";
import type { AggregatorDeps } from "../../../src/domain/v2/aggregator.js";

interface StoredEvent {
  id: string;
  memberId: string;
  periodId: string;
  itemCode: string;
  dimension: "K" | "H" | "C" | "S" | "G";
  scoreDelta: number;
  status: "pending" | "approved" | "rejected" | "review_required";
  reviewNote: string | null;
  decidedAt: string | null;
  reviewedByOpId: string | null;
}

const OPERATOR = { id: "op-1", openId: "ou-op-1" };

function makeDeps(initial: StoredEvent): {
  deps: AggregatorDeps;
  state: { event: StoredEvent; increments: number; decrements: number };
} {
  const state = {
    event: { ...initial },
    increments: 0,
    decrements: 0,
  };
  const deps: AggregatorDeps = {
    findEventById: vi.fn((id: string) =>
      state.event.id === id ? { ...state.event } : null
    ),
    updateEventStatus: vi.fn(
      (input: {
        id: string;
        status: StoredEvent["status"];
        decidedAt: string;
        reviewNote: string | null;
        reviewedByOpId: string | null;
      }) => {
        if (state.event.id !== input.id) return;
        state.event = {
          ...state.event,
          status: input.status,
          reviewNote: input.reviewNote,
          decidedAt: input.decidedAt,
          reviewedByOpId: input.reviewedByOpId,
        };
      }
    ),
    incrementMemberDimensionScore: vi.fn(
      (_memberId: string, _periodId: string, _dim: string, delta: number) => {
        state.increments += delta;
      }
    ),
    decrementMemberDimensionScore: vi.fn(
      (_memberId: string, _periodId: string, _dim: string, delta: number) => {
        state.decrements += delta;
      }
    ),
    runInTransaction: vi.fn((fn: () => unknown) => fn()) as unknown as AggregatorDeps["runInTransaction"],
    now: () => "2026-04-10T00:00:00.000Z",
  };
  return { deps, state };
}

function baseEvent(overrides: Partial<StoredEvent> = {}): StoredEvent {
  return {
    id: "evt-1",
    memberId: "member-1",
    periodId: "period-1",
    itemCode: "K3",
    dimension: "K",
    scoreDelta: 3,
    status: "review_required",
    reviewNote: null,
    decidedAt: null,
    reviewedByOpId: null,
    ...overrides,
  };
}

describe("ScoringAggregator.applyDecision", () => {
  test("review_required -> approved increments dimension score", () => {
    const { deps, state } = makeDeps(baseEvent());
    const agg = new ScoringAggregator(deps);
    const result = agg.applyDecision(
      "evt-1",
      { decision: "approved" },
      OPERATOR
    );
    expect(state.event.status).toBe("approved");
    expect(state.increments).toBe(3);
    expect(state.decrements).toBe(0);
    expect(result).toEqual({
      eventId: "evt-1",
      previousStatus: "review_required",
      newStatus: "approved",
      memberId: "member-1",
      itemCode: "K3",
      scoreDelta: 3,
    });
  });

  test("review_required -> rejected does not touch dimension scores", () => {
    const { deps, state } = makeDeps(baseEvent());
    const agg = new ScoringAggregator(deps);
    const result = agg.applyDecision(
      "evt-1",
      { decision: "rejected", note: "per_period_cap_exceeded" },
      OPERATOR
    );
    expect(state.event.status).toBe("rejected");
    expect(state.event.reviewNote).toBe("per_period_cap_exceeded");
    expect(state.increments).toBe(0);
    expect(state.decrements).toBe(0);
    expect(result.newStatus).toBe("rejected");
  });

  test("review_required -> approved with note records the note", () => {
    const { deps, state } = makeDeps(baseEvent());
    const agg = new ScoringAggregator(deps);
    agg.applyDecision(
      "evt-1",
      { decision: "approved", note: "operator override" },
      OPERATOR
    );
    expect(state.event.status).toBe("approved");
    expect(state.event.reviewNote).toBe("operator override");
    expect(state.increments).toBe(3);
  });

  test("records operator id via updateEventStatus", () => {
    const { deps, state } = makeDeps(baseEvent());
    const agg = new ScoringAggregator(deps);
    agg.applyDecision(
      "evt-1",
      { decision: "approved" },
      OPERATOR
    );
    expect(state.event.reviewedByOpId).toBe("op-1");
    expect(deps.updateEventStatus).toHaveBeenCalledWith({
      id: "evt-1",
      status: "approved",
      decidedAt: "2026-04-10T00:00:00.000Z",
      reviewNote: null,
      reviewedByOpId: "op-1",
    });
  });

  test("throws when event id is not found", () => {
    const { deps } = makeDeps(baseEvent());
    const agg = new ScoringAggregator(deps);
    expect(() =>
      agg.applyDecision(
        "missing",
        { decision: "approved" },
        OPERATOR
      )
    ).toThrow(/not found/i);
  });

  test("throws when event status is not review_required", () => {
    const { deps } = makeDeps(baseEvent({ status: "pending" }));
    const agg = new ScoringAggregator(deps);
    expect(() =>
      agg.applyDecision(
        "evt-1",
        { decision: "approved" },
        OPERATOR
      )
    ).toThrow(/review_required/i);
  });

  test("throws when event status is approved (already decided)", () => {
    const { deps } = makeDeps(baseEvent({ status: "approved" }));
    const agg = new ScoringAggregator(deps);
    expect(() =>
      agg.applyDecision(
        "evt-1",
        { decision: "approved" },
        OPERATOR
      )
    ).toThrow(/review_required/i);
  });

  test("wraps work inside runInTransaction", () => {
    const { deps } = makeDeps(baseEvent());
    const agg = new ScoringAggregator(deps);
    agg.applyDecision(
      "evt-1",
      { decision: "approved" },
      OPERATOR
    );
    expect(deps.runInTransaction).toHaveBeenCalledTimes(1);
  });

  test("returns correct result shape for rejected decision", () => {
    const { deps } = makeDeps(
      baseEvent({ scoreDelta: 5, itemCode: "H2", dimension: "H" })
    );
    const agg = new ScoringAggregator(deps);
    const result = agg.applyDecision(
      "evt-1",
      { decision: "rejected", note: "spam" },
      { id: "op-2", openId: "ou-op-2" }
    );
    expect(result).toEqual({
      eventId: "evt-1",
      previousStatus: "review_required",
      newStatus: "rejected",
      memberId: "member-1",
      itemCode: "H2",
      scoreDelta: 5,
    });
  });
});
