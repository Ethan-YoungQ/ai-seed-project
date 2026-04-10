import { describe, it, expect, afterAll, vi } from "vitest";
import { createApp } from "../../../src/app.js";
import { NoActiveWindowError } from "../../../src/domain/v2/errors.js";

describe("POST /api/v2/periods/open", () => {
  const apps: Array<Awaited<ReturnType<typeof createApp>>> = [];

  afterAll(async () => {
    for (const a of apps) {
      await a.close();
    }
  });

  async function buildApp(openNewPeriodFn: (...args: unknown[]) => unknown) {
    const fakePeriodLifecycle = {
      openNewPeriod: vi.fn(openNewPeriodFn),
    };
    const app = await createApp({
      databaseUrl: ":memory:",
      periodLifecycle: fakePeriodLifecycle,
    });
    apps.push(app);
    return { app, fakePeriodLifecycle };
  }

  it("returns 201 with period info on success (no settlement)", async () => {
    const { app } = await buildApp(() => ({
      periodId: "p-2",
      assignedWindowId: "w-W1",
      shouldSettleWindowId: null,
    }));

    const res = await app.inject({
      method: "POST",
      url: "/api/v2/periods/open",
      payload: { number: 2 },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual({
      ok: true,
      periodId: "p-2",
      assignedWindowId: "w-W1",
      shouldSettleWindowId: null,
    });
  });

  it("returns 201 and echoes shouldSettleWindowId when settlement occurs", async () => {
    const { app } = await buildApp(() => ({
      periodId: "p-4",
      assignedWindowId: "w-W3",
      shouldSettleWindowId: "w-W1",
    }));

    const res = await app.inject({
      method: "POST",
      url: "/api/v2/periods/open",
      payload: { number: 4 },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.shouldSettleWindowId).toBe("w-W1");
  });

  it("returns 409 when openNewPeriod throws NoActiveWindowError", async () => {
    const { app } = await buildApp(() => {
      throw new NoActiveWindowError();
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/v2/periods/open",
      payload: { number: 3 },
    });

    expect(res.statusCode).toBe(409);
    const body = res.json();
    expect(body.ok).toBe(false);
    expect(body.code).toBe("no_active_window");
  });

  it("returns 400 invalid_body for non-integer number", async () => {
    const { app } = await buildApp(() => ({}));

    const res = await app.inject({
      method: "POST",
      url: "/api/v2/periods/open",
      payload: { number: "two" },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.ok).toBe(false);
    expect(body.code).toBe("invalid_body");
  });

  it("returns 400 invalid_body for period number out of range", async () => {
    const { app } = await buildApp(() => ({}));

    const res = await app.inject({
      method: "POST",
      url: "/api/v2/periods/open",
      payload: { number: 13 },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.ok).toBe(false);
    expect(body.code).toBe("invalid_body");
  });
});
