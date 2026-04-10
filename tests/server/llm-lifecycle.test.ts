import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  startLlmWorker,
  stopLlmWorker,
  resetStoppingLatch,
} from "../../src/server-lifecycle.js";

function makeMockWorker() {
  const calls: string[] = [];
  return {
    calls,
    start: vi.fn(() => {
      calls.push("start");
    }),
    stop: vi.fn(async () => {
      calls.push("stop");
    }),
  };
}

describe("LLM worker lifecycle", () => {
  beforeEach(() => {
    resetStoppingLatch();
  });

  it("startLlmWorker calls worker.start exactly once", () => {
    const worker = makeMockWorker();
    startLlmWorker({ llmWorker: worker });
    expect(worker.start.mock.calls.length).toBe(1);
  });

  it("stopLlmWorker calls worker.stop then app.close, in that order", async () => {
    const worker = makeMockWorker();
    const closeCalls: string[] = [];
    const app = {
      close: vi.fn(async () => {
        closeCalls.push("close");
      }),
    };

    await stopLlmWorker(
      app as unknown as Parameters<typeof stopLlmWorker>[0],
      { llmWorker: worker }
    );

    expect(worker.stop.mock.calls.length).toBe(1);
    expect(app.close.mock.calls.length).toBe(1);
    // stop must be called before close
    expect(worker.calls[0]).toBe("stop");
  });

  it("stopLlmWorker is idempotent — double call does not double-invoke stop", async () => {
    const worker = makeMockWorker();
    const app = {
      close: vi.fn(async () => {}),
    };

    const p1 = stopLlmWorker(
      app as unknown as Parameters<typeof stopLlmWorker>[0],
      { llmWorker: worker }
    );
    const p2 = stopLlmWorker(
      app as unknown as Parameters<typeof stopLlmWorker>[0],
      { llmWorker: worker }
    );
    await Promise.all([p1, p2]);

    expect(worker.stop.mock.calls.length).toBe(1);
  });
});
