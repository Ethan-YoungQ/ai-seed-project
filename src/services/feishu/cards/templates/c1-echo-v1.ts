import type { FeishuCardJson } from "../types.js";
import { buildHeader } from "./common/header.js";

export const C1_ECHO_TEMPLATE_ID = "c1-echo-v1" as const;

export interface C1EchoState {
  memberId: string;
  memberName: string;
  text: string;
  messageId: string;
}

export function buildC1EchoCard(state: C1EchoState): FeishuCardJson {
  return {
    schema: "2.0",
    header: buildHeader({
      title: `💡 创意用法分享 — ${state.memberName}`,
      template: "orange"
    }) as unknown as Record<string, unknown>,
    body: {
      elements: [
        {
          tag: "markdown",
          content: `**${state.memberName}** 分享了一个创意用法：\n\n${state.text}\n\n👆 用 Emoji 表情回应支持 TA 获得 C2 积分！`
        }
      ]
    }
  };
}
