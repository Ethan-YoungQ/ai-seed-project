import type { FeishuCardJson } from "../types.js";
import { buildHeader } from "./common/header.js";

export const PEER_REVIEW_SETTLE_TEMPLATE_ID = "peer-review-settle-v1" as const;

export interface PeerReviewSettleResult {
  memberName: string;
  voteCount: number;
  s1Delta: number;
  s2Delta: number;
}

export interface PeerReviewSettleState {
  sessionId: string;
  results: PeerReviewSettleResult[];
}

function renderResultLine(r: PeerReviewSettleResult): string {
  const s1Str = r.s1Delta > 0 ? ` +${r.s1Delta} S1` : "";
  const s2Str = r.s2Delta > 0 ? ` +${r.s2Delta} S2` : "";
  return `**${r.memberName}** — ${r.voteCount} 票${s1Str}${s2Str}`;
}

export function buildPeerReviewSettleCard(state: PeerReviewSettleState): FeishuCardJson {
  const lines = state.results.map(renderResultLine).join("\n");

  return {
    schema: "2.0",
    header: buildHeader({
      title: "🏅 互评结果公布",
      template: "green"
    }) as unknown as Record<string, unknown>,
    body: {
      elements: [
        {
          tag: "markdown",
          content: `本期互评投票结果：\n\n${lines}`
        }
      ]
    }
  };
}
