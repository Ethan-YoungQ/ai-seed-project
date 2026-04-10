import { describe, expect, test, beforeEach, vi } from "vitest";

import {
  notifySub2CardPatch,
  type PatchWorkerDeps,
  type StateDelta
} from "../../../../src/services/feishu/cards/patch-worker.js";
import {
  registerTemplate,
  clearTemplateRegistry
} from "../../../../src/services/feishu/cards/renderer.js";
import {
  DAILY_CHECKIN_TEMPLATE_ID,
  buildDailyCheckinCard,
  emptyDailyCheckinState,
  type DailyCheckinState
} from "../../../../src/services/feishu/cards/templates/daily-checkin-v1.js";
import type { LiveCardRow } from "../../../../src/services/feishu/cards/types.js";

// ─── Error fixtures ─────────────────────────────────────────────────────────

const RATE_LIMIT_ERROR = Object.assign(new Error("rate limited"), {
  code: "rate_limited"
});
const EXPIRED_ERROR = Object.assign(new Error("message too old"), {
  code: 230031
});

// ─── Seed data ───────────────────────────────────────────────────────────────

function seedRow(overrides: Partial<LiveCardRow> = {}): LiveCardRow {
  const state = emptyDailyCheckinState({
    periodNumber: 1,
    postedAt: "2026-04-10T09:00:00.000Z",
    periodId: "p-1"
  });
  const base: LiveCardRow = {
    id: "flc-1",
    cardType: "daily_checkin",
    feishuMessageId: "om-seed",
    feishuChatId: "oc-chat",
    campId: "camp-1",
    periodId: "p-1",
    windowId: null,
    cardVersion: DAILY_CHECKIN_TEMPLATE_ID,
    stateJson: state,
    sentAt: "2026-04-10T09:00:00.000Z",
    lastPatchedAt: null,
    expiresAt: "2026-04-24T09:00:00.000Z",
    closedReason: null
  };
  return { ...base, ...overrides };
}

// ─── Fake deps factory ───────────────────────────────────────────────────────

function fakePatchDeps(
  overrides: {
    findActiveResult?: LiveCardRow | null;
    patchCardImpl?: () => Promise<void>;
  } = {}
): PatchWorkerDeps {
  let storedRow: LiveCardRow | null =
    overrides.findActiveResult !== undefined
      ? overrides.findActiveResult
      : seedRow();

  const findActive = vi.fn((_cardType: string, _chatId: string) => storedRow);

  const updateState = vi.fn(
    (id: string, nextState: unknown, _patchedAt: string) => {
      if (storedRow && storedRow.id === id) {
        storedRow = { ...storedRow, stateJson: nextState };
      }
    }
  );

  const close = vi.fn((_id: string, _reason: string) => {
    storedRow = null;
  });

  const patchCard = vi.fn(
    overrides.patchCardImpl ?? (() => Promise.resolve())
  );

  const deadLetterInsert = vi.fn();

  return {
    live: { findActive, updateState, close },
    feishuClient: { patchCard },
    deadLetter: { insert: deadLetterInsert },
    clock: () => new Date("2026-04-10T12:00:00.000Z"),
    sleep: vi.fn(() => Promise.resolve()),
    templateIdFor: (cardType: string) =>
      cardType === "daily_checkin" ? DAILY_CHECKIN_TEMPLATE_ID : null,
    maxAttempts: 3
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("notifySub2CardPatch", () => {
  beforeEach(() => {
    clearTemplateRegistry();
    registerTemplate(DAILY_CHECKIN_TEMPLATE_ID, buildDailyCheckinCard);
  });

  test("happy path patches the card once and updates live row state", async () => {
    const deps = fakePatchDeps();
    const delta: StateDelta<DailyCheckinState> = (prev) => ({
      ...prev,
      items: {
        ...prev.items,
        K3: { pending: ["m-1"], approved: [] }
      }
    });

    const result = await notifySub2CardPatch("daily_checkin", "oc-chat", delta, deps);

    expect(result.status).toBe("patched");
    expect(deps.feishuClient.patchCard).toHaveBeenCalledTimes(1);
    expect(deps.live.updateState).toHaveBeenCalledTimes(1);
    // Verify the next state was correctly applied
    const [calledId, calledState] = (deps.live.updateState as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(calledId).toBe("flc-1");
    expect((calledState as DailyCheckinState).items.K3.pending).toContain("m-1");
  });

  test("missing active row emits needsSend without patching", async () => {
    const deps = fakePatchDeps({ findActiveResult: null });
    const delta: StateDelta<DailyCheckinState> = (prev) => prev;

    const result = await notifySub2CardPatch("daily_checkin", "oc-chat", delta, deps);

    expect(result.status).toBe("needsSend");
    expect(deps.feishuClient.patchCard).not.toHaveBeenCalled();
    expect(deps.live.updateState).not.toHaveBeenCalled();
  });

  test("rate limit error retries with exponential backoff and eventually succeeds", async () => {
    let callCount = 0;
    const deps = fakePatchDeps({
      patchCardImpl: () => {
        callCount++;
        if (callCount < 3) throw RATE_LIMIT_ERROR;
        return Promise.resolve();
      }
    });
    const delta: StateDelta<DailyCheckinState> = (prev) => prev;

    const result = await notifySub2CardPatch("daily_checkin", "oc-chat", delta, deps);

    expect(result.status).toBe("patched");
    expect(deps.feishuClient.patchCard).toHaveBeenCalledTimes(3);
    // Sleep called twice (after attempt 1 and attempt 2)
    expect(deps.sleep).toHaveBeenCalledTimes(2);
    // Exponential backoff: 100ms × 4^0 = 100ms, 100ms × 4^1 = 400ms
    const sleepCalls = (deps.sleep as ReturnType<typeof vi.fn>).mock.calls;
    expect(sleepCalls[0][0]).toBe(100);
    expect(sleepCalls[1][0]).toBe(400);
  });

  test("3 rate-limit failures write to dead letter and return failed", async () => {
    const deps = fakePatchDeps({
      patchCardImpl: () => { throw RATE_LIMIT_ERROR; }
    });
    const delta: StateDelta<DailyCheckinState> = (prev) => prev;

    const result = await notifySub2CardPatch("daily_checkin", "oc-chat", delta, deps);

    expect(result.status).toBe("failed");
    expect(deps.feishuClient.patchCard).toHaveBeenCalledTimes(3);
    expect(deps.deadLetter.insert).toHaveBeenCalledTimes(1);
    expect(deps.live.updateState).not.toHaveBeenCalled();
  });

  test("230031 error closes old row and returns needsSend without retry", async () => {
    const deps = fakePatchDeps({
      patchCardImpl: () => { throw EXPIRED_ERROR; }
    });
    const delta: StateDelta<DailyCheckinState> = (prev) => prev;

    const result = await notifySub2CardPatch("daily_checkin", "oc-chat", delta, deps);

    expect(result.status).toBe("needsSend");
    expect(deps.feishuClient.patchCard).toHaveBeenCalledTimes(1);
    expect(deps.live.close).toHaveBeenCalledWith("flc-1", "expired");
    expect(deps.live.updateState).not.toHaveBeenCalled();
    expect(deps.deadLetter.insert).not.toHaveBeenCalled();
  });

  test("unknown error falls through to dead letter after maxAttempts", async () => {
    const unknownError = new Error("network timeout");
    const deps = fakePatchDeps({
      patchCardImpl: () => { throw unknownError; }
    });
    const delta: StateDelta<DailyCheckinState> = (prev) => prev;

    const result = await notifySub2CardPatch("daily_checkin", "oc-chat", delta, deps);

    expect(result.status).toBe("failed");
    expect(deps.feishuClient.patchCard).toHaveBeenCalledTimes(3);
    expect(deps.deadLetter.insert).toHaveBeenCalledTimes(1);
  });

  test("delta function receiving the current state is called exactly once", async () => {
    const deps = fakePatchDeps();
    const delta = vi.fn((prev: DailyCheckinState) => prev);

    await notifySub2CardPatch("daily_checkin", "oc-chat", delta, deps);

    expect(delta).toHaveBeenCalledTimes(1);
    // Verify it was called with the current state from the live row
    const calledWith = delta.mock.calls[0][0] as DailyCheckinState;
    expect(calledWith).toMatchObject({ periodId: "p-1", periodNumber: 1 });
  });
});
