import type { FeishuCardJson } from "../types.js";
import { buildHeader } from "./common/header.js";

export const VIDEO_CHECKIN_TEMPLATE_ID = "video-checkin-v1" as const;

export interface VideoCheckinState {
  sessionTitle: string;
  videoUrl: string;
  periodNumber: number;
}

export function buildVideoCheckinCard(state: VideoCheckinState): FeishuCardJson {
  return {
    schema: "2.0",
    header: buildHeader({
      title: `🎬 第 ${state.periodNumber} 期视频打卡`,
      template: "orange"
    }) as unknown as Record<string, unknown>,
    body: {
      elements: [
        {
          tag: "markdown",
          content: `**${state.sessionTitle}**\n\n📺 [点击观看视频](${state.videoUrl})\n\n观看完毕后点击下方按钮完成打卡。`
        },
        {
          tag: "action",
          actions: [
            {
              tag: "button",
              text: { tag: "plain_text", content: "全部看完 ✅" },
              type: "primary",
              value: { action: "video_checkin_complete", periodNumber: state.periodNumber }
            }
          ]
        }
      ]
    }
  };
}
