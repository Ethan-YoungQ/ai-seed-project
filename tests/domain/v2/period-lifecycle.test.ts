import { describe, expect, test, vi } from "vitest";

import {
  openNewPeriod,
  openWindow,
  closeGraduation,
  type PeriodLifecycleDeps,
  type PeriodRecord,
  type WindowRecord
} from "../../../src/domain/v2/period-lifecycle.js";
import { NoActiveWindowError } from "../../../src/domain/v2/errors.js";

function makeDeps(initial: {
  periods: PeriodRecord[];
  windows: WindowRecord[];
  campId: string;
}): PeriodLifecycleDeps {
  const periods = [...initial.periods];
  const windows = [...initial.windows];

  return {
    getActiveCampId: vi.fn().mockReturnValue(initial.campId),
    findWindowByCode: vi.fn().mockImplementation(async (campId: string, code: string) => {
      return windows.find((w) => w.campId === campId && w.code === code) ?? null;
    }),
    insertWindow: vi.fn().mockImplementation(async (rec: WindowRecord) => {
      windows.push(rec);
    }),
    findCurrentActivePeriod: vi
      .fn()
      .mockImplementation(async (campId: string): Promise<PeriodRecord | null> => {
        return (
          periods
            .filter((p) => p.campId === campId && p.endedAt === null)
            .sort((a, b) => b.number - a.number)[0] ?? null
        );
      }),
    updatePeriodEndedAt: vi
      .fn()
      .mockImplementation(async (id: string, endedAt: string, reason: string) => {
        const p = periods.find((r) => r.id === id);
        if (p) {
          p.endedAt = endedAt;
          p.closedReason = reason;
        }
      }),
    insertPeriod: vi
      .fn()
      .mockImplementation(async (rec: PeriodRecord) => {
        periods.push(rec);
      }),
    findNextActiveWindow: vi
      .fn()
      .mockImplementation(async (campId: string): Promise<WindowRecord | null> => {
        return (
          windows
            .filter(
              (w) =>
                w.campId === campId &&
                w.settlementState === "open" &&
                (w.firstPeriodId === null || w.lastPeriodId === null)
            )
            .sort((a, b) => a.code.localeCompare(b.code))[0] ?? null
        );
      }),
    updateWindowSlot: vi
      .fn()
      .mockImplementation(
        async (id: string, slot: "first" | "last", periodId: string) => {
          const w = windows.find((r) => r.id === id);
          if (!w) return;
          if (slot === "first") w.firstPeriodId = periodId;
          else w.lastPeriodId = periodId;
        }
      ),
    findWindowByLastPeriod: vi
      .fn()
      .mockImplementation(async (periodId: string): Promise<WindowRecord | null> => {
        return (
          windows.find(
            (w) => w.lastPeriodId === periodId && w.settlementState === "open"
          ) ?? null
        );
      }),
    findPeriodByNumber: vi
      .fn()
      .mockImplementation(async (campId: string, number: number) => {
        return (
          periods.find((p) => p.campId === campId && p.number === number) ?? null
        );
      }),
    findFinalWindow: vi
      .fn()
      .mockImplementation(async (campId: string): Promise<WindowRecord | null> => {
        return (
          windows.find(
            (w) =>
              w.campId === campId &&
              w.isFinal &&
              w.settlementState === "open"
          ) ?? null
        );
      }),
    now: () => "2026-04-10T00:00:00Z",
    __internal: { periods, windows }
  } as unknown as PeriodLifecycleDeps;
}

describe("period-lifecycle: openWindow", () => {
  test("creates a new W3 shell when absent", async () => {
    const deps = makeDeps({ periods: [], windows: [], campId: "c1" });
    const result = await openWindow("W3", "c1", deps);
    expect(result.ok).toBe(true);
    expect(result.windowId).toBe("window-c1-w3");
    expect(deps.insertWindow).toHaveBeenCalledOnce();
  });

  test("idempotent when same code already exists", async () => {
    const deps = makeDeps({
      periods: [],
      windows: [
        {
          id: "window-c1-w3",
          campId: "c1",
          code: "W3",
          firstPeriodId: null,
          lastPeriodId: null,
          isFinal: false,
          settlementState: "open",
          settledAt: null,
          createdAt: "2026-04-01"
        }
      ],
      campId: "c1"
    });
    const result = await openWindow("W3", "c1", deps);
    expect(result.ok).toBe(true);
    expect(result.alreadyExists).toBe(true);
    expect(deps.insertWindow).not.toHaveBeenCalled();
  });

  test("FINAL window is marked isFinal=true", async () => {
    const deps = makeDeps({ periods: [], windows: [], campId: "c1" });
    const result = await openWindow("FINAL", "c1", deps);
    expect(result.ok).toBe(true);
    const internal = (deps as unknown as { __internal: { windows: WindowRecord[] } }).__internal;
    expect(internal.windows[0].isFinal).toBe(true);
  });
});

describe("period-lifecycle: openNewPeriod", () => {
  test("creates ice-breaker period 1 without binding to any window", async () => {
    const deps = makeDeps({
      periods: [],
      windows: [
        {
          id: "window-c1-w1",
          campId: "c1",
          code: "W1",
          firstPeriodId: null,
          lastPeriodId: null,
          isFinal: false,
          settlementState: "open",
          settledAt: null,
          createdAt: "2026-04-01"
        }
      ],
      campId: "c1"
    });
    const result = await openNewPeriod(1, deps);
    expect(result.period.number).toBe(1);
    expect(result.period.isIceBreaker).toBe(true);
    expect(result.assignedWindowId).toBeNull();
    expect(result.shouldSettleWindowId).toBeNull();
    expect(deps.updateWindowSlot).not.toHaveBeenCalled();
  });

  test("binds period 2 to W1.firstPeriodId", async () => {
    const deps = makeDeps({
      periods: [
        {
          id: "period-c1-1",
          campId: "c1",
          number: 1,
          isIceBreaker: true,
          startedAt: "2026-04-01",
          endedAt: null,
          openedByOpId: null,
          closedReason: null,
          createdAt: "2026-04-01",
          updatedAt: "2026-04-01"
        }
      ],
      windows: [
        {
          id: "window-c1-w1",
          campId: "c1",
          code: "W1",
          firstPeriodId: null,
          lastPeriodId: null,
          isFinal: false,
          settlementState: "open",
          settledAt: null,
          createdAt: "2026-04-01"
        }
      ],
      campId: "c1"
    });
    const result = await openNewPeriod(2, deps);
    expect(result.assignedWindowId).toBe("window-c1-w1");
    expect(result.shouldSettleWindowId).toBeNull();
    const internal = (deps as unknown as { __internal: { windows: WindowRecord[] } }).__internal;
    expect(internal.windows[0].firstPeriodId).toBe("period-c1-2");
    expect(internal.windows[0].lastPeriodId).toBeNull();
  });

  test("period 3 binds to W1.lastPeriodId and returns shouldSettleWindowId for W1", async () => {
    const deps = makeDeps({
      periods: [
        {
          id: "period-c1-1",
          campId: "c1",
          number: 1,
          isIceBreaker: true,
          startedAt: "2026-04-01",
          endedAt: "2026-04-05",
          openedByOpId: null,
          closedReason: "next_period_opened",
          createdAt: "2026-04-01",
          updatedAt: "2026-04-01"
        },
        {
          id: "period-c1-2",
          campId: "c1",
          number: 2,
          isIceBreaker: false,
          startedAt: "2026-04-05",
          endedAt: null,
          openedByOpId: null,
          closedReason: null,
          createdAt: "2026-04-05",
          updatedAt: "2026-04-05"
        }
      ],
      windows: [
        {
          id: "window-c1-w1",
          campId: "c1",
          code: "W1",
          firstPeriodId: "period-c1-2",
          lastPeriodId: null,
          isFinal: false,
          settlementState: "open",
          settledAt: null,
          createdAt: "2026-04-01"
        }
      ],
      campId: "c1"
    });
    const result = await openNewPeriod(3, deps);
    expect(result.assignedWindowId).toBe("window-c1-w1");
    expect(result.shouldSettleWindowId).toBe("window-c1-w1");
  });

  test("throws NoActiveWindowError when no open window has a free slot", async () => {
    const deps = makeDeps({
      periods: [
        {
          id: "period-c1-1",
          campId: "c1",
          number: 1,
          isIceBreaker: true,
          startedAt: "2026-04-01",
          endedAt: "2026-04-05",
          openedByOpId: null,
          closedReason: "next_period_opened",
          createdAt: "2026-04-01",
          updatedAt: "2026-04-01"
        }
      ],
      windows: [],
      campId: "c1"
    });
    await expect(openNewPeriod(2, deps)).rejects.toBeInstanceOf(NoActiveWindowError);
  });

  test("closes previous active period before creating the new one", async () => {
    const deps = makeDeps({
      periods: [
        {
          id: "period-c1-2",
          campId: "c1",
          number: 2,
          isIceBreaker: false,
          startedAt: "2026-04-05",
          endedAt: null,
          openedByOpId: null,
          closedReason: null,
          createdAt: "2026-04-05",
          updatedAt: "2026-04-05"
        }
      ],
      windows: [
        {
          id: "window-c1-w1",
          campId: "c1",
          code: "W1",
          firstPeriodId: "period-c1-2",
          lastPeriodId: null,
          isFinal: false,
          settlementState: "open",
          settledAt: null,
          createdAt: "2026-04-01"
        }
      ],
      campId: "c1"
    });
    await openNewPeriod(3, deps);
    expect(deps.updatePeriodEndedAt).toHaveBeenCalledWith(
      "period-c1-2",
      "2026-04-10T00:00:00Z",
      "next_period_opened"
    );
  });
});

describe("period-lifecycle: closeGraduation", () => {
  test("returns shouldSettleWindowId for the FINAL window", async () => {
    const deps = makeDeps({
      periods: [
        {
          id: "period-c1-12",
          campId: "c1",
          number: 12,
          isIceBreaker: false,
          startedAt: "2026-04-01",
          endedAt: null,
          openedByOpId: null,
          closedReason: null,
          createdAt: "2026-04-01",
          updatedAt: "2026-04-01"
        }
      ],
      windows: [
        {
          id: "window-c1-final",
          campId: "c1",
          code: "FINAL",
          firstPeriodId: "period-c1-11",
          lastPeriodId: "period-c1-12",
          isFinal: true,
          settlementState: "open",
          settledAt: null,
          createdAt: "2026-04-01"
        }
      ],
      campId: "c1"
    });
    const result = await closeGraduation(deps);
    expect(result.ok).toBe(true);
    expect(result.shouldSettleWindowId).toBe("window-c1-final");
    expect(deps.updatePeriodEndedAt).toHaveBeenCalledWith(
      "period-c1-12",
      "2026-04-10T00:00:00Z",
      "graduation"
    );
  });

  test("returns ok=false when no FINAL window exists", async () => {
    const deps = makeDeps({ periods: [], windows: [], campId: "c1" });
    const result = await closeGraduation(deps);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("no_final_window");
  });

  test("does not re-close period 12 if already ended", async () => {
    const deps = makeDeps({
      periods: [
        {
          id: "period-c1-12",
          campId: "c1",
          number: 12,
          isIceBreaker: false,
          startedAt: "2026-04-01",
          endedAt: "2026-04-08",
          openedByOpId: null,
          closedReason: "manual_close",
          createdAt: "2026-04-01",
          updatedAt: "2026-04-01"
        }
      ],
      windows: [
        {
          id: "window-c1-final",
          campId: "c1",
          code: "FINAL",
          firstPeriodId: "period-c1-11",
          lastPeriodId: "period-c1-12",
          isFinal: true,
          settlementState: "open",
          settledAt: null,
          createdAt: "2026-04-01"
        }
      ],
      campId: "c1"
    });
    await closeGraduation(deps);
    expect(deps.updatePeriodEndedAt).not.toHaveBeenCalled();
  });
});
