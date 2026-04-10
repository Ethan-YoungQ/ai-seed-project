import { describe, expect, test } from "vitest";
import {
  buildLevelAnnouncementCard,
  LEVEL_ANNOUNCEMENT_TEMPLATE_ID,
  type LevelAnnouncementState
} from "../../../../../src/services/feishu/cards/templates/level-announcement-v1.js";
import { assertCardSize } from "../../../../../src/services/feishu/cards/renderer.js";

function makeState(overrides: Partial<LevelAnnouncementState> = {}): LevelAnnouncementState {
  return {
    announcements: [
      { memberName: "Alice", oldLevel: 2, newLevel: 3, direction: "up" },
      { memberName: "Bob", oldLevel: 3, newLevel: 3, direction: "same" },
      { memberName: "Carol", oldLevel: 4, newLevel: 3, direction: "down" }
    ],
    ...overrides
  };
}

describe("level-announcement-v1 template", () => {
  test("LEVEL_ANNOUNCEMENT_TEMPLATE_ID is 'level-announcement-v1'", () => {
    expect(LEVEL_ANNOUNCEMENT_TEMPLATE_ID).toBe("level-announcement-v1");
  });

  test("header contains 等级变化 and 窗口结算", () => {
    const card = buildLevelAnnouncementCard(makeState());
    const json = JSON.stringify(card);
    expect(json).toContain("等级变化");
    expect(json).toContain("窗口结算");
  });

  test("body contains all member names with old and new levels and direction arrows", () => {
    const card = buildLevelAnnouncementCard(makeState());
    const json = JSON.stringify(card);
    expect(json).toContain("Alice");
    expect(json).toContain("Lv.2");
    expect(json).toContain("Lv.3");
    expect(json).toContain("Bob");
    expect(json).toContain("Carol");
    expect(json).toContain("Lv.4");
    // direction arrows
    expect(json).toContain("⬆️");
    expect(json).toContain("➡️");
    expect(json).toContain("⬇️");
  });

  test("card stays within size budget with 30 members", () => {
    const announcements = Array.from({ length: 30 }, (_, i) => ({
      memberName: `学员${i + 1}`,
      oldLevel: (i % 5) + 1,
      newLevel: ((i + 1) % 5) + 1,
      direction: "up" as const
    }));
    const card = buildLevelAnnouncementCard({ announcements });
    expect(() => assertCardSize(card)).not.toThrow();
  });
});
