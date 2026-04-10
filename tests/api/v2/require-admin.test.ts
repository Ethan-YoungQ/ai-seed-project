import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createApp, requireAdmin } from "../../../src/app.js";
import { SqliteRepository } from "../../../src/storage/sqlite-repository.js";

describe("requireAdmin middleware", () => {
  let app: Awaited<ReturnType<typeof createApp>>;
  let repository: SqliteRepository;

  beforeAll(async () => {
    repository = new SqliteRepository(":memory:");

    // Seed an operator and a student
    repository.ensureMember("ou-op-1", "camp-test");
    repository.updateMember("ou-op-1", { roleType: "operator" });
    repository.setMemberFeishuOpenId("ou-op-1", "ou-op-1");

    repository.ensureMember("ou-st-1", "camp-test");
    repository.updateMember("ou-st-1", { roleType: "student" });
    repository.setMemberFeishuOpenId("ou-st-1", "ou-st-1");

    app = await createApp({ databaseUrl: ":memory:" });

    // Register a throwaway route that uses requireAdmin
    app.get(
      "/_test/admin-required",
      { onRequest: requireAdmin(repository) },
      async (request) => {
        return {
          ok: true,
          currentAdmin: request.currentAdmin,
        };
      }
    );

    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    repository.close();
  });

  it("returns 401 when no x-feishu-open-id header is set", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/_test/admin-required",
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ ok: false, code: "no_identity" });
  });

  it("returns 403 when header is set but open id is unknown", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/_test/admin-required",
      headers: { "x-feishu-open-id": "ou-unknown-999" },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ ok: false, code: "not_admin" });
  });

  it("returns 403 when header is a student", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/_test/admin-required",
      headers: { "x-feishu-open-id": "ou-st-1" },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ ok: false, code: "not_admin" });
  });

  it("returns 200 and currentAdmin when header is an operator", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/_test/admin-required",
      headers: { "x-feishu-open-id": "ou-op-1" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.currentAdmin).toBeDefined();
    expect(body.currentAdmin.id).toBe("ou-op-1");
    expect(body.currentAdmin.roleType).toBe("operator");
  });

  it("returns 401 when header is an empty string", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/_test/admin-required",
      headers: { "x-feishu-open-id": "   " },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ ok: false, code: "no_identity" });
  });
});
