import { describe, expect, test } from "vitest";
import {
  detectAnnounceablePromotions,
  type AnnouncerDeps,
  type PromotionLite,
} from "../../../src/domain/v2/promotion-announcer.js";

function makeDeps(overrides: Partial<AnnouncerDeps> = {}): AnnouncerDeps {
  const promotions: PromotionLite[] = [];
  const ordinals: Array<{ level: number; ordinal: number }> = [];
  const inserted: Array<{
    level: number;
    ordinal: number;
    memberId: string;
    memberName: string;
    windowId: string;
    announcedAt: string;
  }> = [];

  return {
    getPromotions: (_windowId) => promotions,
    getOrdinals: () => ordinals,
    insertOrdinal: (input) => {
      inserted.push(input);
    },
    getMemberName: (memberId) => {
      const names: Record<string, string> = {
        "m1": "Alice",
        "m2": "Bob",
        "m3": "Carol",
        "m4": "Dave",
        "m5": "Eve",
      };
      return names[memberId] ?? null;
    },
    now: () => "2026-05-08T00:00:00.000Z",
    ...overrides,
  };
}

describe("detectAnnounceablePromotions", () => {
  test("returns empty when no promotions in window", () => {
    const deps = makeDeps();
    deps.getPromotions = () => [];
    const result = detectAnnounceablePromotions("w1", deps);
    expect(result).toEqual([]);
  });

  test("returns empty when promotions are all not promoted", () => {
    const deps = makeDeps();
    deps.getPromotions = () => [
      { memberId: "m1", fromLevel: 1, toLevel: 2, promoted: false },
    ];
    const result = detectAnnounceablePromotions("w1", deps);
    expect(result).toEqual([]);
  });

  test("returns item for first promoter to Lv2", () => {
    const deps = makeDeps();
    deps.getPromotions = () => [
      { memberId: "m1", fromLevel: 1, toLevel: 2, promoted: true },
    ];
    const result = detectAnnounceablePromotions("w1", deps);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      ordinal: 1,
      memberName: "Alice",
      targetLevel: 2,
    });
  });

  test("ordinals increment for same level across multiple promoters", () => {
    const deps = makeDeps();
    deps.getPromotions = () => [
      { memberId: "m1", fromLevel: 1, toLevel: 2, promoted: true },
      { memberId: "m2", fromLevel: 1, toLevel: 2, promoted: true },
      { memberId: "m3", fromLevel: 1, toLevel: 2, promoted: true },
    ];
    const result = detectAnnounceablePromotions("w1", deps);
    expect(result).toHaveLength(3);
    expect(result[0].ordinal).toBe(1);
    expect(result[1].ordinal).toBe(2);
    expect(result[2].ordinal).toBe(3);
    expect(result[0].memberName).toBe("Alice");
    expect(result[1].memberName).toBe("Bob");
    expect(result[2].memberName).toBe("Carol");
  });

  test("stops at 3 for same level, 4th promoter is skipped", () => {
    const deps = makeDeps();
    deps.getPromotions = () => [
      { memberId: "m1", fromLevel: 1, toLevel: 2, promoted: true },
      { memberId: "m2", fromLevel: 1, toLevel: 2, promoted: true },
      { memberId: "m3", fromLevel: 1, toLevel: 2, promoted: true },
      { memberId: "m4", fromLevel: 1, toLevel: 2, promoted: true },
    ];
    const result = detectAnnounceablePromotions("w1", deps);
    expect(result).toHaveLength(3);
  });

  test("handles multiple levels in same window", () => {
    const deps = makeDeps();
    deps.getPromotions = () => [
      { memberId: "m1", fromLevel: 1, toLevel: 2, promoted: true },
      { memberId: "m2", fromLevel: 2, toLevel: 3, promoted: true },
      { memberId: "m3", fromLevel: 1, toLevel: 2, promoted: true },
    ];
    const result = detectAnnounceablePromotions("w1", deps);
    expect(result).toHaveLength(3);
    expect(result[0]).toMatchObject({ ordinal: 1, targetLevel: 2, memberName: "Alice" });
    expect(result[1]).toMatchObject({ ordinal: 1, targetLevel: 3, memberName: "Bob" });
    expect(result[2]).toMatchObject({ ordinal: 2, targetLevel: 2, memberName: "Carol" });
  });

  test("skips level promotion when ordinal already at 3 from past windows", () => {
    const deps = makeDeps();
    deps.getPromotions = () => [
      { memberId: "m4", fromLevel: 1, toLevel: 2, promoted: true },
    ];
    deps.getOrdinals = () => [
      { level: 2, ordinal: 3 }, // already 3 people announced for Lv2
    ];
    const result = detectAnnounceablePromotions("w2", deps);
    expect(result).toEqual([]);
  });

  test("skips a member already announced for the same target level", () => {
    const inserted: Array<{ level: number; ordinal: number; memberId: string }> = [];
    const deps = makeDeps({
      insertOrdinal: (input) => {
        inserted.push({
          level: input.level,
          ordinal: input.ordinal,
          memberId: input.memberId,
        });
      },
    });
    deps.getPromotions = () => [
      { memberId: "m1", fromLevel: 1, toLevel: 2, promoted: true },
      { memberId: "m2", fromLevel: 1, toLevel: 2, promoted: true },
    ];
    deps.getOrdinals = () => [
      { level: 2, ordinal: 1, memberId: "m1" },
    ];

    const result = detectAnnounceablePromotions("w2", deps);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ ordinal: 2, memberId: "m2", targetLevel: 2 });
    expect(inserted).toEqual([{ level: 2, ordinal: 2, memberId: "m2" }]);
  });

  test("continues ordinal from past windows", () => {
    const deps = makeDeps();
    deps.getPromotions = () => [
      { memberId: "m3", fromLevel: 1, toLevel: 2, promoted: true },
      { memberId: "m4", fromLevel: 1, toLevel: 2, promoted: true },
    ];
    deps.getOrdinals = () => [
      { level: 2, ordinal: 1 }, // 1 person already announced in past window
    ];
    const result = detectAnnounceablePromotions("w2", deps);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ ordinal: 2, memberName: "Carol" });
    expect(result[1]).toMatchObject({ ordinal: 3, memberName: "Dave" });
  });

  test("skips toLevel 1 promotions (no advancement)", () => {
    const deps = makeDeps();
    deps.getPromotions = () => [
      { memberId: "m1", fromLevel: 1, toLevel: 1, promoted: true },
    ];
    const result = detectAnnounceablePromotions("w1", deps);
    expect(result).toEqual([]);
  });

  test("writes ordinal records to the deps", () => {
    const inserted: Array<{ level: number; ordinal: number; memberId: string }> = [];
    const deps = makeDeps({
      insertOrdinal: (input) => {
        inserted.push({
          level: input.level,
          ordinal: input.ordinal,
          memberId: input.memberId,
        });
      },
    });
    deps.getPromotions = () => [
      { memberId: "m1", fromLevel: 1, toLevel: 2, promoted: true },
      { memberId: "m2", fromLevel: 1, toLevel: 3, promoted: true },
    ];

    detectAnnounceablePromotions("w1", deps);
    expect(inserted).toHaveLength(2);
    expect(inserted[0]).toMatchObject({ level: 2, ordinal: 1, memberId: "m1" });
    expect(inserted[1]).toMatchObject({ level: 3, ordinal: 1, memberId: "m2" });
  });
});
