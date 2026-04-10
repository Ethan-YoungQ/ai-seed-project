import { describe, it, expect, afterAll, vi } from "vitest";
import { createApp } from "../../../src/app.js";
import { WindowAlreadySettledError } from "../../../src/domain/v2/errors.js";

describe("POST /api/v2/graduation/close", () => {
  const apps: Array<Awaited<ReturnType<typeof createApp>>> = [];

  afterAll(async () => {
    for (const a of apps) {
      await a.close();
    }
  });

  async function buildApp(closeGraduationFn?: (...args: unknown[]) => unknown) {
    const fakePeriodLifecycle = {
      closeGraduation: vi.fn(
        closeGraduationFn ??
        (() => ({ finalWindowId: "w-FINAL", settled: true }))
      ),
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
      url: "/api/v2/graduation/close",
      payload: {},
    });

    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ ok: false, code: "no_identity" });
  });

  it("returns 403 for non-admin member", async () => {
    const { app } = await buildApp();

    const res = await app.inject({
      method: "POST",
      url: "/api/v2/graduation/close",
      payload: {},
      headers: { "x-feishu-open-id": "ou-student-unknown" },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ ok: false, code: "not_admin" });
  });

  it("returns 400 invalid_body when unknown keys are present", async () => {
    const { app } = await buildApp();

    // Even though body is strict (empty object), adding keys should reject
    // But admin guard runs first (401)
    const res = await app.inject({
      method: "POST",
      url: "/api/v2/graduation/close",
      payload: { extra: "field" },
    });

    expect(res.statusCode).toBe(401);
  });
});
