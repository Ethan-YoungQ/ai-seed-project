import Database from "better-sqlite3";
import { describe, expect, test } from "vitest";

import { SqliteRepository } from "../../../src/storage/sqlite-repository.js";

describe("SqliteRepository v2 schema", () => {
  test("creates all 9 v2 tables on construction", () => {
    const repo = new SqliteRepository(":memory:");
    // Access the underlying db via a private cast for schema assertion
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db: Database.Database = (repo as unknown as { db: Database.Database }).db;

    const rows = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name IN (?,?,?,?,?,?,?,?,?)"
      )
      .all(
        "v2_periods",
        "v2_windows",
        "v2_card_interactions",
        "v2_scoring_item_events",
        "v2_member_dimension_scores",
        "v2_window_snapshots",
        "v2_member_levels",
        "v2_promotion_records",
        "v2_llm_scoring_tasks"
      ) as Array<{ name: string }>;

    expect(rows.map((r) => r.name).sort()).toEqual([
      "v2_card_interactions",
      "v2_llm_scoring_tasks",
      "v2_member_dimension_scores",
      "v2_member_levels",
      "v2_periods",
      "v2_promotion_records",
      "v2_scoring_item_events",
      "v2_window_snapshots",
      "v2_windows"
    ]);

    repo.close();
  });
});
