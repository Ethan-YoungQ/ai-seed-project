import { describe, it, expect, afterAll } from "vitest";
import { createApp } from "../../../src/app.js";
import { SqliteRepository } from "../../../src/storage/sqlite-repository.js";

describe("GET /api/v2/board/ranking", () => {
  const apps: Array<Awaited<ReturnType<typeof createApp>>> = [];

  afterAll(async () => {
    for (const a of apps) {
      await a.close();
    }
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
