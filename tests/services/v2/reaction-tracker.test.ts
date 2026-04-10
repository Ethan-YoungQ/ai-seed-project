import { beforeEach, describe, expect, test, vi } from "vitest";

import {
  ReactionTracker,
  type ReactionIngestor
} from "../../../src/services/v2/reaction-tracker.js";

interface IngestCall {
  itemCode: string;
  scoreDelta: number;
  sourceRef: string;
  memberId: string;
}

function makeIngestor(): { tracker: ReactionTracker; calls: IngestCall[] } {
  const calls: IngestCall[] = [];
  const ingestor: ReactionIngestor = {
    ingest: vi.fn((input) => {
      calls.push({
        itemCode: input.itemCode,
        scoreDelta: input.scoreDelta,
        sourceRef: input.sourceRef,
        memberId: input.memberId
      });
      return { accepted: true, eventId: `evt-${calls.length}` };
    })
  };
  const tracker = new ReactionTracker(ingestor);
  return { tracker, calls };
}

describe("ReactionTracker", () => {
  test("first and second reactions do not trigger ingest", () => {
    const { tracker, calls } = makeIngestor();
    tracker.registerTrackedMessage("msg-1", "ou_poster", "member-1");
    tracker.handleReaction("msg-1", "ou_a", "LIKE");
    tracker.handleReaction("msg-1", "ou_b", "LIKE");
    expect(calls).toHaveLength(0);
  });

  test("every third reaction triggers one C2 ingest of +1", () => {
    const { tracker, calls } = makeIngestor();
    tracker.registerTrackedMessage("msg-1", "ou_poster", "member-1");
    tracker.handleReaction("msg-1", "ou_a", "LIKE");
    tracker.handleReaction("msg-1", "ou_b", "LIKE");
    tracker.handleReaction("msg-1", "ou_c", "LIKE");
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      itemCode: "C2",
      scoreDelta: 1,
      memberId: "member-1"
    });
    expect(calls[0].sourceRef).toContain("msg-1");
  });

  test("self-reaction is rejected", () => {
    const { tracker, calls } = makeIngestor();
    tracker.registerTrackedMessage("msg-1", "ou_poster", "member-1");
    tracker.handleReaction("msg-1", "ou_poster", "LIKE");
    tracker.handleReaction("msg-1", "ou_poster", "LIKE");
    tracker.handleReaction("msg-1", "ou_poster", "LIKE");
    expect(calls).toHaveLength(0);
  });

  test("unregistered message is ignored", () => {
    const { tracker, calls } = makeIngestor();
    tracker.handleReaction("unknown-msg", "ou_a", "LIKE");
    expect(calls).toHaveLength(0);
  });

  test("each triggered ingest uses a distinct sourceRef (batch index)", () => {
    const { tracker, calls } = makeIngestor();
    tracker.registerTrackedMessage("msg-1", "ou_poster", "member-1");
    for (let i = 0; i < 9; i += 1) {
      tracker.handleReaction("msg-1", `ou_${i}`, "LIKE");
    }
    expect(calls).toHaveLength(3);
    const refs = new Set(calls.map((c) => c.sourceRef));
    expect(refs.size).toBe(3);
    for (const ref of refs) {
      expect(ref.startsWith("msg-1:")).toBe(true);
    }
  });

  test("reactions from different emoji still count", () => {
    const { tracker, calls } = makeIngestor();
    tracker.registerTrackedMessage("msg-1", "ou_poster", "member-1");
    tracker.handleReaction("msg-1", "ou_a", "LIKE");
    tracker.handleReaction("msg-1", "ou_b", "CLAP");
    tracker.handleReaction("msg-1", "ou_c", "HEART");
    expect(calls).toHaveLength(1);
  });
});
