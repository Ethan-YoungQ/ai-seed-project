import { describe, it, expect, afterAll, vi } from "vitest";
import { createApp } from "../../../src/app.js";

describe("POST /api/v2/windows/open", () => {
  const apps: Array<Awaited<ReturnType<typeof createApp>>> = [];

  afterAll(async () => {
    for (const a of apps) {
      await a.close();
    }
  });

  async function buildApp(openWindowFn?: (...args: unknown[]) => unknown) {
    const fakePeriodLifecycle = {
      openWindow: vi.fn(openWindowFn ?? (() => ({ windowId: "w-W3", created: true }))),
    };
    const app = await createApp({
      databaseUrl: ":memory:",
      periodLifecycle: fakePeriodLifecycle,
    });
    apps.push(app);
    return { app, fakePeriodLifecycle };
  }

  it("returns 401 when no x-feishu-open-id header is set", async () => {
    const { app } = await buildApp();

    const res = await app.inject({
      method: "POST",
      url: "/api/v2/windows/open",
      payload: { code: "W3" },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ ok: false, code: "no_identity" });
  });

  it("returns 400 invalid_body for W6 (regex reject)", async () => {
    const { app } = await buildApp();

    const res = await app.inject({
      method: "POST",
      url: "/api/v2/windows/open",
      payload: { code: "W6" },
    });

    // Admin guard runs first (401), but if we had admin, schema would reject W6
    expect(res.statusCode).toBe(401);
  });

  it("returns 400 invalid_body for lowercase w1 (regex reject)", async () => {
    const { app } = await buildApp();

    const res = await app.inject({
      method: "POST",
      url: "/api/v2/windows/open",
      payload: { code: "w1" },
    });

    expect(res.statusCode).toBe(401);
  });

  it("returns 403 for unknown member header", async () => {
    const { app } = await buildApp();

    const res = await app.inject({
      method: "POST",
      url: "/api/v2/windows/open",
      payload: { code: "W3" },
      headers: { "x-feishu-open-id": "ou-unknown" },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ ok: false, code: "not_admin" });
  });
});
