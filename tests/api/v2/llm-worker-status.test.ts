import { describe, it, expect, afterAll, vi } from "vitest";
import { createApp } from "../../../src/app.js";

describe("GET /api/v2/llm/worker/status", () => {
  const apps: Array<Awaited<ReturnType<typeof createApp>>> = [];

  afterAll(async () => {
    for (const a of apps) {
      await a.close();
    }
  });

  it("returns 200 with running worker status", async () => {
    const fakeLlmWorker = {
      getStatus: vi.fn(() => ({
        running: true,
        concurrency: 3,
        activeTasks: 1,
        queueDepth: 4,
        lastHeartbeatAt: "2026-04-10T10:00:00Z",
      })),
    };
    const app = await createApp({
      databaseUrl: ":memory:",
      llmWorker: fakeLlmWorker,
    });
    apps.push(app);

    const res = await app.inject({
      method: "GET",
      url: "/api/v2/llm/worker/status",
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.status).toEqual({
      running: true,
      concurrency: 3,
      activeTasks: 1,
      queueDepth: 4,
      lastHeartbeatAt: "2026-04-10T10:00:00Z",
    });
  });

  it("returns 200 with stopped worker status", async () => {
    const fakeLlmWorker = {
      getStatus: vi.fn(() => ({
        running: false,
        concurrency: 3,
        activeTasks: 0,
        queueDepth: 0,
        lastHeartbeatAt: null,
      })),
    };
    const app = await createApp({
      databaseUrl: ":memory:",
      llmWorker: fakeLlmWorker,
    });
    apps.push(app);

    const res = await app.inject({
      method: "GET",
      url: "/api/v2/llm/worker/status",
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.status.running).toBe(false);
    expect(body.status.activeTasks).toBe(0);
    expect(body.status.queueDepth).toBe(0);
    expect(body.status.lastHeartbeatAt).toBeNull();
  });
});
