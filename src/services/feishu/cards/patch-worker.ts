/**
 * Async patch worker for server-initiated Feishu card updates.
 *
 * `notifySub2CardPatch` is the single entry point:
 * - Looks up the active live card for the given cardType + chatId
 * - Applies a state delta function to derive the next state
 * - Renders the new card and calls feishuClient.patchCard
 * - Retries up to maxAttempts times with exponential backoff on rate-limit errors
 * - On 230031 (expired) error, closes the old row and returns needsSend
 * - On repeated failures, writes a dead-letter record and returns failed
 */

import type { CardType, CardActionContext, FeishuCardJson, LiveCardRow } from "./types.js";
import { renderCard } from "./renderer.js";

// ============================================================================
// Public Types
// ============================================================================

/** A pure function that derives the next state from the current state */
export type StateDelta<TState> = (prev: TState) => TState;

/** Repository interface required by the patch worker */
export interface PatchWorkerLiveRepo {
  findActive(cardType: CardType, chatId: string): LiveCardRow | null;
  updateState(id: string, nextState: unknown, patchedAt: string): void;
  close(id: string, reason: "expired" | "period_closed" | "replaced_by_new"): void;
}

/** Dead-letter storage interface */
export interface PatchWorkerDeadLetter {
  insert(record: DeadLetterRecord): void;
}

/** A record written when all patch attempts fail */
export interface DeadLetterRecord {
  cardType: string;
  chatId: string;
  messageId: string;
  rowId: string;
  error: string;
  failedAt: string;
}

/** All dependencies injected into the patch worker */
export interface PatchWorkerDeps {
  live: PatchWorkerLiveRepo;
  feishuClient: {
    patchCard(messageId: string, cardJson: FeishuCardJson): Promise<void>;
  };
  deadLetter: PatchWorkerDeadLetter;
  clock: () => Date;
  sleep: (ms: number) => Promise<void>;
  /** Returns the template ID for the given card type, or null if unknown */
  templateIdFor: (cardType: string) => string | null;
  maxAttempts: number;
}

/** Discriminated union result from notifySub2CardPatch */
export type PatchWorkerResult =
  | { status: "patched"; rowId: string }
  | { status: "needsSend"; closedRowId: string | null }
  | { status: "failed"; rowId: string; error: string };

// ============================================================================
// Error Detection Helpers
// ============================================================================

function errCode(err: unknown): unknown {
  if (err !== null && typeof err === "object" && "code" in err) {
    return (err as Record<string, unknown>).code;
  }
  return undefined;
}

function isRateLimited(err: unknown): boolean {
  const code = errCode(err);
  return (
    code === "rate_limited" ||
    code === "too_many_request" ||
    code === 429
  );
}

function isExpired(err: unknown): boolean {
  return errCode(err) === 230031;
}

// ============================================================================
// Fake CardActionContext for rendering
// ============================================================================

function buildFakeCtx(messageId: string, chatId: string, clock: () => Date): CardActionContext {
  return {
    operatorOpenId: "system",
    triggerId: "patch-worker",
    actionName: "server_patch",
    actionPayload: {},
    messageId,
    chatId,
    receivedAt: clock().toISOString(),
    currentVersion: "patch-worker-v1"
  };
}

// ============================================================================
// Main Entry Point
// ============================================================================

/**
 * Notifies subscribers by patching a live Feishu card with a new state.
 *
 * @param cardType - The type of card to patch
 * @param chatId   - The Feishu chat ID where the card lives
 * @param delta    - A pure function that derives the next state from the current state
 * @param deps     - All external dependencies
 * @returns        - Result discriminated union: patched | needsSend | failed
 */
export async function notifySub2CardPatch<TState>(
  cardType: CardType,
  chatId: string,
  delta: StateDelta<TState>,
  deps: PatchWorkerDeps
): Promise<PatchWorkerResult> {
  // Step 1: Look up the active live card
  const row = deps.live.findActive(cardType, chatId);
  if (!row) {
    return { status: "needsSend", closedRowId: null };
  }

  // Step 2: Look up the template ID
  const templateId = deps.templateIdFor(cardType);
  if (!templateId) {
    return {
      status: "failed",
      rowId: row.id,
      error: `No template registered for card type: ${cardType}`
    };
  }

  // Step 3: Apply delta to get the next state
  const currentState = row.stateJson as TState;
  const nextState = delta(currentState);

  // Step 4: Render the new card
  const fakeCtx = buildFakeCtx(row.feishuMessageId, chatId, deps.clock);
  const cardJson = renderCard(templateId, nextState, fakeCtx);

  // Step 5: Attempt patchCard with retry logic
  let lastError: unknown;

  for (let attempt = 1; attempt <= deps.maxAttempts; attempt++) {
    try {
      await deps.feishuClient.patchCard(row.feishuMessageId, cardJson);

      // Step 6: On success, update the live row state
      deps.live.updateState(row.id, nextState, deps.clock().toISOString());
      return { status: "patched", rowId: row.id };
    } catch (err: unknown) {
      lastError = err;

      // Step 7: On 230031 (expired), close old row and signal needsSend — no retry
      if (isExpired(err)) {
        deps.live.close(row.id, "expired");
        return { status: "needsSend", closedRowId: row.id };
      }

      // Step 8: On rate-limit, sleep with exponential backoff and retry
      if (isRateLimited(err)) {
        if (attempt < deps.maxAttempts) {
          const backoffMs = 100 * Math.pow(4, attempt - 1);
          await deps.sleep(backoffMs);
          continue;
        }
        // Exhausted retries on rate-limit — fall through to dead-letter
      } else {
        // Unknown error — retry without backoff sleep (still consumes an attempt)
        if (attempt < deps.maxAttempts) {
          continue;
        }
        // Exhausted retries — fall through to dead-letter
      }
    }
  }

  // Step 9: All attempts failed — write dead-letter and return failed
  const errorMessage =
    lastError instanceof Error ? lastError.message : String(lastError);

  deps.deadLetter.insert({
    cardType,
    chatId,
    messageId: row.feishuMessageId,
    rowId: row.id,
    error: errorMessage,
    failedAt: deps.clock().toISOString()
  });

  return { status: "failed", rowId: row.id, error: errorMessage };
}
