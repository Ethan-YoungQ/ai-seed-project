import { describe, expect, test } from "vitest";
import {
  buildPeerReviewVoteCard,
  PEER_REVIEW_VOTE_TEMPLATE_ID,
  type PeerReviewVoteState
} from "../../../../../src/services/feishu/cards/templates/peer-review-vote-v1.js";
import { assertCardSize } from "../../../../../src/services/feishu/cards/renderer.js";

function makeState(overrides: Partial<PeerReviewVoteState> = {}): PeerReviewVoteState {
  return {
    sessionId: "pr-session-001",
    candidates: [
      { memberId: "m-alice", displayName: "Alice" },
      { memberId: "m-bob", displayName: "Bob" }
    ],
    maxVotes: 3,
    ...overrides
  };
}

describe("peer-review-vote-v1 template", () => {
  test("PEER_REVIEW_VOTE_TEMPLATE_ID is 'peer-review-vote-v1'", () => {
    expect(PEER_REVIEW_VOTE_TEMPLATE_ID).toBe("peer-review-vote-v1");
  });

  test("header contains 互评投票 and max votes info", () => {
    const card = buildPeerReviewVoteCard(makeState({ maxVotes: 2 }));
    const json = JSON.stringify(card);
    expect(json).toContain("互评投票");
    expect(json).toContain("2");
  });

  test("body contains all candidate names and peer_review_vote action", () => {
    const card = buildPeerReviewVoteCard(makeState());
    const json = JSON.stringify(card);
    expect(json).toContain("Alice");
    expect(json).toContain("Bob");
    expect(json).toContain("peer_review_vote");
    expect(json).toContain("m-alice");
    expect(json).toContain("m-bob");
  });

  test("card stays within size budget with many candidates", () => {
    const candidates = Array.from({ length: 20 }, (_, i) => ({
      memberId: `m-${i}`,
      displayName: `学员${i + 1}`
    }));
    const card = buildPeerReviewVoteCard(makeState({ candidates }));
    expect(() => assertCardSize(card)).not.toThrow();
  });
});
