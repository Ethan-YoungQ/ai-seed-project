import { beforeEach, describe, expect, test, vi } from "vitest";

import {
  createOnLlmDecision,
  type OnLlmDecisionInput,
  type LlmDecisionHookDeps
} from "../../../../src/services/feishu/cards/notify-hooks.js";
import type { PatchWorkerDeps } from "../../../../src/services/feishu/cards/patch-worker.js";
import type { LiveCardRow } from "../../../../src/services/feishu/cards/types.js";
import {
  emptyDailyCheckinState,
  type DailyCheckinState
} from "../../../../src/services/feishu/cards/templates/daily-checkin-v1.js";
import {
  registerTemplate,
  clearTemplateRegistry
} from "../../../../src/services/feishu/cards/renderer.js";
import {
  DAILY_CHECKIN_TEMPLATE_ID,
  buildDailyCheckinCard
} from "../../../../src/services/feishu/cards/templates/daily-checkin-v1.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeState(overrides: Partial<DailyCheckinState> = {}): DailyCheckinState {
  return {
    ...emptyDailyCheckinState({
      periodNumber: 1,
      postedAt: "2026-04-10T09:00:00.000Z",
      periodId: "p-1"
    }),
    ...overrides
  };
}

function makeLiveRow(stateJson: DailyCheckinState): LiveCardRow {
  return {
    id: "flc-1",
    cardType: "daily_checkin",
    feishuMessageId: "om-1",
    feishuChatId: "oc-group",
    campId: "camp-1",
    periodId: "p-1",
    windowId: null,
    cardVersion: DAILY_CHECKIN_TEMPLATE_ID,
    stateJson,
    sentAt: "2026-04-10T09:00:00.000Z",
    lastPatchedAt: null,
    expiresAt: "2026-04-24T09:00:00.000Z",
    closedReason: null
  };
}

function makePatcher(liveRow: LiveCardRow | null): PatchWorkerDeps {
  let stored: LiveCardRow | null = liveRow;
  return {
    live: {
      findActive: vi.fn(() => stored),
      updateState: vi.fn((id, nextState) => {
        if (stored && stored.id === id) {
          stored = { ...stored, stateJson: nextState };
        }
      }),
      close: vi.fn()
    },
    feishuClient: { patchCard: vi.fn(() => Promise.resolve()) },
    deadLetter: { insert: vi.fn() },
    clock: () => new Date("2026-04-10T12:00:00.000Z"),
    sleep: vi.fn(() => Promise.resolve()),
    templateIdFor: (ct) => (ct === "daily_checkin" ? DAILY_CHECKIN_TEMPLATE_ID : null),
    maxAttempts: 1
  };
}

function makeDeps(liveRow: LiveCardRow | null): LlmDecisionHookDeps & {
  sendDecisionDm: ReturnType<typeof vi.fn>;
  patcher: PatchWorkerDeps;
} {
  const patcher = makePatcher(liveRow);
  const sendDecisionDm = vi.fn(() => Promise.resolve());
  return {
    config: { groupChatId: "oc-group" },
    patcher,
    sendDecisionDm
  };
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  clearTemplateRegistry();
  registerTemplate(DAILY_CHECKIN_TEMPLATE_ID, buildDailyCheckinCard);
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("createOnLlmDecision", () => {
  test("approved decision moves memberId from pending to approved in daily-checkin card", async () => {
    const initialState = makeState({
      items: {
        K3: { pending: ["m-alice"], approved: [] },
        K4: { pending: [], approved: [] },
        H2: { pending: [], approved: [] },
        C1: { pending: [], approved: [] },
        C3: { pending: [], approved: [] },
        G2: { pending: [], approved: [] }
      }
    });
    const liveRow = makeLiveRow(initialState);
    const deps = makeDeps(liveRow);

    const input: OnLlmDecisionInput = {
      memberId: "m-alice",
      itemCode: "K3",
      eventId: "evt-1",
      decision: "approved",
      score: 3,
      reason: "Great summary"
    };

    const onLlmDecision = createOnLlmDecision(deps);
    await onLlmDecision(input);

    // patchCard should have been called (card was updated)
    expect(deps.patcher.feishuClient.patchCard).toHaveBeenCalledOnce();

    // The state passed to updateState should have m-alice in approved, not pending
    const updateCalls = (deps.patcher.live.updateState as ReturnType<typeof vi.fn>).mock.calls;
    expect(updateCalls).toHaveLength(1);
    const nextState = updateCalls[0][1] as DailyCheckinState;
    expect(nextState.items.K3.approved).toContain("m-alice");
    expect(nextState.items.K3.pending).not.toContain("m-alice");

    // DM should always be sent
    expect(deps.sendDecisionDm).toHaveBeenCalledOnce();
    expect(deps.sendDecisionDm).toHaveBeenCalledWith(input);
  });

  test("rejected decision removes memberId from pending in daily-checkin card", async () => {
    const initialState = makeState({
      items: {
        K3: { pending: [], approved: [] },
        K4: { pending: ["m-bob"], approved: [] },
        H2: { pending: [], approved: [] },
        C1: { pending: [], approved: [] },
        C3: { pending: [], approved: [] },
        G2: { pending: [], approved: [] }
      }
    });
    const liveRow = makeLiveRow(initialState);
    const deps = makeDeps(liveRow);

    const input: OnLlmDecisionInput = {
      memberId: "m-bob",
      itemCode: "K4",
      eventId: "evt-2",
      decision: "rejected",
      score: 0,
      reason: "Too short"
    };

    const onLlmDecision = createOnLlmDecision(deps);
    await onLlmDecision(input);

    const updateCalls = (deps.patcher.live.updateState as ReturnType<typeof vi.fn>).mock.calls;
    expect(updateCalls).toHaveLength(1);
    const nextState = updateCalls[0][1] as DailyCheckinState;
    expect(nextState.items.K4.pending).not.toContain("m-bob");
    expect(nextState.items.K4.approved).not.toContain("m-bob");

    expect(deps.sendDecisionDm).toHaveBeenCalledOnce();
  });

  test("missing live card still sends DM without patching", async () => {
    const deps = makeDeps(null); // no live card

    const input: OnLlmDecisionInput = {
      memberId: "m-charlie",
      itemCode: "C1",
      eventId: "evt-3",
      decision: "approved",
      score: 2,
      reason: "Good"
    };

    const onLlmDecision = createOnLlmDecision(deps);
    await onLlmDecision(input);

    // No patchCard call since there's no live card
    expect(deps.patcher.feishuClient.patchCard).not.toHaveBeenCalled();

    // DM should still be sent
    expect(deps.sendDecisionDm).toHaveBeenCalledOnce();
    expect(deps.sendDecisionDm).toHaveBeenCalledWith(input);
  });

  test("non-daily-checkin item skips patch but still sends DM", async () => {
    const initialState = makeState();
    const liveRow = makeLiveRow(initialState);
    const deps = makeDeps(liveRow);

    const input: OnLlmDecisionInput = {
      memberId: "m-dave",
      itemCode: "H1", // not a daily-checkin item
      eventId: "evt-4",
      decision: "approved",
      score: 5,
      reason: "Excellent"
    };

    const onLlmDecision = createOnLlmDecision(deps);
    await onLlmDecision(input);

    // No patch for non-daily-checkin items
    expect(deps.patcher.feishuClient.patchCard).not.toHaveBeenCalled();
    expect(deps.patcher.live.updateState).not.toHaveBeenCalled();

    // DM always sent
    expect(deps.sendDecisionDm).toHaveBeenCalledOnce();
    expect(deps.sendDecisionDm).toHaveBeenCalledWith(input);
  });
});
