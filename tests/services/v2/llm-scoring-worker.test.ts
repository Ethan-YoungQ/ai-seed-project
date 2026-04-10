import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
  LlmScoringWorker,
  type WorkerDeps,
  type WorkerConfig
} from "../../../src/services/v2/llm-scoring-worker.js";
import {
  FakeLlmScoringClient,
  type LlmScoringResult
} from "../../../src/services/v2/llm-scoring-client.js";
import {
  LlmNonRetryableError,
  LlmRetryableError
} from "../../../src/domain/v2/errors.js";

interface FakeTaskRow {
  id: string;
  eventId: string;
  promptText: string;
  status: "pending" | "running" | "succeeded" | "failed";
  attempts: number;
  maxAttempts: number;
  enqueuedAtMs: number;
  startedAtMs: number | null;
}

function baseConfig(overrides: Partial<WorkerConfig> = {}): WorkerConfig {
  return {
    concurrency: 1,
    rateLimitPerSec: 10,
    pollIntervalMs: 50,
    taskTimeoutMs: 1000,
    maxAttempts: 3,
    ...overrides
  };
}

function makeDeps(
  tasks: FakeTaskRow[],
  client: FakeLlmScoringClient,
  decisions: string[]
): WorkerDeps {
  return {
    claimNextPendingTask: vi.fn(() => {
      const now = Date.now();
      const idx = tasks.findIndex(
        (t) =>
          t.status === "pending" &&
          t.attempts < t.maxAttempts &&
          t.enqueuedAtMs <= now
      );
      if (idx === -1) return null;
      const task = tasks[idx];
      task.status = "running";
      task.attempts += 1;
      task.startedAtMs = now;
      return {
        id: task.id,
        eventId: task.eventId,
        promptText: task.promptText,
        attempts: task.attempts,
        maxAttempts: task.maxAttempts
      };
    }),
    markTaskSucceeded: vi.fn((taskId: string, _result: LlmScoringResult) => {
      const task = tasks.find((t) => t.id === taskId);
      if (task) task.status = "succeeded";
    }),
    markTaskFailedRetry: vi.fn(
      (taskId: string, _backoffSec: number, _reason: string) => {
        const task = tasks.find((t) => t.id === taskId);
        if (task) {
          task.status = "pending";
          task.enqueuedAtMs = Date.now() + _backoffSec * 1000;
        }
      }
    ),
    markTaskFailedTerminal: vi.fn((taskId: string, _reason: string) => {
      const task = tasks.find((t) => t.id === taskId);
      if (task) task.status = "failed";
    }),
    requeueStaleRunningTasks: vi.fn(
      (_cutoffMs: number): number => 0
    ),
    countPending: vi.fn(() => tasks.filter((t) => t.status === "pending").length),
    countRunning: vi.fn(() => tasks.filter((t) => t.status === "running").length),
    countSucceededLastHour: vi.fn(
      () => tasks.filter((t) => t.status === "succeeded").length
    ),
    countFailedLastHour: vi.fn(
      () => tasks.filter((t) => t.status === "failed").length
    ),
    reviewQueueDepth: vi.fn(() => 0),
    recentFailureSummary: vi.fn(() => []),
    aggregator: {
      applyDecision: vi.fn(
        (
          eventId: string,
          decision: "approved" | "rejected" | "review_required",
          _note?: string
        ) => {
          decisions.push(`${eventId}:${decision}`);
        }
      )
    },
    llmClient: client
  };
}

describe("LlmScoringWorker", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test("requeueStaleRunningTasks called on start with 2x timeout", async () => {
    const deps = makeDeps([], new FakeLlmScoringClient({ responses: [] }), []);
    const worker = new LlmScoringWorker(deps, baseConfig({ taskTimeoutMs: 500 }));
    worker.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(deps.requeueStaleRunningTasks).toHaveBeenCalledWith(1000);
    await worker.stop();
  });

  test("successful task applies approved decision", async () => {
    const tasks: FakeTaskRow[] = [
      {
        id: "task-1",
        eventId: "evt-1",
        promptText: "p",
        status: "pending",
        attempts: 0,
        maxAttempts: 3,
        enqueuedAtMs: Date.now() - 1,
        startedAtMs: null
      }
    ];
    const client = new FakeLlmScoringClient({
      responses: [{ pass: true, score: 3, reason: "good", raw: {} }]
    });
    const decisions: string[] = [];
    const deps = makeDeps(tasks, client, decisions);
    const worker = new LlmScoringWorker(deps, baseConfig());
    worker.start();
    await vi.advanceTimersByTimeAsync(200);
    expect(decisions).toContain("evt-1:approved");
    expect(tasks[0].status).toBe("succeeded");
    await worker.stop();
  });

  test("pass=false maps to review_required decision", async () => {
    const tasks: FakeTaskRow[] = [
      {
        id: "task-1",
        eventId: "evt-1",
        promptText: "p",
        status: "pending",
        attempts: 0,
        maxAttempts: 3,
        enqueuedAtMs: Date.now() - 1,
        startedAtMs: null
      }
    ];
    const client = new FakeLlmScoringClient({
      responses: [{ pass: false, score: 0, reason: "bad", raw: {} }]
    });
    const decisions: string[] = [];
    const deps = makeDeps(tasks, client, decisions);
    const worker = new LlmScoringWorker(deps, baseConfig());
    worker.start();
    await vi.advanceTimersByTimeAsync(200);
    expect(decisions).toContain("evt-1:review_required");
    await worker.stop();
  });

  test("retryable failure requeues with exponential backoff", async () => {
    const tasks: FakeTaskRow[] = [
      {
        id: "task-1",
        eventId: "evt-1",
        promptText: "p",
        status: "pending",
        attempts: 0,
        maxAttempts: 3,
        enqueuedAtMs: Date.now() - 1,
        startedAtMs: null
      }
    ];
    const client = new FakeLlmScoringClient({
      provider: () => {
        throw new LlmRetryableError("timeout");
      }
    });
    const decisions: string[] = [];
    const deps = makeDeps(tasks, client, decisions);
    const worker = new LlmScoringWorker(deps, baseConfig());
    worker.start();
    await vi.advanceTimersByTimeAsync(200);
    expect(deps.markTaskFailedRetry).toHaveBeenCalledWith(
      "task-1",
      2,
      expect.stringContaining("timeout")
    );
    expect(decisions).toHaveLength(0);
    await worker.stop();
  });

  test("non-retryable failure marks terminal and sets review_required", async () => {
    const tasks: FakeTaskRow[] = [
      {
        id: "task-1",
        eventId: "evt-1",
        promptText: "p",
        status: "pending",
        attempts: 0,
        maxAttempts: 3,
        enqueuedAtMs: Date.now() - 1,
        startedAtMs: null
      }
    ];
    const client = new FakeLlmScoringClient({
      provider: () => {
        throw new LlmNonRetryableError("json parse");
      }
    });
    const decisions: string[] = [];
    const deps = makeDeps(tasks, client, decisions);
    const worker = new LlmScoringWorker(deps, baseConfig());
    worker.start();
    await vi.advanceTimersByTimeAsync(200);
    expect(deps.markTaskFailedTerminal).toHaveBeenCalledWith(
      "task-1",
      expect.stringContaining("json parse")
    );
    expect(decisions).toContain("evt-1:review_required");
    await worker.stop();
  });

  test("retry attempts exhausted escalates to review_required", async () => {
    const tasks: FakeTaskRow[] = [
      {
        id: "task-1",
        eventId: "evt-1",
        promptText: "p",
        status: "pending",
        attempts: 2,
        maxAttempts: 3,
        enqueuedAtMs: Date.now() - 1,
        startedAtMs: null
      }
    ];
    const client = new FakeLlmScoringClient({
      provider: () => {
        throw new LlmRetryableError("still timing out");
      }
    });
    const decisions: string[] = [];
    const deps = makeDeps(tasks, client, decisions);
    const worker = new LlmScoringWorker(deps, baseConfig());
    worker.start();
    await vi.advanceTimersByTimeAsync(200);
    expect(deps.markTaskFailedTerminal).toHaveBeenCalled();
    expect(decisions).toContain("evt-1:review_required");
    await worker.stop();
  });

  test("getStatus reports running, concurrency, counts", async () => {
    const tasks: FakeTaskRow[] = [];
    const deps = makeDeps(tasks, new FakeLlmScoringClient({ responses: [] }), []);
    const worker = new LlmScoringWorker(
      deps,
      baseConfig({ concurrency: 3, pollIntervalMs: 200 })
    );
    worker.start();
    await vi.advanceTimersByTimeAsync(0);
    const status = worker.getStatus();
    expect(status.running).toBe(true);
    expect(status.concurrencyMax).toBe(3);
    expect(status.concurrencyInUse).toBe(0);
    expect(status.pendingCount).toBe(0);
    expect(status.runningCount).toBe(0);
    expect(status.reviewQueueDepth).toBe(0);
    await worker.stop();
    expect(worker.getStatus().running).toBe(false);
  });

  test("stop waits for in-flight work to finish", async () => {
    const tasks: FakeTaskRow[] = [
      {
        id: "task-1",
        eventId: "evt-1",
        promptText: "p",
        status: "pending",
        attempts: 0,
        maxAttempts: 3,
        enqueuedAtMs: Date.now() - 1,
        startedAtMs: null
      }
    ];
    const client = new FakeLlmScoringClient({
      responses: [{ pass: true, score: 3, reason: "ok", raw: {} }],
      delayMs: 100
    });
    const deps = makeDeps(tasks, client, []);
    const worker = new LlmScoringWorker(deps, baseConfig());
    worker.start();
    await vi.advanceTimersByTimeAsync(10);
    const stopPromise = worker.stop();
    await vi.advanceTimersByTimeAsync(200);
    await stopPromise;
    expect(worker.getStatus().running).toBe(false);
  });

  test("multiple pending tasks are processed in order", async () => {
    const tasks: FakeTaskRow[] = [
      {
        id: "task-1",
        eventId: "evt-1",
        promptText: "p1",
        status: "pending",
        attempts: 0,
        maxAttempts: 3,
        enqueuedAtMs: Date.now() - 2,
        startedAtMs: null
      },
      {
        id: "task-2",
        eventId: "evt-2",
        promptText: "p2",
        status: "pending",
        attempts: 0,
        maxAttempts: 3,
        enqueuedAtMs: Date.now() - 1,
        startedAtMs: null
      }
    ];
    const client = new FakeLlmScoringClient({
      responses: [
        { pass: true, score: 3, reason: "ok1", raw: {} },
        { pass: true, score: 3, reason: "ok2", raw: {} }
      ]
    });
    const decisions: string[] = [];
    const deps = makeDeps(tasks, client, decisions);
    const worker = new LlmScoringWorker(deps, baseConfig());
    worker.start();
    await vi.advanceTimersByTimeAsync(500);
    expect(decisions).toEqual(["evt-1:approved", "evt-2:approved"]);
    await worker.stop();
  });

  test("stopped worker does not claim more tasks", async () => {
    const tasks: FakeTaskRow[] = [
      {
        id: "task-1",
        eventId: "evt-1",
        promptText: "p1",
        status: "pending",
        attempts: 0,
        maxAttempts: 3,
        enqueuedAtMs: Date.now() - 1,
        startedAtMs: null
      }
    ];
    const client = new FakeLlmScoringClient({
      responses: [{ pass: true, score: 3, reason: "ok", raw: {} }]
    });
    const deps = makeDeps(tasks, client, []);
    const worker = new LlmScoringWorker(deps, baseConfig());
    worker.start();
    await worker.stop();
    const calls = (deps.claimNextPendingTask as ReturnType<typeof vi.fn>).mock.calls.length;
    await vi.advanceTimersByTimeAsync(500);
    expect(
      (deps.claimNextPendingTask as ReturnType<typeof vi.fn>).mock.calls.length
    ).toBe(calls);
  });

  test("drainOnce processes exactly one task and returns", async () => {
    const tasks: FakeTaskRow[] = [
      {
        id: "task-1",
        eventId: "evt-1",
        promptText: "p1",
        status: "pending",
        attempts: 0,
        maxAttempts: 3,
        enqueuedAtMs: Date.now() - 2,
        startedAtMs: null
      },
      {
        id: "task-2",
        eventId: "evt-2",
        promptText: "p2",
        status: "pending",
        attempts: 0,
        maxAttempts: 3,
        enqueuedAtMs: Date.now() - 1,
        startedAtMs: null
      }
    ];
    const client = new FakeLlmScoringClient({
      responses: [
        { pass: true, score: 5, reason: "great", raw: {} },
        { pass: true, score: 4, reason: "good", raw: {} }
      ]
    });
    const decisions: string[] = [];
    const deps = makeDeps(tasks, client, decisions);
    const worker = new LlmScoringWorker(deps, baseConfig());

    // drainOnce should process exactly one task without starting the loop
    await worker.drainOnce();

    expect(decisions).toEqual(["evt-1:approved"]);
    expect(tasks[0].status).toBe("succeeded");
    expect(tasks[1].status).toBe("pending");
    expect(deps.claimNextPendingTask).toHaveBeenCalledTimes(1);

    // Worker should NOT be running (drainOnce does not start the loop)
    expect(worker.getStatus().running).toBe(false);
  });
});
