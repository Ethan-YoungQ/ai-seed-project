import {
  SCORING_ITEMS,
  type ScoringDimension,
  type ScoringItemCode,
  type ScoringSourceType
} from "./scoring-items-config.js";
import { isEligibleStudent, type EligibilityInput } from "./eligibility.js";
import { renderPrompt, type LlmScorableItemCode } from "./llm-prompts.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type IngestResult =
  | {
      accepted: true;
      eventId: string;
      effectiveDelta: number;
      enqueuedLlmTaskId: string | null;
    }
  | {
      accepted: false;
      reason:
        | "not_eligible"
        | "no_active_period"
        | "ice_breaker_no_scoring"
        | "cap_exceeded"
        | "duplicate";
    };

export interface IngestInput {
  memberId: string;
  itemCode: ScoringItemCode;
  scoreDelta: number;
  sourceRef: string;
  sourceType?: ScoringSourceType;
  /** Simple text payload (convenience shorthand). */
  payloadText?: string;
  /**
   * Structured payload for multimodal items.  When present, takes
   * precedence over `payloadText` for extracting the text body.
   * Stored verbatim as JSON in `v2_scoring_item_events.payload_json`.
   */
  payload?: Record<string, unknown>;
}

export interface IngestorPeriod {
  id: string;
  campId: string;
  number: number;
  isIceBreaker: boolean;
  endedAt: string | null;
}

export interface IngestorEventInsert {
  memberId: string;
  periodId: string;
  itemCode: ScoringItemCode;
  dimension: ScoringDimension;
  scoreDelta: number;
  sourceType: ScoringSourceType;
  sourceRef: string;
  status: "pending" | "approved" | "rejected";
  reviewNote: string | null;
  payloadJson: string | null;
  createdAt: string;
}

export interface IngestorLlmTaskInsert {
  eventId: string;
  provider: string;
  model: string;
  promptText: string;
  enqueuedAt: string;
}

export interface IngestorDeps {
  findMemberById(id: string): (EligibilityInput & { id: string }) | null;
  findActivePeriod(): IngestorPeriod | null;
  sumApprovedScoreDelta(
    memberId: string,
    periodId: string,
    itemCode: ScoringItemCode
  ): number;
  sumPendingScoreDelta(
    memberId: string,
    periodId: string,
    itemCode: ScoringItemCode
  ): number;
  findEventBySourceRef(
    memberId: string,
    periodId: string,
    itemCode: ScoringItemCode,
    sourceRef: string
  ): { id: string } | null;
  insertScoringEvent(row: IngestorEventInsert): string;
  incrementMemberDimensionScore(
    memberId: string,
    periodId: string,
    dimension: ScoringDimension,
    delta: number
  ): void;
  insertLlmScoringTask(row: IngestorLlmTaskInsert): string;
  linkEventToLlmTask(eventId: string, taskId: string): void;
  runInTransaction<T>(fn: () => T): T;
  now(): string;
  generateId(): string;
  provider: string;
  model: string;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class EventIngestor {
  constructor(private readonly deps: IngestorDeps) {}

  ingest(input: IngestInput): IngestResult {
    return this.deps.runInTransaction(() => this.runPipeline(input));
  }

  // -------------------------------------------------------------------------
  // 10-step pipeline
  // -------------------------------------------------------------------------

  private runPipeline(input: IngestInput): IngestResult {
    // Step 1: Resolve scoring item config
    const config = SCORING_ITEMS[input.itemCode];
    if (!config) {
      throw new Error(`unknown scoring item code: ${input.itemCode}`);
    }

    // Step 2: Eligibility check
    const member = this.deps.findMemberById(input.memberId);
    if (!isEligibleStudent(member)) {
      return { accepted: false, reason: "not_eligible" };
    }

    // Step 3: Active period check
    const period = this.deps.findActivePeriod();
    if (!period) {
      return { accepted: false, reason: "no_active_period" };
    }
    if (period.isIceBreaker) {
      return { accepted: false, reason: "ice_breaker_no_scoring" };
    }

    // Step 4: Cap lookup (approved + pending)
    const approvedSum = this.deps.sumApprovedScoreDelta(
      input.memberId,
      period.id,
      input.itemCode
    );
    const pendingSum = this.deps.sumPendingScoreDelta(
      input.memberId,
      period.id,
      input.itemCode
    );
    const remaining = config.perPeriodCap - approvedSum - pendingSum;

    if (remaining <= 0) {
      // Insert a rejected row for audit trail
      this.deps.insertScoringEvent({
        memberId: input.memberId,
        periodId: period.id,
        itemCode: input.itemCode,
        dimension: config.dimension,
        scoreDelta: 0,
        sourceType: input.sourceType ?? config.sourceType,
        sourceRef: input.sourceRef,
        status: "rejected",
        reviewNote: "per_period_cap_exceeded",
        payloadJson: this.buildPayloadJson(input),
        createdAt: this.deps.now()
      });
      return { accepted: false, reason: "cap_exceeded" };
    }

    // Step 5: Clamp effective delta
    const effectiveDelta = Math.min(input.scoreDelta, remaining);

    // Step 6: Idempotency — reject duplicate sourceRef
    const duplicate = this.deps.findEventBySourceRef(
      input.memberId,
      period.id,
      input.itemCode,
      input.sourceRef
    );
    if (duplicate) {
      return { accepted: false, reason: "duplicate" };
    }

    // Step 7: Determine status
    const needsLlm = config.needsLlm;
    const status: "pending" | "approved" = needsLlm ? "pending" : "approved";

    // Step 8: Insert scoring event
    const eventId = this.deps.insertScoringEvent({
      memberId: input.memberId,
      periodId: period.id,
      itemCode: input.itemCode,
      dimension: config.dimension,
      scoreDelta: effectiveDelta,
      sourceType: input.sourceType ?? config.sourceType,
      sourceRef: input.sourceRef,
      status,
      reviewNote: null,
      payloadJson: this.buildPayloadJson(input),
      createdAt: this.deps.now()
    });

    let enqueuedLlmTaskId: string | null = null;

    if (needsLlm) {
      // Step 9a: For LLM items — enqueue llm_scoring_tasks
      // PRE-FIX DEVIATION: pass fileKey through for multimodal H2
      const text = this.resolvePayloadText(input);
      const fileKey = this.resolvePayloadFileKey(input);

      const promptText = renderPrompt(input.itemCode as LlmScorableItemCode, {
        text,
        fileKey
      });

      enqueuedLlmTaskId = this.deps.insertLlmScoringTask({
        eventId,
        provider: this.deps.provider,
        model: this.deps.model,
        promptText,
        enqueuedAt: this.deps.now()
      });
      this.deps.linkEventToLlmTask(eventId, enqueuedLlmTaskId);
    } else {
      // Step 9b: For non-LLM items — sync-increment dimension score
      this.deps.incrementMemberDimensionScore(
        input.memberId,
        period.id,
        config.dimension,
        effectiveDelta
      );
    }

    // Step 10: Return result
    return { accepted: true, eventId, effectiveDelta, enqueuedLlmTaskId };
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  /**
   * Resolve the text body from either `payload.text` or `payloadText`,
   * preferring the structured `payload` when both are provided.
   */
  private resolvePayloadText(input: IngestInput): string {
    if (input.payload && typeof input.payload.text === "string") {
      return input.payload.text;
    }
    return input.payloadText ?? "";
  }

  /**
   * Resolve the fileKey from the structured `payload`, if present.
   * Used for multimodal items (H2) so the LLM worker can download
   * the image via Feishu IM scope.
   */
  private resolvePayloadFileKey(input: IngestInput): string | undefined {
    if (input.payload && typeof input.payload.fileKey === "string") {
      return input.payload.fileKey;
    }
    return undefined;
  }

  /**
   * Build the JSON string to store in `v2_scoring_item_events.payload_json`.
   * Stores the structured `payload` if present, otherwise wraps `payloadText`
   * in a `{ text }` envelope for consistency.
   */
  private buildPayloadJson(input: IngestInput): string | null {
    if (input.payload) {
      return JSON.stringify(input.payload);
    }
    if (input.payloadText) {
      return JSON.stringify({ text: input.payloadText });
    }
    return null;
  }
}
