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

/**
 * Schema 2.0 peer review vote card.
 * Uses column_set for buttons (not deprecated "action" tag).
 * value is an object with value.action for routing.
 */
export function buildPeerReviewVoteCard(state: PeerReviewVoteState): FeishuCardJson {
  const elements: Array<Record<string, unknown>> = [
    {
      tag: "markdown",
      content: `请为本期表现优秀的学员投票（最多 **${state.maxVotes}** 票）：`,
    },
  ];

  // Each candidate as a separate button row
  for (const c of state.candidates) {
    elements.push({
      tag: "column_set",
      flex_mode: "none",
      background_style: "default",
      columns: [
        {
          tag: "column",
          width: "weighted",
          weight: 1,
          elements: [
            {
              tag: "button",
              name: `peer_review_vote_${c.memberId}`,
              text: { tag: "plain_text", content: `👍 ${c.displayName}` },
              type: "default",
              value: {
                action: "peer_review_vote",
                sessionId: state.sessionId,
                votedMemberId: c.memberId,
              },
            },
          ],
        },
      ],
    });
  }

  return {
    schema: "2.0",
    header: buildHeader({
      title: "🗳️ 互评投票",
      subtitle: `最多可投 ${state.maxVotes} 票`,
      template: "blue",
    }) as unknown as Record<string, unknown>,
    body: { elements },
  };
}
