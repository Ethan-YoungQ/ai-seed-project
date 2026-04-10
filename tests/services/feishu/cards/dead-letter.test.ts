import Database from "better-sqlite3";
import { beforeEach, describe, expect, test } from "vitest";

import { SqliteRepository } from "../../../../src/storage/sqlite-repository.js";
import { DeadLetterStore } from "../../../../src/services/feishu/cards/dead-letter.js";

function fresh(): { sqliteRepo: SqliteRepository; store: DeadLetterStore } {
  const sqliteRepo = new SqliteRepository(":memory:");
  const db = (sqliteRepo as unknown as { db: Database.Database }).db;
  const store = new DeadLetterStore(db);
  return { sqliteRepo, store };
}

describe("DeadLetterStore", () => {
  let store: DeadLetterStore;
  let db: Database.Database;

  beforeEach(() => {
    const f = fresh();
    store = f.store;
    db = (f.sqliteRepo as unknown as { db: Database.Database }).db;
  });

  test("DDL: feishu_card_patch_deadletters table exists after construction", () => {
    const row = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='feishu_card_patch_deadletters'"
      )
      .get() as { name: string } | undefined;
    expect(row?.name).toBe("feishu_card_patch_deadletters");
  });

  test("insert + listUnresolved roundtrip", () => {
    store.insert({
      cardType: "daily_checkin",
      messageId: "om-1",
      reason: "patch_failed",
      attempts: 1,
      enqueuedAt: "2026-04-10T12:00:00.000Z"
    });

    const entries = store.listUnresolved();
    expect(entries).toHaveLength(1);
    expect(entries[0].cardType).toBe("daily_checkin");
    expect(entries[0].messageId).toBe("om-1");
    expect(entries[0].reason).toBe("patch_failed");
    expect(entries[0].attempts).toBe(1);
    expect(entries[0].resolvedAt).toBeNull();
  });

  test("resolve marks resolvedAt timestamp", () => {
    store.insert({
      cardType: "quiz",
      messageId: "om-2",
      reason: "timeout",
      attempts: 3,
      enqueuedAt: "2026-04-10T12:00:00.000Z"
    });

    const [entry] = store.listUnresolved();
    expect(entry).toBeDefined();

    const resolvedAt = "2026-04-11T09:00:00.000Z";
    store.resolve(entry.id, resolvedAt);

    const remaining = store.listUnresolved();
    expect(remaining).toHaveLength(0);
  });

  test("listUnresolved excludes resolved entries", () => {
    store.insert({
      cardType: "daily_checkin",
      messageId: "om-a",
      reason: "err",
      attempts: 1,
      enqueuedAt: "2026-04-10T10:00:00.000Z"
    });
    store.insert({
      cardType: "quiz",
      messageId: "om-b",
      reason: "err",
      attempts: 2,
      enqueuedAt: "2026-04-10T11:00:00.000Z"
    });

    const [first] = store.listUnresolved();
    store.resolve(first.id, "2026-04-11T00:00:00.000Z");

    const unresolved = store.listUnresolved();
    expect(unresolved).toHaveLength(1);
    expect(unresolved[0].messageId).toBe("om-b");
  });

  test("countUnresolved returns correct count", () => {
    expect(store.countUnresolved()).toBe(0);

    store.insert({
      cardType: "daily_checkin",
      messageId: "om-1",
      reason: "fail",
      attempts: 1,
      enqueuedAt: "2026-04-10T10:00:00.000Z"
    });
    store.insert({
      cardType: "quiz",
      messageId: "om-2",
      reason: "fail",
      attempts: 1,
      enqueuedAt: "2026-04-10T11:00:00.000Z"
    });

    expect(store.countUnresolved()).toBe(2);

    const [first] = store.listUnresolved();
    store.resolve(first.id, "2026-04-11T00:00:00.000Z");

    expect(store.countUnresolved()).toBe(1);
  });
});
