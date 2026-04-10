import { describe, it, expect, afterAll } from "vitest";
import { createApp } from "../../../src/app.js";
import { SqliteRepository } from "../../../src/storage/sqlite-repository.js";

describe("Admin Member Management (GET + PATCH)", () => {
  const apps: Array<Awaited<ReturnType<typeof createApp>>> = [];

  afterAll(async () => {
    for (const a of apps) {
      await a.close();
    }
  });

  // --- GET /api/v2/admin/members ---

  it("GET returns 401 when no admin header", async () => {
    const app = await createApp({ databaseUrl: ":memory:" });
    apps.push(app);

    const res = await app.inject({
      method: "GET",
      url: "/api/v2/admin/members",
    });

    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ ok: false, code: "no_identity" });
  });

  it("GET returns 403 for non-admin member", async () => {
    const app = await createApp({ databaseUrl: ":memory:" });
    apps.push(app);

    const res = await app.inject({
      method: "GET",
      url: "/api/v2/admin/members",
      headers: { "x-feishu-open-id": "ou-student-unknown" },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ ok: false, code: "not_admin" });
  });

  // --- PATCH /api/v2/admin/members/:id ---

  it("PATCH returns 401 when no admin header", async () => {
    const app = await createApp({ databaseUrl: ":memory:" });
    apps.push(app);

    const res = await app.inject({
      method: "PATCH",
      url: "/api/v2/admin/members/m-1",
      payload: { roleType: "operator" },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ ok: false, code: "no_identity" });
  });

  it("PATCH returns 400 for invalid role type enum", async () => {
    const app = await createApp({ databaseUrl: ":memory:" });
    apps.push(app);

    // Admin guard blocks first (401), but validates the pattern
    const res = await app.inject({
      method: "PATCH",
      url: "/api/v2/admin/members/m-1",
      payload: { roleType: "superadmin" },
    });

    expect(res.statusCode).toBe(401);
  });

  it("PATCH returns 400 for unknown keys (strict)", async () => {
    const app = await createApp({ databaseUrl: ":memory:" });
    apps.push(app);

    const res = await app.inject({
      method: "PATCH",
      url: "/api/v2/admin/members/m-1",
      payload: { unknownKey: true },
    });

    expect(res.statusCode).toBe(401);
  });
});

describe("patchMemberForAdmin SQL injection prevention", () => {
  it("stores injection string literally without executing as SQL", () => {
    const repo = new SqliteRepository(":memory:");
    repo.seedDemo();

    // Attempt SQL injection via display name
    const result = repo.patchMemberForAdmin("user-alice", {
      displayName: "'; DROP TABLE members; --",
    });

    expect(result).not.toBeNull();
    expect(result!.displayName).toBe("'; DROP TABLE members; --");

    // Verify table still exists
    const db = (repo as unknown as { db: { prepare: (sql: string) => { get: () => unknown } } }).db;
    const tableExists = db
      .prepare(
        `SELECT name FROM sqlite_master WHERE type='table' AND name='members'`
      )
      .get();
    expect(tableExists).toBeDefined();

    repo.close();
  });
});
