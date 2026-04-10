import { describe, expect, test } from "vitest";
import {
  buildVideoCheckinCard,
  VIDEO_CHECKIN_TEMPLATE_ID,
  type VideoCheckinState
} from "../../../../../src/services/feishu/cards/templates/video-checkin-v1.js";
import { assertCardSize } from "../../../../../src/services/feishu/cards/renderer.js";

function makeState(overrides: Partial<VideoCheckinState> = {}): VideoCheckinState {
  return {
    sessionTitle: "Claude 使用入门讲解",
    videoUrl: "https://example.com/video/session-1",
    periodNumber: 1,
    ...overrides
  };
}

describe("video-checkin-v1 template", () => {
  test("VIDEO_CHECKIN_TEMPLATE_ID is 'video-checkin-v1'", () => {
    expect(VIDEO_CHECKIN_TEMPLATE_ID).toBe("video-checkin-v1");
  });

  test("header contains period number and 视频打卡", () => {
    const card = buildVideoCheckinCard(makeState({ periodNumber: 3 }));
    const json = JSON.stringify(card);
    expect(json).toContain("第 3 期视频打卡");
  });

  test("body contains sessionTitle, videoUrl, and 全部看完 button", () => {
    const card = buildVideoCheckinCard(makeState({
      sessionTitle: "进阶提示词工程",
      videoUrl: "https://cdn.example.com/v2"
    }));
    const json = JSON.stringify(card);
    expect(json).toContain("进阶提示词工程");
    expect(json).toContain("https://cdn.example.com/v2");
    expect(json).toContain("全部看完");
    expect(json).toContain("video_checkin_complete");
  });

  test("card stays within size budget", () => {
    const card = buildVideoCheckinCard(makeState());
    expect(() => assertCardSize(card)).not.toThrow();
  });
});
