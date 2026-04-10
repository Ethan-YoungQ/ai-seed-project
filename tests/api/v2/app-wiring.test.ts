import { describe, it, expect, afterAll } from "vitest";
import { createApp } from "../../../src/app.js";

describe("createApp v2 dependency wiring", () => {
  const apps: Array<Awaited<ReturnType<typeof createApp>>> = [];

  afterAll(async () => {
    for (const a of apps) {
      await a.close();
    }
  });

  it("accepts v2 deps in options without breaking health check", async () => {
    const fakeIngestor = { ingest: () => ({}) };
    const fakeAggregator = { applyDecision: () => ({}) };
    const fakePeriodLifecycle = { openNewPeriod: () => ({}) };
    const fakeWindowSettler = { settle: () => ({}) };
    const fakeLlmWorker = { getStatus: () => ({}) };
    const fakeReactionTracker = { handleReaction: () => ({}) };
    const fakeMemberSync = { syncGroupMembers: async () => ({}) };

    const app = await createApp({
      databaseUrl: ":memory:",
      ingestor: fakeIngestor,
      aggregator: fakeAggregator,
      periodLifecycle: fakePeriodLifecycle,
      windowSettler: fakeWindowSettler,
      llmWorker: fakeLlmWorker,
      reactionTracker: fakeReactionTracker,
      memberSync: fakeMemberSync,
    });
    apps.push(app);

    const res = await app.inject({ method: "GET", url: "/api/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });

  it("accepts createApp without any v2 deps (defaults to null)", async () => {
    const app = await createApp({ databaseUrl: ":memory:" });
    apps.push(app);

    const res = await app.inject({ method: "GET", url: "/api/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });
});
