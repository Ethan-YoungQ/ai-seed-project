import { Semaphore } from "./semaphore.js";
import { TokenBucket } from "./token-bucket.js";
import {
  LlmNonRetryableError,
  LlmRetryableError
} from "../../domain/v2/errors.js";
import type {
  LlmScoringClient,
  LlmScoringResult
} from "./llm-scoring-client.js";

export interface WorkerConfig {
  concurrency: number;
  rateLimitPerSec: number;
  pollIntervalMs: number;
  taskTimeoutMs: number;
  maxAttempts: number;
}

export interface WorkerClaimedTask {
  id: string;
  eventId: string;
  promptText: string;
  attempts: number;
  maxAttempts: number;
}

export interface WorkerAggregator {
  applyDecision(
    eventId: string,
    decision: "approved" | "rejected" | "review_required",
    note?: string
  ): void;
}

export interface WorkerRecentFailure {
  eventId: string;
  errorReason: string;
  at: string;
}

export interface WorkerDeps {
  claimNextPendingTask(): WorkerClaimedTask | null;
  markTaskSucceeded(taskId: string, result: LlmScoringResult): void;
  markTaskFailedRetry(taskId: string, backoffSec: number, reason: string): void;
  markTaskFailedTerminal(taskId: string, reason: string): void;
  requeueStaleRunningTasks(olderThanMs: number): number;
  countPending(): number;
  countRunning(): number;
  countSucceededLastHour(): number;
  countFailedLastHour(): number;
  reviewQueueDepth(): number;
  recentFailureSummary(): WorkerRecentFailure[];
  aggregator: WorkerAggregator;
  llmClient: LlmScoringClient;
}

export interface WorkerStatus {
  running: boolean;
  concurrencyInUse: number;
  concurrencyMax: number;
  pendingCount: number;
  runningCount: number;
  succeededLast1h: number;
  failedLast1h: number;
  reviewQueueDepth: number;
  avgLatencyMs: number;
  recentFailures: WorkerRecentFailure[];
}

export class LlmScoringWorker {
  private readonly semaphore: Semaphore;
  private readonly tokenBucket: TokenBucket;
  private _running: boolean = false;
  private stopRequested: boolean = false;
  private loopPromise: Promise<void> | null = null;
  private inFlight: Set<Promise<void>> = new Set();
  private latencySamples: number[] = [];
  private wakeSleep: (() => void) | null = null;

  constructor(
    private readonly deps: WorkerDeps,
    private readonly config: WorkerConfig
  ) {
    this.semaphore = new Semaphore(config.concurrency);
    this.tokenBucket = new TokenBucket(
      config.rateLimitPerSec,
      config.rateLimitPerSec
    );
  }

  start(): void {
    if (this._running) {
      return;
    }
    this._running = true;
    this.stopRequested = false;
    this.deps.requeueStaleRunningTasks(2 * this.config.taskTimeoutMs);
    this.loopPromise = this.loop();
  }

  async stop(): Promise<void> {
    this.stopRequested = true;
    if (this.wakeSleep) {
      this.wakeSleep();
    }
    if (this.loopPromise) {
      await this.loopPromise;
    }
    if (this.inFlight.size > 0) {
      await Promise.all([...this.inFlight]);
    }
    this._running = false;
  }

  getStatus(): WorkerStatus {
    const avgLatencyMs =
      this.latencySamples.length === 0
        ? 0
        : Math.round(
            this.latencySamples.reduce((acc, v) => acc + v, 0) /
              this.latencySamples.length
          );
    return {
      running: this._running,
      concurrencyInUse: this.semaphore.inFlight,
      concurrencyMax: this.semaphore.max,
      pendingCount: this.deps.countPending(),
      runningCount: this.deps.countRunning(),
      succeededLast1h: this.deps.countSucceededLastHour(),
      failedLast1h: this.deps.countFailedLastHour(),
      reviewQueueDepth: this.deps.reviewQueueDepth(),
      avgLatencyMs,
      recentFailures: this.deps.recentFailureSummary()
    };
  }

  /**
   * Testing hook: processes all currently pending tasks synchronously
   * (one poll cycle), then returns. Does NOT start the background loop.
   * Used by Phase H4 E2E test to advance the worker deterministically.
   */
  async drainOnce(): Promise<void> {
    const task = this.deps.claimNextPendingTask();
    if (!task) return;
    await this.processTask(task);
  }

  private async loop(): Promise<void> {
    while (!this.stopRequested) {
      const task = this.deps.claimNextPendingTask();
      if (!task) {
        await this.sleep(this.config.pollIntervalMs);
        continue;
      }
      await this.semaphore.acquire();
      await this.tokenBucket.acquire();
      const work = this.processTask(task).finally(() => {
        this.semaphore.release();
        this.inFlight.delete(work);
      });
      this.inFlight.add(work);
    }
  }

  private async processTask(task: WorkerClaimedTask): Promise<void> {
    const startedAt = Date.now();
    try {
      const result = await this.deps.llmClient.score(task.promptText, {
        timeoutMs: this.config.taskTimeoutMs
      });
      this.recordLatency(Date.now() - startedAt);
      this.deps.markTaskSucceeded(task.id, result);
      const decision = result.pass ? "approved" : "review_required";
      this.deps.aggregator.applyDecision(task.eventId, decision, result.reason);
    } catch (error) {
      this.recordLatency(Date.now() - startedAt);
      this.handleFailure(task, error);
    }
  }

  private handleFailure(task: WorkerClaimedTask, error: unknown): void {
    const reason = error instanceof Error ? error.message : String(error);
    const isRetryable = error instanceof LlmRetryableError;
    const isNonRetryable = error instanceof LlmNonRetryableError;

    if (isRetryable && task.attempts < task.maxAttempts) {
      const backoffSec = 2 ** task.attempts;
      this.deps.markTaskFailedRetry(task.id, backoffSec, reason);
      return;
    }

    const terminalReason = isNonRetryable
      ? `llm_non_retryable: ${reason}`
      : `llm_exhausted: ${reason}`;
    this.deps.markTaskFailedTerminal(task.id, terminalReason);
    this.deps.aggregator.applyDecision(
      task.eventId,
      "review_required",
      terminalReason
    );
  }

  private recordLatency(ms: number): void {
    this.latencySamples.push(ms);
    if (this.latencySamples.length > 100) {
      this.latencySamples.shift();
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        this.wakeSleep = null;
        resolve();
      }, ms);
      this.wakeSleep = () => {
        clearTimeout(timer);
        this.wakeSleep = null;
        resolve();
      };
    });
  }
}
