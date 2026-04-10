import type { ScoringDimension } from "./scoring-items-config.js";

export type ScoringEventStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "review_required";

export type FinalDecision = "approved" | "rejected";

export interface AggregatorEvent {
  id: string;
  memberId: string;
  periodId: string;
  itemCode: string;
  dimension: ScoringDimension;
  scoreDelta: number;
  status: ScoringEventStatus;
  reviewNote: string | null;
  decidedAt: string | null;
}

export interface AggregatorDeps {
  findEventById(id: string): AggregatorEvent | null;
  updateEventStatus(input: {
    id: string;
    status: ScoringEventStatus;
    decidedAt: string;
    reviewNote: string | null;
    reviewedByOpId: string | null;
  }): void;
  incrementMemberDimensionScore(
    memberId: string,
    periodId: string,
    dimension: ScoringDimension,
    delta: number
  ): void;
  decrementMemberDimensionScore(
    memberId: string,
    periodId: string,
    dimension: ScoringDimension,
    delta: number
  ): void;
  runInTransaction<T>(fn: () => T): T;
  now(): string;
}

export interface ApplyDecisionResult {
  eventId: string;
  previousStatus: "review_required";
  newStatus: "approved" | "rejected";
  memberId: string;
  itemCode: string;
  scoreDelta: number;
}

export class ScoringAggregator {
  constructor(private readonly deps: AggregatorDeps) {}

  applyDecision(
    eventId: string,
    input: { decision: "approved" | "rejected"; note?: string },
    operator: { id: string; openId: string }
  ): ApplyDecisionResult {
    return this.deps.runInTransaction(() => {
      const event = this.deps.findEventById(eventId);
      if (!event) {
        throw new Error(`scoring event not found: ${eventId}`);
      }
      if (event.status !== "review_required") {
        throw new Error(
          `applyDecision requires status review_required, got: ${event.status}`
        );
      }

      this.deps.updateEventStatus({
        id: eventId,
        status: input.decision,
        decidedAt: this.deps.now(),
        reviewNote: input.note ?? null,
        reviewedByOpId: operator.id,
      });

      if (input.decision === "approved") {
        this.deps.incrementMemberDimensionScore(
          event.memberId,
          event.periodId,
          event.dimension,
          event.scoreDelta
        );
      }

      return {
        eventId,
        previousStatus: "review_required" as const,
        newStatus: input.decision,
        memberId: event.memberId,
        itemCode: event.itemCode,
        scoreDelta: event.scoreDelta,
      };
    });
  }
}
