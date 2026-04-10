/**
 * Hook wiring for server-initiated card patches triggered by LLM decisions.
 *
 * `createOnLlmDecision` returns a handler that:
 * 1. If the itemCode is a daily-checkin item (K3/K4/H2/C1/C3/G2), computes a
 *    state delta and calls notifySub2CardPatch on the daily_checkin card.
 * 2. Always calls deps.sendDecisionDm to deliver the individual DM card.
 * 3. Non-daily-checkin items skip the patch but still send the DM.
 */

import {
  notifySub2CardPatch,
  type PatchWorkerDeps
} from "./patch-worker.js";
import type {
  DailyCheckinItemCode,
  DailyCheckinState
} from "./templates/daily-checkin-v1.js";

// ============================================================================
// Public Types
// ============================================================================

export interface OnLlmDecisionInput {
  memberId: string;
  itemCode: string;
  eventId: string;
  decision: "approved" | "rejected";
  score: number;
  reason: string;
}

export interface LlmDecisionHookDeps {
  config: { groupChatId: string };
  patcher: PatchWorkerDeps;
  sendDecisionDm: (input: OnLlmDecisionInput) => Promise<void>;
}

// ============================================================================
// Daily-checkin item code guard
// ============================================================================

const DAILY_CHECKIN_ITEM_CODES = new Set<string>(["K3", "K4", "H2", "C1", "C3", "G2"]);

function isDailyCheckinItem(itemCode: string): itemCode is DailyCheckinItemCode {
  return DAILY_CHECKIN_ITEM_CODES.has(itemCode);
}

// ============================================================================
// State delta builders
// ============================================================================

function buildApprovedDelta(
  memberId: string,
  itemCode: DailyCheckinItemCode
): (prev: DailyCheckinState) => DailyCheckinState {
  return (prev) => {
    const item = prev.items[itemCode];
    return {
      ...prev,
      items: {
        ...prev.items,
        [itemCode]: {
          pending: item.pending.filter((id) => id !== memberId),
          approved: item.approved.includes(memberId)
            ? item.approved
            : [...item.approved, memberId]
        }
      }
    };
  };
}

function buildRejectedDelta(
  memberId: string,
  itemCode: DailyCheckinItemCode
): (prev: DailyCheckinState) => DailyCheckinState {
  return (prev) => {
    const item = prev.items[itemCode];
    return {
      ...prev,
      items: {
        ...prev.items,
        [itemCode]: {
          ...item,
          pending: item.pending.filter((id) => id !== memberId)
        }
      }
    };
  };
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Creates the onLlmDecision hook bound to the given dependencies.
 */
export function createOnLlmDecision(
  deps: LlmDecisionHookDeps
): (input: OnLlmDecisionInput) => Promise<void> {
  return async (input: OnLlmDecisionInput): Promise<void> => {
    const { memberId, itemCode, decision } = input;
    const { config, patcher, sendDecisionDm } = deps;

    // Step 1: Patch the daily-checkin group card if applicable
    if (isDailyCheckinItem(itemCode)) {
      const delta =
        decision === "approved"
          ? buildApprovedDelta(memberId, itemCode)
          : buildRejectedDelta(memberId, itemCode);

      await notifySub2CardPatch<DailyCheckinState>(
        "daily_checkin",
        config.groupChatId,
        delta,
        patcher
      );
    }

    // Step 2: Always deliver the individual DM card
    await sendDecisionDm(input);
  };
}
