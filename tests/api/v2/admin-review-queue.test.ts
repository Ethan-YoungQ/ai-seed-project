import { describe, it, expect, afterAll, vi } from "vitest";
import { createApp } from "../../../src/app.js";

describe("Admin Review Queue (GET + POST)", () => {
  const apps: Array<Awaited<ReturnType<typeof createApp>>> = [];

  afterAll(async () => {
    for (const a of apps) {
      await a.close();
    }
  });

  async function buildApp(overrides?: {
    applyDecisionFn?: (...args: unknown[]) => unknown;
  }) {
    const fakeAggregator = {
      applyDecision: vi.fn(overrides?.applyDecisionFn ?? (() => ({}))),
    };
    const app = await createApp({
      databaseUrl: ":memory:",
      aggregator: fakeAggregator,
    });
    apps.push(app);
    return { app, fakeAggregator };
  }

  // --- GET /api/v2/admin/review-queue ---

  it("GET returns 401 when no admin header", async () => {
    const { app } = await buildApp();

    const res = await app.inject({
      method: "GET",
      url: "/api/v2/admin/review-queue",
    });

    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ ok: false, code: "no_identity" });
  });

  it("GET returns 403 for non-admin member", async () => {
    const { app } = await buildApp();

    const res = await app.inject({
      method: "GET",
      url: "/api/v2/admin/review-queue",
      headers: { "x-feishu-open-id": "ou-student-unknown" },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ ok: false, code: "not_admin" });
  });

  // --- POST /api/v2/admin/review-queue/:eventId ---

  it("POST returns 401 when no admin header", async () => {
    const { app } = await buildApp();

    const res = await app.inject({
      method: "POST",
      url: "/api/v2/admin/review-queue/evt-1",
      payload: { decision: "approved", note: "looks good" },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ ok: false, code: "no_identity" });
  });

  it("POST returns 400 for invalid decision enum value", async () => {
    const { app } = await buildApp();

    // Admin guard runs first, so without admin header, this returns 401
    const res = await app.inject({
      method: "POST",
      url: "/api/v2/admin/review-queue/evt-1",
      payload: { decision: "banana", note: "x" },
    });

    expect(res.statusCode).toBe(401);
  });

  it("POST returns 403 for non-admin member", async () => {
    const { app } = await buildApp();

    const res = await app.inject({
      method: "POST",
      url: "/api/v2/admin/review-queue/evt-1",
      payload: { decision: "approved", note: "ok" },
      headers: { "x-feishu-open-id": "ou-student-unknown" },
    });

    expect(res.statusCode).toBe(403);
  });
});
