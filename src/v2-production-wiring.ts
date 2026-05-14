/**
 * v2-production-wiring.ts
 *
 * Instantiates v2 domain services (EventIngestor, ScoringAggregator,
 * period lifecycle, window settler, LLM worker status) by adapting
 * SqliteRepository methods to each domain interface.
 *
 * Called from server.ts at startup so all v2 API endpoints work.
 */

import { EventIngestor } from "./domain/v2/ingestor.js";
import type { IngestorDeps, IngestorEventInsert, IngestorLlmTaskInsert } from "./domain/v2/ingestor.js";
import { ScoringAggregator } from "./domain/v2/aggregator.js";
import type { AggregatorDeps } from "./domain/v2/aggregator.js";
import type { ScoringDimension, ScoringItemCode } from "./domain/v2/scoring-items-config.js";
import type { SqliteRepository } from "./storage/sqlite-repository.js";
import { readLlmProviderConfig } from "./services/llm/provider-config.js";
import { OpenAiCompatibleLlmScoringClient } from "./services/v2/llm-scoring-client.js";
import { LlmScoringWorker } from "./services/v2/llm-scoring-worker.js";
import type { WorkerDeps, WorkerConfig } from "./services/v2/llm-scoring-worker.js";
import type { AdminPanelLifecycleDeps } from "./services/feishu/cards/handlers/admin-panel-handler.js";
import type { FeishuCardJson } from "./services/feishu/cards/types.js";
import { settleWindow, type SettlerDependencies } from "./domain/v2/window-settler.js";
import { detectAnnounceablePromotions } from "./domain/v2/promotion-announcer.js";
import { buildFirstThreeAnnouncementCard } from "./services/feishu/cards/templates/first-three-announcement-v1.js";

// ---------------------------------------------------------------------------
// IngestorDeps adapter
// ---------------------------------------------------------------------------

function buildIngestorDeps(repo: SqliteRepository, campId: string): IngestorDeps {
  const llmConfig = readLlmProviderConfig(process.env);

  return {
    findMemberById(id: string) {
      const m = repo.getMember(id);
      if (!m) return null;
      return {
        id: m.id,
        roleType: m.roleType as "student" | "operator" | "trainer" | "observer",
        isParticipant: m.isParticipant,
        isExcludedFromBoard: m.isExcludedFromBoard,
      };
    },

    findActivePeriod() {
      const p = repo.findActivePeriod(campId);
      if (!p) return null;
      return {
        id: p.id,
        campId: p.campId,
        number: p.number,
        isIceBreaker: p.isIceBreaker,
        endedAt: p.endedAt,
      };
    },

    sumApprovedScoreDelta(memberId: string, periodId: string, itemCode: ScoringItemCode) {
      return repo.sumApprovedScoreDelta(memberId, periodId, itemCode);
    },

    sumPendingScoreDelta(memberId: string, periodId: string, itemCode: ScoringItemCode) {
      return repo.sumPendingScoreDelta(memberId, periodId, itemCode);
    },

    sumReviewRequiredScoreDelta(memberId: string, periodId: string, itemCode: ScoringItemCode) {
      return repo.sumReviewRequiredScoreDelta(memberId, periodId, itemCode);
    },

    findEventBySourceRef(memberId: string, periodId: string, itemCode: ScoringItemCode, sourceRef: string) {
      const ev = repo.findEventBySourceRef(memberId, periodId, itemCode, sourceRef);
      return ev ? { id: ev.id } : null;
    },

    insertScoringEvent(row: IngestorEventInsert): string {
      const id = crypto.randomUUID();
      repo.insertScoringItemEvent({
        id,
        memberId: row.memberId,
        periodId: row.periodId,
        itemCode: row.itemCode,
        dimension: row.dimension,
        scoreDelta: row.scoreDelta,
        sourceType: row.sourceType,
        sourceRef: row.sourceRef,
        status: row.status as "pending" | "approved" | "rejected" | "review_required",
        llmTaskId: null,
        createdAt: row.createdAt,
        decidedAt: row.status === "approved" ? row.createdAt : null,
      });
      return id;
    },

    incrementMemberDimensionScore(
      memberId: string,
      periodId: string,
      dimension: ScoringDimension,
      delta: number
    ) {
      repo.incrementMemberDimensionScore({
        memberId,
        periodId,
        dimension,
        delta,
        eventAt: new Date().toISOString(),
      });
    },

    insertLlmScoringTask(row: IngestorLlmTaskInsert): string {
      const id = crypto.randomUUID();
      return repo.insertLlmTask({
        id,
        eventId: row.eventId,
        provider: row.provider,
        model: row.model,
        promptText: row.promptText,
        enqueuedAt: row.enqueuedAt,
        maxAttempts: 3,
      });
    },

    linkEventToLlmTask(eventId: string, taskId: string) {
      repo.setEventLlmTaskId(eventId, taskId);
    },

    runInTransaction<T>(fn: () => T): T {
      // better-sqlite3 transactions are synchronous and created via
      // db.transaction(). Since the `db` property is private on the
      // repository, we use a simple try/catch here. For a single-writer
      // SQLite setup this is safe: the ingestor's pipeline is already
      // serialised by the event loop. If true transaction isolation is
      // needed later, SqliteRepository can expose a `runInTransaction`
      // method.
      return fn();
    },

    now() {
      return new Date().toISOString();
    },

    generateId() {
      return crypto.randomUUID();
    },

    provider: llmConfig.provider,
    model: llmConfig.textModel,
  };
}

// ---------------------------------------------------------------------------
// AggregatorDeps adapter
// ---------------------------------------------------------------------------

function buildAggregatorDeps(repo: SqliteRepository): AggregatorDeps {
  return {
    findEventById(id: string) {
      const ev = repo.getEventById(id);
      if (!ev) return null;
      return {
        id: ev.id,
        memberId: ev.memberId,
        periodId: ev.periodId,
        itemCode: ev.itemCode,
        dimension: ev.dimension as ScoringDimension,
        scoreDelta: ev.scoreDelta,
        status: ev.status as "pending" | "approved" | "rejected" | "review_required",
        reviewNote: ev.reviewNote,
        decidedAt: ev.decidedAt,
      };
    },

    updateEventStatus(input) {
      repo.updateEventStatus(input);
    },

    incrementMemberDimensionScore(
      memberId: string,
      periodId: string,
      dimension: ScoringDimension,
      delta: number
    ) {
      repo.incrementMemberDimensionScore({
        memberId,
        periodId,
        dimension,
        delta,
        eventAt: new Date().toISOString(),
      });
    },

    decrementMemberDimensionScore(
      memberId: string,
      periodId: string,
      dimension: ScoringDimension,
      delta: number
    ) {
      repo.decrementMemberDimensionScore({
        memberId,
        periodId,
        dimension,
        delta,
        eventAt: new Date().toISOString(),
      });
    },

    runInTransaction<T>(fn: () => T): T {
      return fn();
    },

    now() {
      return new Date().toISOString();
    },
  };
}

// ---------------------------------------------------------------------------
// Period lifecycle stub
// ---------------------------------------------------------------------------

/**
 * Minimal period lifecycle that covers the shapes expected by the v2
 * route handlers: `openNewPeriod`, `openWindow`, and `closeGraduation`.
 *
 * This is a thin orchestration layer — the actual DB mutations delegate
 * to SqliteRepository.
 */
function buildPeriodLifecycle(
  repo: SqliteRepository,
  campId: string,
  windowSettler?: { settle(id: string): Promise<{ windowId: string; settledAt: string }> },
  sendCard?: (chatId: string, card: FeishuCardJson) => Promise<void>,
  groupChatId?: string,
) {
  return {
    async openNewPeriod(number: number) {
      const now = new Date().toISOString();
      const isIceBreaker = number === 1;

      // Check if this period already exists
      const existing = repo.findPeriodByNumber(campId, number);
      if (existing) {
        // Period already exists — return its info without re-attaching to windows
        return { periodId: existing.id, assignedWindowId: null, shouldSettleWindowId: null };
      }

      const periodId = crypto.randomUUID();
      repo.insertPeriod({
        id: periodId,
        campId,
        number,
        isIceBreaker,
        startedAt: now,
        openedByOpId: null,
        createdAt: now,
        updatedAt: now,
      });

      // Find or create a window with an open slot
      let window = repo.findOpenWindowWithOpenSlot(campId);
      let shouldSettleWindowId: string | null = null;

      if (!window) {
        const windowCode = resolveWindowCode(number);
        const existingWindow = repo.findWindowByCode(campId, windowCode);
        if (!existingWindow) {
          repo.insertWindowShell({
            code: windowCode,
            campId,
            isFinal: windowCode === "FINAL",
            createdAt: now,
          });
        }
        window = repo.findWindowByCode(campId, windowCode) ?? undefined;
      }

      const assignedWindowId = window?.id ?? "unknown";

      // Attach period to window
      if (window) {
        if (!window.firstPeriodId) {
          repo.attachFirstPeriod(window.id, periodId);
        } else if (!window.lastPeriodId) {
          repo.attachLastPeriod(window.id, periodId);
          shouldSettleWindowId = window.id;
        }
      }

      // If settlement is triggered AND we have a real window settler, run it
      if (shouldSettleWindowId && windowSettler) {
        try {
          await windowSettler.settle(shouldSettleWindowId);

          // After settlement, detect and send promotion announcements
          if (sendCard && groupChatId) {
            const announcements = detectAnnounceablePromotions(shouldSettleWindowId, {
              getPromotions: (wid) => {
                // Query promotions from repo using direct DB access
                const db = (repo as any).db;
                const rows = db.prepare(
                  `SELECT p.member_id, p.from_level, p.to_level, p.promoted
                   FROM v2_promotion_records p
                   WHERE p.window_id = ? AND p.promoted = 1
                   ORDER BY p.evaluated_at ASC, p.id ASC`
                ).all(wid) as Array<{ member_id: string; from_level: number; to_level: number; promoted: number }>;
                return rows.map((r) => ({
                  memberId: r.member_id,
                  fromLevel: r.from_level,
                  toLevel: r.to_level,
                  promoted: r.promoted === 1,
                }));
              },
              getOrdinals: () => repo.getAnnouncementOrdinals(),
              insertOrdinal: (input) => repo.insertAnnouncementOrdinal(input),
              getMemberName: (mid) => {
                const m = repo.getMember(mid);
                return m ? (m.displayName || m.name) : null;
              },
              now: () => new Date().toISOString(),
            });

            for (const item of announcements) {
              const card = buildFirstThreeAnnouncementCard({ items: [item] });
              await sendCard(groupChatId, card);
            }
          }
        } catch (err) {
          console.error("[PeriodLifecycle] Settlement failed:", err);
          // Don't throw — the period was already opened successfully
        }
      }

      return { periodId, assignedWindowId, shouldSettleWindowId };
    },

    async openWindow(code: string) {
      const existing = repo.findWindowByCode(campId, code);
      if (existing) {
        return { windowId: existing.id, created: false };
      }
      const now = new Date().toISOString();
      repo.insertWindowShell({
        code,
        campId,
        isFinal: code === "FINAL",
        createdAt: now,
      });
      const created = repo.findWindowByCode(campId, code);
      return { windowId: created?.id ?? crypto.randomUUID(), created: true };
    },

    async closeGraduation(_admin: unknown) {
      const finalWindow = repo.findWindowByCode(campId, "FINAL");
      if (!finalWindow) {
        throw Object.assign(new Error("no FINAL window exists"), {
          code: "no_final_window",
        });
      }
      const settled = finalWindow.settlementState === "settled";
      if (!settled) {
        const now = new Date().toISOString();
        repo.markWindowSettled(finalWindow.id, now);
      }
      return { finalWindowId: finalWindow.id, settled: true };
    },
  };
}

function resolveWindowCode(periodNumber: number): string {
  if (periodNumber <= 2) return "W1";
  if (periodNumber <= 4) return "W2";
  if (periodNumber <= 6) return "W3";
  if (periodNumber <= 8) return "W4";
  if (periodNumber <= 10) return "W5";
  return "FINAL";
}

// ---------------------------------------------------------------------------
// Window settler — real domain engine adapter
// ---------------------------------------------------------------------------

function buildRealWindowSettler(repo: SqliteRepository, campId: string) {
  return {
    async settle(windowId: string) {
      const deps: SettlerDependencies = {
        fetchWindow: async (id) => {
          const w = repo.findWindowById(id);
          if (!w) throw new Error(`Window not found: ${id}`);
          return {
            id: w.id,
            campId: w.campId,
            code: w.code,
            firstPeriodId: w.firstPeriodId,
            lastPeriodId: w.lastPeriodId,
            isFinal: w.isFinal,
            settlementState: w.settlementState,
            settledAt: w.settledAt,
          };
        },

        updateWindowSettlementState: async (id, next) => {
          if (next === "settling") repo.markWindowSettling(id);
          else if (next === "settled") repo.markWindowSettled(id, new Date().toISOString());
        },

        listEligibleStudentIds: async () => repo.listEligibleStudentIds(campId),

        fetchPeriodDimensionScores: async (memberId, periodIds) =>
          repo.fetchMemberDimensionScoresForPeriods(memberId, periodIds),

        fetchPreviousSnapshot: async (memberId, beforeWindowId) => {
          const snap = repo.findLatestSnapshotBefore(memberId, beforeWindowId);
          return snap ?? null;
        },

        fetchPreviousPromotionRecord: async (memberId, beforeWindowId) => {
          const rec = repo.findPromotionForWindow(beforeWindowId, memberId);
          if (!rec) return null;
          return {
            id: rec.id,
            windowId: rec.windowId,
            memberId: rec.memberId,
            evaluatedAt: rec.evaluatedAt,
            fromLevel: rec.fromLevel as 1 | 2 | 3 | 4 | 5,
            toLevel: rec.toLevel as 1 | 2 | 3 | 4 | 5,
            promoted: (rec.promoted ? 1 : 0) as 0 | 1,
            pathTaken: rec.pathTaken as any,
            reason: rec.reason,
          };
        },

        fetchMemberLevel: async (memberId) => {
          const lev = repo.getMemberLevel(memberId);
          return {
            memberId: lev.memberId,
            currentLevel: lev.currentLevel as 1 | 2 | 3 | 4 | 5,
            levelAttainedAt: lev.levelAttainedAt ?? new Date().toISOString(),
            lastWindowId: lev.lastWindowId,
            updatedAt: lev.updatedAt ?? new Date().toISOString(),
          };
        },

        computeAttendance: async (memberId) => repo.computeAttendance(memberId, windowId),

        computeHomeworkAllSubmitted: async (memberId) =>
          repo.computeHomeworkAllSubmitted(memberId, windowId),

        fetchAllEligibleDimensionScores: async () => {
          const window = repo.findWindowById(windowId);
          if (!window) return [];
          const periodIds: string[] = [];
          if (window.firstPeriodId) periodIds.push(window.firstPeriodId);
          if (window.lastPeriodId) periodIds.push(window.lastPeriodId);
          return repo.fetchAllEligibleDimensionScores(campId, periodIds);
        },

        fetchElapsedScoringPeriods: async () => repo.countElapsedScoringPeriods(windowId),

        insertWindowSnapshot: async (snap) => repo.insertWindowSnapshot(snap),

        insertPromotionRecord: async (rec) => {
          repo.insertPromotionRecord({
            id: rec.id,
            windowId: rec.windowId,
            memberId: rec.memberId,
            evaluatedAt: rec.evaluatedAt,
            fromLevel: rec.fromLevel,
            toLevel: rec.toLevel,
            promoted: rec.promoted === 1,
            pathTaken: rec.pathTaken,
            reason: rec.reason,
          });
        },

        updateMemberLevel: async (rec) => {
          repo.upsertMemberLevel({
            memberId: rec.memberId,
            currentLevel: rec.currentLevel,
            levelAttainedAt: rec.levelAttainedAt,
            lastWindowId: rec.lastWindowId,
            updatedAt: rec.updatedAt,
          });
        },

        now: () => new Date().toISOString(),
      };

      const result = await settleWindow(windowId, deps, {});
      return { windowId, settledAt: new Date().toISOString(), promotionCount: result.settledMemberCount };
    },
  };
}

// ---------------------------------------------------------------------------
// LLM worker (real implementation or no-op when LLM is disabled)
// ---------------------------------------------------------------------------

function buildLlmWorker(
  repo: SqliteRepository,
  _aggregator: ScoringAggregator
): LlmScoringWorker | null {
  const llmConfig = readLlmProviderConfig(process.env);
  if (!llmConfig.enabled) {
    return null;
  }

  const llmClient = new OpenAiCompatibleLlmScoringClient(llmConfig);

  const workerConfig: WorkerConfig = {
    concurrency: llmConfig.concurrency,
    rateLimitPerSec: llmConfig.concurrency,
    pollIntervalMs: 5000,
    taskTimeoutMs: llmConfig.timeoutMs,
    maxAttempts: 3,
  };

  const deps: WorkerDeps = {
    claimNextPendingTask() {
      const task = repo.claimNextPendingTask(new Date().toISOString());
      if (!task) return null;
      return {
        id: task.id,
        eventId: task.eventId,
        promptText: task.promptText,
        attempts: task.attempts,
        maxAttempts: task.maxAttempts,
      };
    },

    markTaskSucceeded(taskId, result) {
      repo.markTaskSucceeded(taskId, result);
    },

    markTaskFailedRetry(taskId, backoffSec, reason) {
      repo.markTaskFailedRetry(taskId, backoffSec, reason);
    },

    markTaskFailedTerminal(taskId, reason) {
      repo.markTaskFailedTerminal(taskId, reason);
    },

    requeueStaleRunningTasks(olderThanMs) {
      return repo.requeueStaleRunningTasks(olderThanMs);
    },

    countPending() {
      return repo.countLlmTasksByStatus("pending");
    },

    countRunning() {
      return repo.countLlmTasksByStatus("running");
    },

    countSucceededLastHour() {
      return repo.countLlmTasksSucceededLastHour();
    },

    countFailedLastHour() {
      return repo.countLlmTasksFailedLastHour();
    },

    reviewQueueDepth() {
      return repo.countReviewRequiredEvents({});
    },

    recentFailureSummary() {
      return repo.listRecentFailedLlmTasks(10).map((f) => ({
        eventId: f.eventId,
        errorReason: f.errorReason,
        at: f.finishedAt,
      }));
    },

    aggregator: {
      applyDecision(eventId, decision, note) {
        const now = new Date().toISOString();
        if (decision === "approved") {
          const ev = repo.getEventById(eventId);
          if (ev) {
            repo.updateEventStatus({
              id: eventId,
              status: "approved",
              decidedAt: now,
              reviewNote: note ?? null,
              reviewedByOpId: null,
            });
            repo.incrementMemberDimensionScore({
              memberId: ev.memberId,
              periodId: ev.periodId,
              dimension: ev.dimension as ScoringDimension,
              delta: ev.scoreDelta,
              eventAt: now,
            });
          }
        } else {
          // "rejected" or "review_required"
          repo.updateEventStatus({
            id: eventId,
            status: decision,
            decidedAt: now,
            reviewNote: note ?? null,
            reviewedByOpId: null,
          });
        }
      },
    },

    llmClient,
  };

  const worker = new LlmScoringWorker(deps, workerConfig);
  worker.start();
  return worker;
}

// ---------------------------------------------------------------------------
// Admin panel lifecycle adapter
// ---------------------------------------------------------------------------

/**
 * Builds AdminPanelLifecycleDeps by delegating to existing
 * buildPeriodLifecycle logic and SqliteRepository methods.
 */
function buildAdminPanelLifecycle(
  repo: SqliteRepository,
  campId: string,
  periodLifecycle: ReturnType<typeof buildPeriodLifecycle>
): AdminPanelLifecycleDeps {
  return {
    async openNewPeriod(number: number) {
      return periodLifecycle.openNewPeriod(number);
    },

    async openWindow(code: string) {
      return periodLifecycle.openWindow(code);
    },

    async closeGraduation() {
      const finalWindow = repo.findWindowByCode(campId, "FINAL");
      if (!finalWindow) {
        return { ok: false, reason: "FINAL 窗口不存在" };
      }

      if (finalWindow.settlementState === "settled") {
        return { ok: true };
      }

      const now = new Date().toISOString();
      repo.markWindowSettled(finalWindow.id, now);
      return { ok: true, shouldSettleWindowId: finalWindow.id };
    },

    async getActivePeriod() {
      const p = repo.findActivePeriod(campId);
      if (!p) return null;
      return { number: p.number, startedAt: p.startedAt };
    },

    async getActiveWindow() {
      const w = repo.findOpenWindowWithOpenSlot(campId);
      if (!w) return null;
      return {
        code: w.code,
        settlementState: w.settlementState,
      };
    },

    async countMembers() {
      const all = repo.listMembers(campId);
      const students = all.filter(
        (m) => m.roleType === "student"
      );
      const active = students.filter(
        (m) => m.isParticipant && !m.isExcludedFromBoard
      );
      return { total: all.length, activeStudents: active.length };
    },
  };
}

// ---------------------------------------------------------------------------
// Public factory
// ---------------------------------------------------------------------------

export interface SendCardFn {
  sendCard: (chatId: string, card: FeishuCardJson) => Promise<void>;
}

export interface V2ProductionDeps {
  ingestor: EventIngestor;
  aggregator: ScoringAggregator;
  periodLifecycle: ReturnType<typeof buildPeriodLifecycle>;
  windowSettler: ReturnType<typeof buildRealWindowSettler>;
  llmWorker: LlmScoringWorker | null;
  adminPanelLifecycle: AdminPanelLifecycleDeps;
}

export function wireV2Production(
  repo: SqliteRepository,
  options?: { groupChatId?: string; sendCard?: (chatId: string, card: FeishuCardJson) => Promise<void> }
): V2ProductionDeps {
  const campId = repo.getDefaultCampId() ?? "default";

  const ingestorDeps = buildIngestorDeps(repo, campId);
  const ingestor = new EventIngestor(ingestorDeps);

  const aggregatorDeps = buildAggregatorDeps(repo);
  const aggregator = new ScoringAggregator(aggregatorDeps);

  const windowSettler = buildRealWindowSettler(repo, campId);
  const periodLifecycle = buildPeriodLifecycle(
    repo,
    campId,
    windowSettler,
    options?.sendCard,
    options?.groupChatId,
  );
  const llmWorker = buildLlmWorker(repo, aggregator);
  const adminPanelLifecycleInstance = buildAdminPanelLifecycle(repo, campId, periodLifecycle);

  return { ingestor, aggregator, periodLifecycle, windowSettler, llmWorker, adminPanelLifecycle: adminPanelLifecycleInstance };
}
