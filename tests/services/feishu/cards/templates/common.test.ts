import { describe, expect, test } from "vitest";

import { buildHeader } from "../../../../../src/services/feishu/cards/templates/common/header.js";
import { buildMemberBadge } from "../../../../../src/services/feishu/cards/templates/common/member-badge.js";
import { buildProgressBar } from "../../../../../src/services/feishu/cards/templates/common/progress-bar.js";
import { buildRadarImageUrl } from "../../../../../src/services/feishu/cards/templates/common/radar-image.js";

describe("common card components", () => {
  test("buildHeader returns a feishu card v2 header block with title + template", () => {
    const h = buildHeader({ title: "今日打卡", subtitle: "第 3 期", template: "blue" });
    expect(h.title).toEqual({ tag: "plain_text", content: "今日打卡" });
    expect(h.subtitle).toEqual({ tag: "plain_text", content: "第 3 期" });
    expect(h.template).toBe("blue");
  });

  test("buildHeader omits subtitle when not provided", () => {
    const h = buildHeader({ title: "段位评定", template: "purple" });
    expect(h.subtitle).toBeUndefined();
  });

  test("buildMemberBadge wraps name and level into a markdown element", () => {
    const badge = buildMemberBadge({ displayName: "张三", currentLevel: 3 });
    expect(badge.tag).toBe("markdown");
    expect(badge.content).toContain("张三");
    expect(badge.content).toContain("Lv3");
  });

  test("buildProgressBar renders K 15/20 style line", () => {
    const bar = buildProgressBar({ dimension: "K", current: 15, cap: 20 });
    expect(bar.tag).toBe("markdown");
    expect(bar.content).toContain("K");
    expect(bar.content).toContain("15");
    expect(bar.content).toContain("20");
  });

  test("buildRadarImageUrl returns a stable URL for a given memberId+windowId", () => {
    const url = buildRadarImageUrl({
      baseUrl: "https://cdn.example.com",
      memberId: "m-1",
      windowId: "w-1",
      dims: { K: 18, H: 9, C: 12, S: 6, G: 13 }
    });
    expect(url).toContain("/radar/");
    expect(url).toContain("m-1");
    expect(url).toContain("w-1");
  });
});
