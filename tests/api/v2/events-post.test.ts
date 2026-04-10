import { describe, it, expect, afterAll, vi } from "vitest";
import { createApp } from "../../../src/app.js";
import {
  NotEligibleError,
  PerPeriodCapExceededError,
  DuplicateEventError,
  NoActivePeriodError,
  IceBreakerPeriodError,
} from "../../../src/domain/v2/errors.js";

describe("POST /api/v2/events", () => {
  const apps: Array<Awaited<ReturnType<typeof createApp>>> = [];

  afterAll(async () => {
    for (const a of apps) {
      await a.close();
    }
  });

  async function buildApp(ingestFn: (...args: unknown[]) => unknown) {
    const fakeIngestor = { ingest: vi.fn(ingestFn) };
    const app = await createApp({
      databaseUrl: ":memory:",
      ingestor: fakeIngestor,
    });
    apps.push(app);
    return { app, fakeIngestor };
  }

  it("returns 202 with eventId on successful ingestion", async () => {
    const { app } = await buildApp(() => ({
      eventId: "evt-123",
      status: "approved",
    }));

    const res = await app.inject({
      method: "POST",
      url: "/api/v2/events",
      payload: {
        memberId: "m-1",
        itemCode: "K1",
        scoreDelta: 2,
        sourceRef: "card-123",
        payload: { note: "hi" },
      },
    });

    expect(res.statusCode).toBe(202);
    expect(res.json()).toEqual({ ok: true, eventId: "evt-123" });
  });

  it("returns 400 not_eligible when ingestor throws NotEligibleError", async () => {
    const { app } = await buildApp(() => {
      throw new NotEligibleError("m-1");
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/v2/events",
      payload: {
        memberId: "m-1",
        itemCode: "K1",
        sourceRef: "card-1",
      },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.ok).toBe(false);
    expect(body.code).toBe("not_eligible");
  });

  it("returns 400 cap_exceeded when ingestor throws PerPeriodCapExceededError", async () => {
    const { app } = await buildApp(() => {
      throw new PerPeriodCapExceededError("m-1", "K1", 3);
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/v2/events",
      payload: {
        memberId: "m-1",
        itemCode: "K1",
        sourceRef: "card-2",
      },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe("cap_exceeded");
  });

  it("returns 400 duplicate when ingestor throws DuplicateEventError", async () => {
    const { app } = await buildApp(() => {
      throw new DuplicateEventError("card-3");
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/v2/events",
      payload: {
        memberId: "m-1",
        itemCode: "K1",
        sourceRef: "card-3",
      },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe("duplicate");
  });

  it("returns 409 no_active_period when ingestor throws NoActivePeriodError", async () => {
    const { app } = await buildApp(() => {
      throw new NoActivePeriodError();
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/v2/events",
      payload: {
        memberId: "m-1",
        itemCode: "K1",
        sourceRef: "card-4",
      },
    });

    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe("no_active_period");
  });

  it("returns 409 ice_breaker_no_scoring when ingestor throws IceBreakerPeriodError", async () => {
    const { app } = await buildApp(() => {
      throw new IceBreakerPeriodError();
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/v2/events",
      payload: {
        memberId: "m-1",
        itemCode: "K1",
        sourceRef: "card-5",
      },
    });

    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe("ice_breaker_no_scoring");
  });

  it("returns 400 invalid_body for invalid body types", async () => {
    const { app } = await buildApp(() => ({}));

    const res = await app.inject({
      method: "POST",
      url: "/api/v2/events",
      payload: {
        memberId: 42,
        itemCode: null,
      },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.ok).toBe(false);
    expect(body.code).toBe("invalid_body");
    expect(body.details).toBeDefined();
  });

  it("returns 400 invalid_body when unknown keys are present (strict)", async () => {
    const { app } = await buildApp(() => ({}));

    const res = await app.inject({
      method: "POST",
      url: "/api/v2/events",
      payload: {
        memberId: "m-1",
        itemCode: "K1",
        sourceRef: "s",
        extra: "forbidden",
      },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.ok).toBe(false);
    expect(body.code).toBe("invalid_body");
  });
});
