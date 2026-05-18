import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, it, expect, afterAll, afterEach, vi } from "vitest";
import { createApp } from "../../../src/app.js";
import type {
  AiBootEventRecord,
  AiBootScoreEventRecord,
} from "../../../src/domain/v3/ai-boot-types.js";
import { SqliteRepository } from "../../../src/storage/sqlite-repository.js";

function databasePath() {
  return join(mkdtempSync(join(tmpdir(), "board-detail-")), "test.db");
}

function aiBootEvent(
  memberId: string,
  overrides: Partial<AiBootEventRecord> = {}
): AiBootEventRecord {
  const id = overrides.id ?? `evt-${memberId}`;
  return {
    id,
    campId: "demo-camp",
    chatId: "chat-1",
    memberId,
    sourceMessageId: `om-${id}`,
    eventType: "text",
    rawText: "hello",
    sanitizedText: "hello",
    attachmentJson: "[]",
    evidenceJson: "{}",
    contentHash: `hash-${id}`,
    status: "received",
    engineVersion: "v3.0.0",
    rulesetVersion: "2026-05-16",
    createdAt: "2026-05-16T00:00:00.000Z",
    ...overrides,
  };
}

function aiBootScoreEvent(
  memberId: string,
  overrides: Partial<AiBootScoreEventRecord> = {}
): AiBootScoreEventRecord {
  const eventId = overrides.eventId ?? `evt-${memberId}`;
  return {
    id: `score-${eventId}`,
    eventId,
    campId: "demo-camp",
    memberId,
    category: "ai_artifact",
    scoreDelta: 1,
    confidence: "high",
    status: "approved",
    notifyPolicy: "group_praise",
    reason: "approved score",
    evidence: "message",
    badgesJson: "[]",
    modelProvider: "fake",
    modelName: "fake",
    promptVersion: "none",
    reviewedByOpId: null,
    reviewNote: null,
    decidedAt: "2026-05-16T00:01:00.000Z",
    ...overrides,
  };
}

describe("GET /api/v2/board/member/:id", () => {
  const apps: Array<Awaited<ReturnType<typeof createApp>>> = [];

  afterAll(async () => {
    for (const a of apps) {
      await a.close();
    }
  });

  afterEach(() => {
    vi.unstubAllEnvs();
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

  it.each(["legacy", "v3_shadow"] as const)(
    "keeps v2 cumulative detail in %s mode even when AI Boot rows exist",
    async (engineMode) => {
      vi.stubEnv("AI_BOOT_ENGINE_MODE", engineMode);
      const dbPath = databasePath();
      const repo = new SqliteRepository(dbPath);
      repo.seedDemo();
      const db = (repo as unknown as {
        db: { prepare: (sql: string) => { run: (...args: unknown[]) => void } };
      }).db;
      db.prepare(
        `INSERT INTO v2_window_snapshots (id, window_id, member_id, window_aq, cumulative_aq, k_score, h_score, c_score, s_score, g_score, growth_bonus, snapshot_at)
         VALUES ('snap-alice-shadow', 'w-W1', 'user-alice', 33, 33, 10, 10, 5, 5, 3, 0, '2026-04-01T00:00:00Z')`
      ).run();
      repo.upsertAiBootLegacyScoreSnapshot({
        id: "legacy-alice-shadow",
        campId: "camp-demo",
        memberId: "user-alice",
        totalScore: 12,
        dimensionJson: "{}",
        sourceNote: "test",
        snapshotAt: "2026-05-16T00:00:00.000Z",
      });
      repo.insertAiBootEvent(
        aiBootEvent("user-alice", { id: "evt-alice-shadow", campId: "camp-demo" })
      );
      repo.insertAiBootScoreEvent(
        aiBootScoreEvent("user-alice", {
          id: "score-alice-shadow",
          eventId: "evt-alice-shadow",
          campId: "camp-demo",
          scoreDelta: 8,
        })
      );
      repo.close();

      const app = await createApp({ databaseUrl: dbPath });
      apps.push(app);

      const res = await app.inject({
        method: "GET",
        url: "/api/v2/board/member/user-alice",
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.detail).toMatchObject({
        memberId: "user-alice",
        cumulativeAq: 33,
      });
      expect(body.detail).not.toHaveProperty("legacyScore");
      expect(body.detail).not.toHaveProperty("v3Score");
      expect(body.detail).not.toHaveProperty("totalScore");
    }
  );

  it("adds legacy and v3 score fields in v3_live when snapshots are complete", async () => {
    vi.stubEnv("AI_BOOT_ENGINE_MODE", "v3_live");
    const dbPath = databasePath();
    const repo = new SqliteRepository(dbPath);
    repo.seedDemo();
    repo.upsertAiBootLegacyScoreSnapshot({
      id: "legacy-alice",
      campId: "camp-demo",
      memberId: "user-alice",
      totalScore: 12,
      dimensionJson: "{}",
      sourceNote: "test",
      snapshotAt: "2026-05-16T00:00:00.000Z",
    });
    repo.insertAiBootEvent(
      aiBootEvent("user-alice", { id: "evt-alice-a", campId: "camp-demo" })
    );
    repo.insertAiBootScoreEvent(
      aiBootScoreEvent("user-alice", {
        id: "score-alice-a",
        eventId: "evt-alice-a",
        campId: "camp-demo",
        scoreDelta: 8,
      })
    );
    repo.close();

    const app = await createApp({ databaseUrl: dbPath });
    apps.push(app);

    const res = await app.inject({
      method: "GET",
      url: "/api/v2/board/member/user-alice",
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.detail).toMatchObject({
      memberId: "user-alice",
      cumulativeAq: 20,
      legacyScore: 12,
      v3Score: 8,
      totalScore: 20,
    });
    expect(body.detail.windowSnapshots).toEqual([]);
    expect(body.detail.dimensions).toEqual({ K: 0, H: 0, C: 8, S: 0, G: 0 });
  });

  it("keeps v2 detail in v3_live when legacy snapshots are incomplete", async () => {
    vi.stubEnv("AI_BOOT_ENGINE_MODE", "v3_live");
    const dbPath = databasePath();
    const repo = new SqliteRepository(dbPath);
    repo.seedDemo();
    const db = (repo as unknown as {
      db: { prepare: (sql: string) => { run: (...args: unknown[]) => void } };
    }).db;
    db.prepare(
      `INSERT INTO v2_window_snapshots (id, window_id, member_id, window_aq, cumulative_aq, k_score, h_score, c_score, s_score, g_score, growth_bonus, snapshot_at)
       VALUES ('snap-alice', 'w-W1', 'user-alice', 33, 33, 10, 10, 5, 5, 3, 0, '2026-04-01T00:00:00Z')`
    ).run();
    repo.insertAiBootEvent(
      aiBootEvent("user-alice", { id: "evt-alice-plus", campId: "camp-demo" })
    );
    repo.insertAiBootScoreEvent(
      aiBootScoreEvent("user-alice", {
        id: "score-alice-plus",
        eventId: "evt-alice-plus",
        campId: "camp-demo",
        scoreDelta: 5,
      })
    );
    repo.insertAiBootEvent(
      aiBootEvent("user-alice", { id: "evt-alice-minus", campId: "camp-demo" })
    );
    repo.insertAiBootScoreEvent(
      aiBootScoreEvent("user-alice", {
        id: "score-alice-minus",
        eventId: "evt-alice-minus",
        campId: "camp-demo",
        category: "operator_adjustment",
        scoreDelta: -5,
      })
    );
    repo.close();

    const app = await createApp({ databaseUrl: dbPath });
    apps.push(app);

    const res = await app.inject({
      method: "GET",
      url: "/api/v2/board/member/user-alice",
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.detail).toMatchObject({
      memberId: "user-alice",
      cumulativeAq: 33,
    });
    expect(body.detail).not.toHaveProperty("legacyScore");
    expect(body.detail).not.toHaveProperty("v3Score");
    expect(body.detail).not.toHaveProperty("totalScore");
    expect(body.detail.windowSnapshots).toHaveLength(1);
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
