import type { FeishuCardJson } from "../types.js";
import { buildHeader } from "./common/header.js";

export const PEER_REVIEW_VOTE_TEMPLATE_ID = "peer-review-vote-v1" as const;

export interface PeerReviewCandidate {
  memberId: string;
  displayName: string;
}

export interface PeerReviewVoteState {
  sessionId: string;
  candidates: PeerReviewCandidate[];
  maxVotes: number;
}

export function buildPeerReviewVoteCard(state: PeerReviewVoteState): FeishuCardJson {
  const voteActions = state.candidates.map((c) => ({
    tag: "button",
    text: { tag: "plain_text", content: `👍 ${c.displayName}` },
    type: "default",
    value: {
      action: "peer_review_vote",
      sessionId: state.sessionId,
      votedMemberId: c.memberId
    }
  }));

  return {
    schema: "2.0",
    header: buildHeader({
      title: "🗳️ 互评投票",
      subtitle: `最多可投 ${state.maxVotes} 票`,
      template: "blue"
    }) as unknown as Record<string, unknown>,
    body: {
      elements: [
        {
          tag: "markdown",
          content: `请为本期表现优秀的学员投票（最多 **${state.maxVotes}** 票）：`
        },
        {
          tag: "action",
          actions: voteActions
        }
      ]
    }
  };
}
