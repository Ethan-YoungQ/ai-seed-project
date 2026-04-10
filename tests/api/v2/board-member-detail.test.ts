import { describe, it, expect, afterAll } from "vitest";
import { createApp } from "../../../src/app.js";
import { SqliteRepository } from "../../../src/storage/sqlite-repository.js";

describe("GET /api/v2/board/member/:id", () => {
  const apps: Array<Awaited<ReturnType<typeof createApp>>> = [];

  afterAll(async () => {
    for (const a of apps) {
      await a.close();
    }
  });

  it("returns 404 for unknown member id", async () => {
    const app = await createApp({ databaseUrl: ":memory:" });
    apps.push(app);
    await app.inject({ method: "POST", url: "/api/demo/seed" });

    const res = await app.inject({
      method: "GET",
      url: "/api/v2/board/member/m-ghost",
    });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ ok: false, code: "not_found" });
  });

  it("returns 404 for operator member id (not eligible)", async () => {
    const app = await createApp({ databaseUrl: ":memory:" });
    apps.push(app);
    await app.inject({ method: "POST", url: "/api/demo/seed" });

    const res = await app.inject({
      method: "GET",
      url: "/api/v2/board/member/user-ops",
    });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ ok: false, code: "not_found" });
  });

  it("returns 200 with detail for eligible student", async () => {
    const app = await createApp({ databaseUrl: ":memory:" });
    apps.push(app);
    await app.inject({ method: "POST", url: "/api/demo/seed" });

    const res = await app.inject({
      method: "GET",
      url: "/api/v2/board/member/user-alice",
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.detail).toBeDefined();
    expect(body.detail.memberId).toBe("user-alice");
    expect(body.detail.promotions).toBeDefined();
    expect(Array.isArray(body.detail.promotions)).toBe(true);
    expect(body.detail.dimensionSeries).toBeDefined();
    expect(body.detail.windowSnapshots).toBeDefined();
  });

  it("handles URL-encoded member id", async () => {
    const app = await createApp({ databaseUrl: ":memory:" });
    apps.push(app);
    await app.inject({ method: "POST", url: "/api/demo/seed" });

    // URL encode "user-alice" -> "user%2Dalice"
    const res = await app.inject({
      method: "GET",
      url: "/api/v2/board/member/user%2Dalice",
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.detail.memberId).toBe("user-alice");
  });
});

describe("fetchMemberBoardDetail repository method", () => {
  it("returns null for non-existent member", () => {
    const repo = new SqliteRepository(":memory:");
    repo.seedDemo();
    const result = repo.fetchMemberBoardDetail("m-ghost");
    expect(result).toBeNull();
    repo.close();
  });

  it("returns null for operator member", () => {
    const repo = new SqliteRepository(":memory:");
    repo.seedDemo();
    const result = repo.fetchMemberBoardDetail("user-ops");
    expect(result).toBeNull();
    repo.close();
  });

  it("returns detail with empty promotions for student without promotions", () => {
    const repo = new SqliteRepository(":memory:");
    repo.seedDemo();
    const result = repo.fetchMemberBoardDetail("user-alice");
    expect(result).not.toBeNull();
    expect(result!.memberId).toBe("user-alice");
    expect(result!.promotions).toEqual([]);
    expect(result!.dimensionSeries).toEqual([]);
    expect(result!.windowSnapshots).toEqual([]);
    repo.close();
  });
});
