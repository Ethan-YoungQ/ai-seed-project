import { describe, expect, test } from "vitest";
import {
  buildFirstThreeAnnouncementCard,
  FIRST_THREE_ANNOUNCEMENT_TEMPLATE_ID,
  type FirstThreeAnnouncementState,
} from "../../../../../src/services/feishu/cards/templates/first-three-announcement-v1.js";

function makeState(
  overrides: Partial<FirstThreeAnnouncementState> = {}
): FirstThreeAnnouncementState {
  return {
    items: [
      { ordinal: 1, memberName: "Alice", targetLevel: 2 },
      { ordinal: 2, memberName: "Bob", targetLevel: 3 },
      { ordinal: 3, memberName: "Carol", targetLevel: 4 },
    ],
    ...overrides,
  };
}

describe("first-three-announcement-v1 template", () => {
  test("FIRST_THREE_ANNOUNCEMENT_TEMPLATE_ID is correct", () => {
    expect(FIRST_THREE_ANNOUNCEMENT_TEMPLATE_ID).toBe("first-three-announcement-v1");
  });

  test("header contains 段位晋升公告", () => {
    const card = buildFirstThreeAnnouncementCard(makeState());
    const json = JSON.stringify(card);
    expect(json).toContain("段位晋升公告");
  });

  test("body contains gaming-style text for all three ordinals", () => {
    const card = buildFirstThreeAnnouncementCard(makeState());
    const json = JSON.stringify(card);

    // 1st — 第一位
    expect(json).toContain("Alice");
    expect(json).toContain("第一位");
    expect(json).toContain("AI 研究员");

    // 2nd — 第二位
    expect(json).toContain("Bob");
    expect(json).toContain("第二位");
    expect(json).toContain("AI 操盘手");

    // 3rd — 第三位, with closing message
    expect(json).toContain("Carol");
    expect(json).toContain("第三位");
    expect(json).toContain("AI 智慧顾问");
    expect(json).toContain("之后晋升该段位的同事不再群公告");
  });

  test("1st promotion uses correct template", () => {
    const state: FirstThreeAnnouncementState = {
      items: [{ ordinal: 1, memberName: "TestUser", targetLevel: 5 }],
    };
    const card = buildFirstThreeAnnouncementCard(state);
    const json = JSON.stringify(card);
    expect(json).toContain("第一位");
    expect(json).toContain("AI 奇点玩家");
    expect(json).not.toContain("之后晋升");
  });

  test("3rd promotion includes closing boundary message", () => {
    const state: FirstThreeAnnouncementState = {
      items: [{ ordinal: 3, memberName: "LastOne", targetLevel: 2 }],
    };
    const card = buildFirstThreeAnnouncementCard(state);
    const json = JSON.stringify(card);
    expect(json).toContain("第三位");
    expect(json).toContain("之后晋升该段位的同事不再群公告");
  });
});
