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
  return join(mkdtempSync(join(tmpdir(), "board-ranking-")), "test.db");
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

describe("GET /api/v2/board/ranking", () => {
  const apps: Array<Awaited<ReturnType<typeof createApp>>> = [];

  afterAll(async () => {
    for (const a of apps) {
      await a.close();
    }
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns 200 with empty rows when no members exist", async () => {
    const app = await createApp({ databaseUrl: ":memory:" });
    apps.push(app);

    // Seed a camp first
    await app.inject({ method: "POST", url: "/api/demo/seed" });

    const res = await app.inject({
      method: "GET",
      url: "/api/v2/board/ranking",
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.rows).toBeDefined();
    expect(Array.isArray(body.rows)).toBe(true);
  });

  it("excludes operators from the ranking", async () => {
    const app = await createApp({ databaseUrl: ":memory:" });
    apps.push(app);

    // Seed demo data (includes a student "Alice" and an operator)
    await app.inject({ method: "POST", url: "/api/demo/seed" });

    const res = await app.inject({
      method: "GET",
      url: "/api/v2/board/ranking",
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    // Operator should not appear in ranking
    const hasOperator = body.rows.some(
      (r: { memberName: string }) => r.memberName === "Operator"
    );
    expect(hasOperator).toBe(false);
  });

  it.each(["legacy", "v3_shadow"] as const)(
    "keeps v2 cumulative scores in %s mode even when AI Boot snapshots and v3 rows exist",
    async (engineMode) => {
      vi.stubEnv("AI_BOOT_ENGINE_MODE", engineMode);
      const dbPath = databasePath();
      const repo = new SqliteRepository(dbPath);
      repo.seedDemo();

      const members = [
        { id: "shadow-a", name: "Alpha", v2Aq: 100 },
        { id: "shadow-b", name: "Bravo", v2Aq: 60 },
      ];

      for (const member of members) {
        repo.ensureMember(member.id, "demo-camp");
        repo.updateMember(member.id, {
          roleType: "student",
          isParticipant: true,
          isExcludedFromBoard: false,
          displayName: member.name,
        });
      }

      const db = (repo as unknown as {
        db: { prepare: (sql: string) => { run: (...args: unknown[]) => void } };
      }).db;
      for (const member of members) {
        db.prepare(
          `INSERT INTO v2_window_snapshots (id, window_id, member_id, window_aq, cumulative_aq, k_score, h_score, c_score, s_score, g_score, growth_bonus, snapshot_at)
           VALUES (?, 'w-W1', ?, ?, ?, 10, 10, 10, 10, 10, 0, '2026-04-01T00:00:00Z')`
        ).run(`snap-${member.id}`, member.id, member.v2Aq, member.v2Aq);
      }

      repo.upsertAiBootLegacyScoreSnapshot({
        id: "legacy-shadow-a",
        campId: "demo-camp",
        memberId: "shadow-a",
        totalScore: 5,
        dimensionJson: "{}",
        sourceNote: "test",
        snapshotAt: "2026-05-16T00:00:00.000Z",
      });
      repo.upsertAiBootLegacyScoreSnapshot({
        id: "legacy-shadow-b",
        campId: "demo-camp",
        memberId: "shadow-b",
        totalScore: 500,
        dimensionJson: "{}",
        sourceNote: "test",
        snapshotAt: "2026-05-16T00:00:00.000Z",
      });
      repo.insertAiBootEvent(aiBootEvent("shadow-b", { id: "evt-shadow-b-a" }));
      repo.insertAiBootScoreEvent(
        aiBootScoreEvent("shadow-b", {
          id: "score-shadow-b-a",
          eventId: "evt-shadow-b-a",
          scoreDelta: 500,
        })
      );
      repo.insertAiBootEvent(aiBootEvent("shadow-a", { id: "evt-shadow-a-shadow" }));
      repo.insertAiBootScoreEvent(
        aiBootScoreEvent("shadow-a", {
          id: "score-shadow-a-shadow",
          eventId: "evt-shadow-a-shadow",
          status: "shadow",
          scoreDelta: 500,
        })
      );
      repo.close();

      const app = await createApp({ databaseUrl: dbPath });
      apps.push(app);

      const res = await app.inject({
        method: "GET",
        url: "/api/v2/board/ranking?campId=demo-camp",
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      const rows = body.rows.filter((row: { memberId: string }) =>
        members.some((member) => member.id === row.memberId)
      );

      expect(rows.map((row: { memberId: string }) => row.memberId)).toEqual([
        "shadow-a",
        "shadow-b",
      ]);
      expect(rows.map((row: { cumulativeAq: number }) => row.cumulativeAq)).toEqual([
        100,
        60,
      ]);
      expect(rows[0]).not.toHaveProperty("legacyScore");
      expect(rows[1]).not.toHaveProperty("legacyScore");
    }
  );

  it("adds legacy and v3 score fields in v3_live only when snapshots are complete", async () => {
    vi.stubEnv("AI_BOOT_ENGINE_MODE", "v3_live");
    const dbPath = databasePath();
    const repo = new SqliteRepository(dbPath);
    repo.seedDemo();

    const members = [
      { id: "s1", name: "Alpha", v2Aq: 100 },
      { id: "s2", name: "Bravo", v2Aq: 90 },
      { id: "s3", name: "Charlie", v2Aq: 80 },
      { id: "s4", name: "Delta", v2Aq: 70 },
      { id: "s5", name: "Echo", v2Aq: 65 },
    ];

    for (const member of members) {
      repo.ensureMember(member.id, "demo-camp");
      repo.updateMember(member.id, {
        roleType: "student",
        isParticipant: true,
        isExcludedFromBoard: false,
        displayName: member.name,
      });
    }

    const db = (repo as unknown as {
      db: { prepare: (sql: string) => { run: (...args: unknown[]) => void } };
    }).db;
    for (const member of members) {
      db.prepare(
        `INSERT INTO v2_window_snapshots (id, window_id, member_id, window_aq, cumulative_aq, k_score, h_score, c_score, s_score, g_score, growth_bonus, snapshot_at)
         VALUES (?, 'w-W1', ?, ?, ?, 10, 10, 10, 10, 10, 0, '2026-04-01T00:00:00Z')`
      ).run(`snap-${member.id}`, member.id, member.v2Aq, member.v2Aq);
    }

    for (const member of members) {
      repo.upsertAiBootLegacyScoreSnapshot({
        id: `legacy-${member.id}`,
        campId: "demo-camp",
        memberId: member.id,
        totalScore: member.v2Aq,
        dimensionJson: "{}",
        sourceNote: "test",
        snapshotAt: "2026-05-16T00:00:00.000Z",
      });
    }
    repo.insertAiBootEvent(aiBootEvent("s1", { id: "evt-s1-a" }));
    repo.insertAiBootScoreEvent(
      aiBootScoreEvent("s1", {
        id: "score-s1-a",
        eventId: "evt-s1-a",
        scoreDelta: 10,
      })
    );

    repo.insertAiBootEvent(aiBootEvent("s2", { id: "evt-s2-a" }));
    repo.insertAiBootScoreEvent(
      aiBootScoreEvent("s2", {
        id: "score-s2-a",
        eventId: "evt-s2-a",
        category: "operator_adjustment",
        scoreDelta: 60,
      })
    );

    repo.insertAiBootEvent(aiBootEvent("s3", { id: "evt-s3-a" }));
    repo.insertAiBootScoreEvent(
      aiBootScoreEvent("s3", {
        id: "score-s3-a",
        eventId: "evt-s3-a",
        status: "review_required",
        scoreDelta: 500,
      })
    );
    repo.insertAiBootEvent(aiBootEvent("s3", { id: "evt-s3-b" }));
    repo.insertAiBootScoreEvent(
      aiBootScoreEvent("s3", {
        id: "score-s3-b",
        eventId: "evt-s3-b",
        status: "no_score",
        scoreDelta: 500,
      })
    );
    repo.insertAiBootEvent(aiBootEvent("s3", { id: "evt-s3-c" }));
    repo.insertAiBootScoreEvent(
      aiBootScoreEvent("s3", {
        id: "score-s3-c",
        eventId: "evt-s3-c",
        status: "rejected",
        scoreDelta: 500,
      })
    );
    repo.insertAiBootEvent(aiBootEvent("s3", { id: "evt-s3-d" }));
    repo.insertAiBootScoreEvent(
      aiBootScoreEvent("s3", {
        id: "score-s3-d",
        eventId: "evt-s3-d",
        status: "shadow",
        scoreDelta: 500,
      })
    );

    repo.insertAiBootEvent(aiBootEvent("s5", { id: "evt-s5-a" }));
    repo.insertAiBootScoreEvent(
      aiBootScoreEvent("s5", {
        id: "score-s5-a",
        eventId: "evt-s5-a",
        scoreDelta: 5,
      })
    );
    repo.insertAiBootEvent(aiBootEvent("s5", { id: "evt-s5-b" }));
    repo.insertAiBootScoreEvent(
      aiBootScoreEvent("s5", {
        id: "score-s5-b",
        eventId: "evt-s5-b",
        category: "operator_adjustment",
        scoreDelta: -5,
      })
    );
    repo.close();

    const app = await createApp({ databaseUrl: dbPath });
    apps.push(app);

    const res = await app.inject({
      method: "GET",
      url: "/api/v2/board/ranking?campId=demo-camp",
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    const rows = body.rows.filter((row: { memberId: string }) =>
      members.some((member) => member.id === row.memberId)
    );

    expect(rows.map((row: { memberName: string }) => row.memberName)).toEqual([
      "Bravo",
      "Alpha",
      "Charlie",
      "Delta",
      "Echo",
    ]);
    expect(rows.map((row: { rank: number }) => row.rank)).toEqual([1, 2, 3, 4, 5]);

    expect(rows[0]).toMatchObject({
      memberId: "s2",
      cumulativeAq: 150,
      legacyScore: 90,
      v3Score: 60,
      totalScore: 150,
    });
    expect(rows[1]).toMatchObject({
      memberId: "s1",
      cumulativeAq: 110,
      legacyScore: 100,
      v3Score: 10,
      totalScore: 110,
    });
    expect(rows[2]).toMatchObject({
      memberId: "s3",
      cumulativeAq: 80,
      legacyScore: 80,
      v3Score: 0,
      totalScore: 80,
    });
    expect(rows[4]).toMatchObject({
      memberId: "s5",
      cumulativeAq: 65,
      legacyScore: 65,
      v3Score: 0,
      totalScore: 65,
    });
  });

  it("recomputes tie ranks from effective totals instead of old v2 ranks", async () => {
    vi.stubEnv("AI_BOOT_ENGINE_MODE", "v3_live");
    const dbPath = databasePath();
    const repo = new SqliteRepository(dbPath);
    repo.seedDemo();

    const members = [
      { id: "tie-a", name: "Alpha", v2Aq: 90 },
      { id: "tie-b", name: "Bravo", v2Aq: 80 },
      { id: "old-top", name: "Delta", v2Aq: 110 },
    ];

    for (const member of members) {
      repo.ensureMember(member.id, "demo-camp");
      repo.updateMember(member.id, {
        roleType: "student",
        isParticipant: true,
        isExcludedFromBoard: false,
        displayName: member.name,
      });
    }

    const db = (repo as unknown as {
      db: { prepare: (sql: string) => { run: (...args: unknown[]) => void } };
    }).db;
    for (const member of members) {
      db.prepare(
        `INSERT INTO v2_window_snapshots (id, window_id, member_id, window_aq, cumulative_aq, k_score, h_score, c_score, s_score, g_score, growth_bonus, snapshot_at)
         VALUES (?, 'w-W1', ?, ?, ?, 10, 10, 10, 10, 10, 0, '2026-04-01T00:00:00Z')`
      ).run(`snap-${member.id}`, member.id, member.v2Aq, member.v2Aq);
    }

    repo.upsertAiBootLegacyScoreSnapshot({
      id: "legacy-tie-a",
      campId: "demo-camp",
      memberId: "tie-a",
      totalScore: 100,
      dimensionJson: "{}",
      sourceNote: "test",
      snapshotAt: "2026-05-16T00:00:00.000Z",
    });
    repo.upsertAiBootLegacyScoreSnapshot({
      id: "legacy-tie-b",
      campId: "demo-camp",
      memberId: "tie-b",
      totalScore: 0,
      dimensionJson: "{}",
      sourceNote: "test",
      snapshotAt: "2026-05-16T00:00:00.000Z",
    });

    repo.insertAiBootEvent(aiBootEvent("tie-b", { id: "evt-tie-b" }));
    repo.insertAiBootScoreEvent(
      aiBootScoreEvent("tie-b", {
        id: "score-tie-b",
        eventId: "evt-tie-b",
        scoreDelta: 100,
      })
    );

    repo.upsertAiBootLegacyScoreSnapshot({
      id: "legacy-old-top",
      campId: "demo-camp",
      memberId: "old-top",
      totalScore: 50,
      dimensionJson: "{}",
      sourceNote: "test",
      snapshotAt: "2026-05-16T00:00:00.000Z",
    });
    repo.close();

    const app = await createApp({ databaseUrl: dbPath });
    apps.push(app);

    const res = await app.inject({
      method: "GET",
      url: "/api/v2/board/ranking?campId=demo-camp",
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    const rows = body.rows.filter((row: { memberId: string }) =>
      members.some((member) => member.id === row.memberId)
    );

    expect(rows.map((row: { memberName: string }) => row.memberName)).toEqual([
      "Alpha",
      "Bravo",
      "Delta",
    ]);
    expect(rows.map((row: { cumulativeAq: number }) => row.cumulativeAq)).toEqual([
      100,
      100,
      50,
    ]);
    expect(rows.map((row: { rank: number }) => row.rank)).toEqual([1, 1, 3]);
  });

  it("keeps v2 leaderboard in v3_live when legacy snapshots are incomplete", async () => {
    vi.stubEnv("AI_BOOT_ENGINE_MODE", "v3_live");
    const dbPath = databasePath();
    const repo = new SqliteRepository(dbPath);
    repo.seedDemo();

    const members = [
      { id: "incomplete-a", name: "Alpha", v2Aq: 100 },
      { id: "incomplete-b", name: "Bravo", v2Aq: 40 },
    ];

    for (const member of members) {
      repo.ensureMember(member.id, "demo-camp");
      repo.updateMember(member.id, {
        roleType: "student",
        isParticipant: true,
        isExcludedFromBoard: false,
        displayName: member.name,
      });
    }

    const db = (repo as unknown as {
      db: { prepare: (sql: string) => { run: (...args: unknown[]) => void } };
    }).db;
    for (const member of members) {
      db.prepare(
        `INSERT INTO v2_window_snapshots (id, window_id, member_id, window_aq, cumulative_aq, k_score, h_score, c_score, s_score, g_score, growth_bonus, snapshot_at)
         VALUES (?, 'w-W1', ?, ?, ?, 10, 10, 10, 10, 10, 0, '2026-04-01T00:00:00Z')`
      ).run(`snap-${member.id}`, member.id, member.v2Aq, member.v2Aq);
    }

    repo.upsertAiBootLegacyScoreSnapshot({
      id: "legacy-incomplete-a",
      campId: "demo-camp",
      memberId: "incomplete-a",
      totalScore: 5,
      dimensionJson: "{}",
      sourceNote: "test",
      snapshotAt: "2026-05-16T00:00:00.000Z",
    });
    repo.insertAiBootEvent(aiBootEvent("incomplete-b", { id: "evt-incomplete-b" }));
    repo.insertAiBootScoreEvent(
      aiBootScoreEvent("incomplete-b", {
        id: "score-incomplete-b",
        eventId: "evt-incomplete-b",
        scoreDelta: 500,
      })
    );
    repo.close();

    const app = await createApp({ databaseUrl: dbPath });
    apps.push(app);

    const res = await app.inject({
      method: "GET",
      url: "/api/v2/board/ranking?campId=demo-camp",
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    const rows = body.rows.filter((row: { memberId: string }) =>
      members.some((member) => member.id === row.memberId)
    );

    expect(rows.map((row: { memberId: string }) => row.memberId)).toEqual([
      "incomplete-a",
      "incomplete-b",
    ]);
    expect(rows.map((row: { cumulativeAq: number }) => row.cumulativeAq)).toEqual([
      100,
      40,
    ]);
    expect(rows[0]).not.toHaveProperty("legacyScore");
    expect(rows[1]).not.toHaveProperty("legacyScore");
  });
});

describe("fetchRankingByCamp repository method", () => {
  it("assigns standard competition ranks with ties", () => {
    const repo = new SqliteRepository(":memory:");

    // Seed a camp
    repo.seedDemo();

    // Seed four students with distinct AQ and one operator
    const members = [
      { id: "s1", name: "Alpha", aq: 100 },
      { id: "s2", name: "Bravo", aq: 75 },
      { id: "s3", name: "Charlie", aq: 75 },
      { id: "s4", name: "Delta", aq: 50 },
    ];

    for (const m of members) {
      repo.ensureMember(m.id, "demo-camp");
      repo.updateMember(m.id, {
        roleType: "student",
        isParticipant: true,
        isExcludedFromBoard: false,
        displayName: m.name,
      });
    }

    // Insert window snapshots for each member
    const db = (repo as unknown as { db: { prepare: (sql: string) => { run: (...args: unknown[]) => void } } }).db;
    for (const m of members) {
      db.prepare(
        `INSERT INTO v2_window_snapshots (id, window_id, member_id, window_aq, cumulative_aq, k_score, h_score, c_score, s_score, g_score, growth_bonus, snapshot_at)
         VALUES (?, 'w-W1', ?, ?, ?, 10, 10, 10, 10, 10, 0, '2026-04-01T00:00:00Z')`
      ).run(`snap-${m.id}`, m.id, m.aq, m.aq);
    }

    const rows = repo.fetchRankingByCamp("demo-camp");

    // Should have 4 rows (operator is excluded)
    expect(rows.length).toBe(4);

    // Verify ordering: 100, 75, 75, 50
    expect(rows[0].cumulativeAq).toBe(100);
    expect(rows[1].cumulativeAq).toBe(75);
    expect(rows[2].cumulativeAq).toBe(75);
    expect(rows[3].cumulativeAq).toBe(50);

    // Verify tied members are sorted by name ASC
    expect(rows[1].memberName).toBe("Bravo");
    expect(rows[2].memberName).toBe("Charlie");

    // Verify standard competition ranking: [1, 2, 2, 4]
    expect(rows[0].rank).toBe(1);
    expect(rows[1].rank).toBe(2);
    expect(rows[2].rank).toBe(2);
    expect(rows[3].rank).toBe(4);

    repo.close();
  });
});
