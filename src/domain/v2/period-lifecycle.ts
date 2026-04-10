import { NoActiveWindowError } from "./errors.js";

export interface PeriodRecord {
  id: string;
  campId: string;
  number: number;
  isIceBreaker: boolean;
  startedAt: string;
  endedAt: string | null;
  openedByOpId: string | null;
  closedReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WindowRecord {
  id: string;
  campId: string;
  code: string;
  firstPeriodId: string | null;
  lastPeriodId: string | null;
  isFinal: boolean;
  settlementState: "open" | "settling" | "settled";
  settledAt: string | null;
  createdAt: string;
}

export interface PeriodLifecycleDeps {
  getActiveCampId(): string;
  findWindowByCode(campId: string, code: string): Promise<WindowRecord | null>;
  insertWindow(rec: WindowRecord): Promise<void>;
  findCurrentActivePeriod(campId: string): Promise<PeriodRecord | null>;
  updatePeriodEndedAt(
    id: string,
    endedAt: string,
    reason: string
  ): Promise<void>;
  insertPeriod(rec: PeriodRecord): Promise<void>;
  findNextActiveWindow(campId: string): Promise<WindowRecord | null>;
  updateWindowSlot(
    id: string,
    slot: "first" | "last",
    periodId: string
  ): Promise<void>;
  findWindowByLastPeriod(periodId: string): Promise<WindowRecord | null>;
  findPeriodByNumber(
    campId: string,
    number: number
  ): Promise<PeriodRecord | null>;
  findFinalWindow(campId: string): Promise<WindowRecord | null>;
  now(): string;
}

export interface OpenWindowResult {
  ok: boolean;
  alreadyExists: boolean;
  windowId: string;
}

export interface OpenNewPeriodResult {
  period: PeriodRecord;
  assignedWindowId: string | null;
  shouldSettleWindowId: string | null;
}

export interface CloseGraduationResult {
  ok: boolean;
  reason?: "no_final_window";
  shouldSettleWindowId?: string;
}

export async function openWindow(
  code: string,
  campId: string,
  deps: PeriodLifecycleDeps
): Promise<OpenWindowResult> {
  const existing = await deps.findWindowByCode(campId, code);
  if (existing) {
    return { ok: true, alreadyExists: true, windowId: existing.id };
  }
  const windowId = `window-${campId}-${code.toLowerCase()}`;
  await deps.insertWindow({
    id: windowId,
    campId,
    code,
    firstPeriodId: null,
    lastPeriodId: null,
    isFinal: code === "FINAL",
    settlementState: "open",
    settledAt: null,
    createdAt: deps.now()
  });
  return { ok: true, alreadyExists: false, windowId };
}

export async function openNewPeriod(
  number: number,
  deps: PeriodLifecycleDeps
): Promise<OpenNewPeriodResult> {
  const campId = deps.getActiveCampId();
  const prevPeriod = await deps.findCurrentActivePeriod(campId);
  if (prevPeriod && prevPeriod.endedAt === null) {
    await deps.updatePeriodEndedAt(prevPeriod.id, deps.now(), "next_period_opened");
  }

  const isIceBreaker = number === 1;
  const newPeriod: PeriodRecord = {
    id: `period-${campId}-${number}`,
    campId,
    number,
    isIceBreaker,
    startedAt: deps.now(),
    endedAt: null,
    openedByOpId: null,
    closedReason: null,
    createdAt: deps.now(),
    updatedAt: deps.now()
  };
  await deps.insertPeriod(newPeriod);

  if (isIceBreaker) {
    return {
      period: newPeriod,
      assignedWindowId: null,
      shouldSettleWindowId: null
    };
  }

  const activeWindow = await deps.findNextActiveWindow(campId);
  if (!activeWindow) {
    throw new NoActiveWindowError();
  }

  const slot: "first" | "last" =
    activeWindow.firstPeriodId === null ? "first" : "last";
  await deps.updateWindowSlot(activeWindow.id, slot, newPeriod.id);

  const shouldSettleWindowId: string | null =
    slot === "last" ? activeWindow.id : null;

  return {
    period: newPeriod,
    assignedWindowId: activeWindow.id,
    shouldSettleWindowId
  };
}

export async function closeGraduation(
  deps: PeriodLifecycleDeps
): Promise<CloseGraduationResult> {
  const campId = deps.getActiveCampId();
  const finalWindow = await deps.findFinalWindow(campId);
  if (!finalWindow) {
    return { ok: false, reason: "no_final_window" };
  }
  const activePeriod = await deps.findCurrentActivePeriod(campId);
  if (activePeriod && activePeriod.endedAt === null) {
    await deps.updatePeriodEndedAt(activePeriod.id, deps.now(), "graduation");
  }
  return { ok: true, shouldSettleWindowId: finalWindow.id };
}
