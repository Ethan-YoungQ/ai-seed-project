import { describe, expect, test } from "vitest";
import {
  buildPeerReviewSettleCard,
  PEER_REVIEW_SETTLE_TEMPLATE_ID,
  type PeerReviewSettleState
} from "../../../../../src/services/feishu/cards/templates/peer-review-settle-v1.js";
import { assertCardSize } from "../../../../../src/services/feishu/cards/renderer.js";

function makeState(overrides: Partial<PeerReviewSettleState> = {}): PeerReviewSettleState {
  return {
    sessionId: "pr-session-001",
    results: [
      { memberName: "Alice", voteCount: 5, s1Delta: 5, s2Delta: 2 },
      { memberName: "Bob", voteCount: 3, s1Delta: 3, s2Delta: 1 }
    ],
    ...overrides
  };
}

describe("peer-review-settle-v1 template", () => {
  test("PEER_REVIEW_SETTLE_TEMPLATE_ID is 'peer-review-settle-v1'", () => {
    expect(PEER_REVIEW_SETTLE_TEMPLATE_ID).toBe("peer-review-settle-v1");
  });

  test("header contains 互评结果公布", () => {
    const card = buildPeerReviewSettleCard(makeState());
    const json = JSON.stringify(card);
    expect(json).toContain("互评结果公布");
  });

  test("body shows member names, vote counts, and score deltas", () => {
    const card = buildPeerReviewSettleCard(makeState());
    const json = JSON.stringify(card);
    expect(json).toContain("Alice");
    expect(json).toContain("5 票");
    expect(json).toContain("+5 S1");
    expect(json).toContain("+2 S2");
    expect(json).toContain("Bob");
  });

  test("card stays within size budget", () => {
    const card = buildPeerReviewSettleCard(makeState());
    expect(() => assertCardSize(card)).not.toThrow();
  });
});
