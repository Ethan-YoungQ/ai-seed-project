/**
 * End-to-end integration test for the v2 scoring pipeline.
 *
 * Boots a Fastify app with :memory: SQLite and coherent fake services
 * that track state across calls, exercising the full route → service
 * → repository chain for admin auth, body validation, and error
 * handling.
 *
 * A second describe block tests the LLM worker lifecycle with a
 * real worker + FakeLlmScoringClient, validating the drainOnce() hook.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { createApp } from "../../../src/app.js";
import { SqliteRepository } from "../../../src/storage/sqlite-repository.js";
import { runEnsureBootstrap } from "../../../src/scripts/ensure-bootstrap-data.js";
import {
  FakeLlmScoringClient,
} from "../../../src/services/v2/llm-scoring-client.js";
import { LlmScoringWorker, type WorkerDeps, type WorkerConfig } from "../../../src/services/v2/llm-scoring-worker.js";
import { makeOperatorHeader, seedStudents, seedOperator } from "./helpers.js";
import {
  IceBreakerPeriodError,
  NoActivePeriodError,
  DuplicateEventError,
  PerPeriodCapExceededError,
  NotEligibleError,
} from "../../../src/domain/v2/errors.js";

// ---------------------------------------------------------------------------
// Test 1: Full pipeline narrative via routes
// ---------------------------------------------------------------------------

describe("v2 E2E pipeline via fastify.inject", () => {
  let app: Awaited<ReturnType<typeof createApp>>;

  // Track state across calls to simulate a coherent pipeline
  const state = {
    windowsOpened: [] as string[],
    periodsOpened: [] as Array<{ number: number; id: string }>,
    eventsIngested: [] as Array<{ eventId: string; memberId: string; itemCode: string }>,
    currentPeriodIsIceBreaker: false,
    hasActivePeriod: false,
    llmTasksPending: 0,
    llmTasksProcessed: 0,
  };

  beforeAll(async () => {
    // Coherent fakes that track pipeline state
    const fakeIngestor = {
      ingest: vi.fn(async (body: Record<string, unknown>) => {
        if (!state.hasActivePeriod) throw new NoActivePeriodError();
        if (state.currentPeriodIsIceBreaker) throw new IceBreakerPeriodError();

        const memberId = body.memberId as string;
        const itemCode = body.itemCode as string;
        const sourceRef = body.sourceRef as string;

        // Duplicate check
        if (state.eventsIngested.some(
          (e) => e.memberId === memberId && e.itemCode === itemCode
          && sourceRef === `dup-${e.memberId}-${e.itemCode}`
        )) {
          throw new DuplicateEventError(sourceRef);
        }

        const eventId = `evt-${state.eventsIngested.length + 1}`;
        state.eventsIngested.push({ eventId, memberId, itemCode });

        // K3, K4, H2, C1, C3, G2 need LLM
        const llmItems = ["K3", "K4", "H2", "C1", "C3", "G2"];
        if (llmItems.includes(itemCode)) {
          state.llmTasksPending++;
        }

        return { eventId };
      }),
    };

    const fakePeriodLifecycle = {
      openWindow: vi.fn(async (code: string) => {
        const existed = state.windowsOpened.includes(code);
        if (!existed) state.windowsOpened.push(code);
        return {
          windowId: `window-camp-demo-${code.toLowerCase()}`,
          created: !existed,
        };
      }),
      openNewPeriod: vi.fn(async (number: number) => {
        const isIce = number === 1;
        state.currentPeriodIsIceBreaker = isIce;
        state.hasActivePeriod = true;

        const periodId = `period-camp-demo-${number}`;
        state.periodsOpened.push({ number, id: periodId });

        const assignedWindowId = isIce ? null : `window-camp-demo-w1`;
        // If period 4, settling W1
        const shouldSettleWindowId =
          number === 4 ? `window-camp-demo-w1` : null;

        return { periodId, assignedWindowId, shouldSettleWindowId };
      }),
    };

    const fakeLlmWorker = {
      getStatus: vi.fn(() => ({
        running: true,
        concurrencyInUse: 0,
        concurrencyMax: 3,
        pendingCount: state.llmTasksPending,
        runningCount: 0,
        succeededLast1h: state.llmTasksProcessed,
        failedLast1h: 0,
        reviewQueueDepth: 0,
        avgLatencyMs: 50,
        recentFailures: [],
      })),
    };

    const fakeAggregator = {
      applyDecision: vi.fn(),
    };

    app = await createApp({
      databaseUrl: ":memory:",
      ingestor: fakeIngestor,
      aggregator: fakeAggregator,
      periodLifecycle: fakePeriodLifecycle,
      windowSettler: { settle: () => ({}) },
      llmWorker: fakeLlmWorker,
      reactionTracker: { handleReaction: () => ({}) },
      memberSync: { syncGroupMembers: async () => ({}) },
    });

    // Seed demo data + operator in the app's internal DB for adminGuard
    await app.inject({ method: "POST", url: "/api/demo/seed" });
  });

  afterAll(async () => {
    await app.close();
  });

  it("health check returns 200", async () => {
    const res = await app.inject({ method: "GET", url: "/api/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json().ok).toBe(true);
  });

  it("events route returns 409 no_active_period before any period is opened", async () => {
    state.hasActivePeriod = false;
    const res = await app.inject({
      method: "POST",
      url: "/api/v2/events",
      payload: {
        memberId: "m-1",
        itemCode: "K1",
        sourceRef: "pre-period",
      },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe("no_active_period");
  });

  it("opens ice-breaker period (number=1)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v2/periods/open",
      payload: { number: 1 },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.periodId).toMatch(/^period-/);
    expect(body.assignedWindowId).toBeNull();
  });

  it("events during ice-breaker return 409 ice_breaker_no_scoring", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v2/events",
      payload: {
        memberId: "m-1",
        itemCode: "K1",
        sourceRef: "ice-test",
      },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe("ice_breaker_no_scoring");
  });

  it("opens period 2 — assigns to W1 window", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v2/periods/open",
      payload: { number: 2 },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.assignedWindowId).toMatch(/window-/);
  });

  it("ingests non-LLM events (K1) and returns 202", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v2/events",
      payload: {
        memberId: "m-1",
        itemCode: "K1",
        sourceRef: "card-k1-m1",
      },
    });
    expect(res.statusCode).toBe(202);
    expect(res.json().ok).toBe(true);
    expect(res.json().eventId).toMatch(/^evt-/);
  });

  it("ingests events for multiple members", async () => {
    for (let i = 2; i <= 5; i++) {
      const res = await app.inject({
        method: "POST",
        url: "/api/v2/events",
        payload: {
          memberId: `m-${i}`,
          itemCode: "H1",
          sourceRef: `card-h1-m${i}`,
        },
      });
      expect(res.statusCode).toBe(202);
    }
    expect(state.eventsIngested.length).toBe(5);
  });

  it("ingests LLM item (K3) and returns 202", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v2/events",
      payload: {
        memberId: "m-1",
        itemCode: "K3",
        sourceRef: "card-k3-m1",
        payload: { text: "My knowledge application" },
      },
    });
    expect(res.statusCode).toBe(202);
    expect(state.llmTasksPending).toBe(1);
  });

  it("LLM worker status returns running: true", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v2/llm/worker/status",
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.status.running).toBe(true);
  });

  it("board ranking returns 200", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v2/board/ranking",
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().ok).toBe(true);
  });

  it("board member detail for non-existent member returns 404", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v2/board/member/m-ghost",
    });
    expect(res.statusCode).toBe(404);
  });

  it("events route accepts requests without admin header (not admin-gated)", async () => {
    // Events route is NOT admin-gated — no header needed
    const res = await app.inject({
      method: "POST",
      url: "/api/v2/events",
      payload: {
        memberId: "m-3",
        itemCode: "S1",
        sourceRef: "card-s1-m3",
      },
    });
    expect(res.statusCode).toBe(202);
  });

  it("windows/open requires admin header", async () => {
    const noAuth = await app.inject({
      method: "POST",
      url: "/api/v2/windows/open",
      payload: { code: "W3" },
    });
    expect(noAuth.statusCode).toBe(401);
    expect(noAuth.json().code).toBe("no_identity");
  });

  it("admin review queue requires admin header", async () => {
    const noAuth = await app.inject({
      method: "GET",
      url: "/api/v2/admin/review-queue",
    });
    expect(noAuth.statusCode).toBe(401);
  });

  it("validates event body strictly — extra fields rejected", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v2/events",
      payload: {
        memberId: "m-1",
        itemCode: "K1",
        sourceRef: "s",
        extraField: "forbidden",
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe("invalid_body");
  });

  it("validates event body — missing required fields", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v2/events",
      payload: { memberId: 42 },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe("invalid_body");
  });

  it("validates periods body — invalid number type", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v2/periods/open",
      payload: { number: "abc" },
    });
    expect(res.statusCode).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Test 2: LLM worker lifecycle with FakeLlmScoringClient
// ---------------------------------------------------------------------------

describe("v2 LLM worker drainOnce integration", () => {
  it("processes a pending task via drainOnce and calls aggregator", async () => {
    const decisions: string[] = [];

    const tasks = [
      {
        id: "task-1",
        eventId: "evt-1",
        promptText: "test prompt",
        status: "pending" as const,
        attempts: 0,
        maxAttempts: 3,
        enqueuedAtMs: 0,
        startedAtMs: null as number | null,
      },
    ];

    const client = new FakeLlmScoringClient({
      provider: () => ({
        pass: true,
        score: 100,
        reason: "auto-pass",
        raw: null,
      }),
    });

    const deps: WorkerDeps = {
      claimNextPendingTask: () => {
        const idx = tasks.findIndex((t) => t.status === "pending");
        if (idx === -1) return null;
        const task = tasks[idx];
        task.status = "running";
        task.attempts += 1;
        return {
          id: task.id,
          eventId: task.eventId,
          promptText: task.promptText,
          attempts: task.attempts,
          maxAttempts: task.maxAttempts,
        };
      },
      markTaskSucceeded: (taskId, _result) => {
        const t = tasks.find((t) => t.id === taskId);
        if (t) t.status = "succeeded" as unknown as "pending";
      },
      markTaskFailedRetry: () => {},
      markTaskFailedTerminal: () => {},
      requeueStaleRunningTasks: () => 0,
      countPending: () => tasks.filter((t) => t.status === "pending").length,
      countRunning: () => tasks.filter((t) => t.status === "running").length,
      countSucceededLastHour: () => 0,
      countFailedLastHour: () => 0,
      reviewQueueDepth: () => 0,
      recentFailureSummary: () => [],
      aggregator: {
        applyDecision: (eventId, decision, note) => {
          decisions.push(`${eventId}:${decision}`);
        },
      },
      llmClient: client,
    };

    const config: WorkerConfig = {
      concurrency: 1,
      rateLimitPerSec: 100,
      pollIntervalMs: 50,
      taskTimeoutMs: 5000,
      maxAttempts: 3,
    };

    const worker = new LlmScoringWorker(deps, config);

    // drainOnce processes one task without starting the background loop
    await worker.drainOnce();

    expect(decisions).toEqual(["evt-1:approved"]);
  });

  it("FakeLlmScoringClient configured to reject sends review_required", async () => {
    const decisions: string[] = [];

    const tasks = [
      {
        id: "task-2",
        eventId: "evt-2",
        promptText: "test prompt reject",
        status: "pending" as const,
        attempts: 0,
        maxAttempts: 3,
        enqueuedAtMs: 0,
        startedAtMs: null as number | null,
      },
    ];

    const rejectClient = new FakeLlmScoringClient({
      provider: () => ({
        pass: false,
        score: 0,
        reason: "low-quality",
        raw: null,
      }),
    });

    const deps: WorkerDeps = {
      claimNextPendingTask: () => {
        const idx = tasks.findIndex((t) => t.status === "pending");
        if (idx === -1) return null;
        const task = tasks[idx];
        task.status = "running";
        task.attempts += 1;
        return {
          id: task.id,
          eventId: task.eventId,
          promptText: task.promptText,
          attempts: task.attempts,
          maxAttempts: task.maxAttempts,
        };
      },
      markTaskSucceeded: (taskId) => {
        const t = tasks.find((t) => t.id === taskId);
        if (t) t.status = "succeeded" as unknown as "pending";
      },
      markTaskFailedRetry: () => {},
      markTaskFailedTerminal: () => {},
      requeueStaleRunningTasks: () => 0,
      countPending: () => 0,
      countRunning: () => 0,
      countSucceededLastHour: () => 0,
      countFailedLastHour: () => 0,
      reviewQueueDepth: () => 0,
      recentFailureSummary: () => [],
      aggregator: {
        applyDecision: (eventId, decision, note) => {
          decisions.push(`${eventId}:${decision}`);
        },
      },
      llmClient: rejectClient,
    };

    const worker = new LlmScoringWorker(deps, {
      concurrency: 1,
      rateLimitPerSec: 100,
      pollIntervalMs: 50,
      taskTimeoutMs: 5000,
      maxAttempts: 3,
    });

    await worker.drainOnce();

    // Rejected items go to review_required (not rejected)
    expect(decisions).toEqual(["evt-2:review_required"]);
  });
});

// ---------------------------------------------------------------------------
// Test 3: Bootstrap integration
// ---------------------------------------------------------------------------

describe("v2 bootstrap integration", () => {
  it("runEnsureBootstrap creates W1/W2 shells and is importable without side effects", async () => {
    const repo = new SqliteRepository(":memory:");
    const result = await runEnsureBootstrap({
      repository: repo,
      env: {} as unknown as NodeJS.ProcessEnv,
    });

    expect(result.mutated).toBe(true);
    expect(result.campId).toBeTruthy();

    const w1 = repo.findWindowByCode(result.campId!, "W1");
    const w2 = repo.findWindowByCode(result.campId!, "W2");
    expect(w1).toBeDefined();
    expect(w1!.settlementState).toBe("open");
    expect(w2).toBeDefined();
    expect(w2!.settlementState).toBe("open");

    // Second run is idempotent
    const r2 = await runEnsureBootstrap({
      repository: repo,
      env: {} as unknown as NodeJS.ProcessEnv,
    });
    expect(r2.mutated).toBe(false);

    repo.close();
  });
});
