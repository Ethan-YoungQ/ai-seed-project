import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type {
  AiBootEventRecord,
  AiBootScoreEventRecord
} from "../../../src/domain/v3/ai-boot-types.js";
import { SqliteRepository } from "../../../src/storage/sqlite-repository.js";

function repo() {
  const dir = mkdtempSync(join(tmpdir(), "ai-boot-v3-"));
  return new SqliteRepository(join(dir, "test.db"));
}

function event(overrides: Partial<AiBootEventRecord> = {}): AiBootEventRecord {
  return {
    id: "evt-1",
    campId: "default",
    chatId: "chat-1",
    memberId: "m-1",
    sourceMessageId: "om-1",
    eventType: "text",
    rawText: "hello",
    sanitizedText: "hello",
    attachmentJson: "[]",
    evidenceJson: "{}",
    contentHash: "hash-1",
    status: "received",
    engineVersion: "v3.0.0",
    rulesetVersion: "2026-05-16",
    createdAt: "2026-05-16T00:00:00.000Z",
    ...overrides
  };
}

function scoreEvent(overrides: Partial<AiBootScoreEventRecord> = {}): AiBootScoreEventRecord {
  return {
    id: "score-1",
    eventId: "evt-1",
    campId: "default",
    memberId: "m-1",
    category: "ai_artifact",
    scoreDelta: 4,
    confidence: "high",
    status: "approved",
    notifyPolicy: "group_praise",
    reason: "AI artifact share",
    evidence: "shared image",
    badgesJson: "[]",
    modelProvider: "fake",
    modelName: "fake",
    promptVersion: "none",
    reviewedByOpId: null,
    reviewNote: null,
    decidedAt: "2026-05-16T00:01:00.000Z",
    ...overrides
  };
}

describe("SqliteRepository ai boot v3", () => {
  it("inserts and finds an event by source message id", () => {
    const r = repo();
    expect(r.insertAiBootEvent(event())).toBe(true);
    expect(r.findAiBootEventByMessageId("default", "om-1")?.id).toBe("evt-1");
    r.close();
  });

  it("ignores duplicate source messages in the same camp and preserves the original event", () => {
    const r = repo();
    expect(r.insertAiBootEvent(event({ id: "evt-1", rawText: "original" }))).toBe(true);
    expect(r.insertAiBootEvent(
      event({
        id: "evt-2",
        rawText: "replacement",
        contentHash: "hash-2"
      })
    )).toBe(false);
    expect(r.findAiBootEventByMessageId("default", "om-1")?.id).toBe("evt-1");
    expect(r.findAiBootEventByMessageId("default", "om-1")?.rawText).toBe("original");
    r.close();
  });

  it("finds the same source message id separately per camp", () => {
    const r = repo();
    r.insertAiBootEvent(event({ id: "evt-1", campId: "camp-a" }));
    r.insertAiBootEvent(
      event({
        id: "evt-2",
        campId: "camp-b",
        chatId: "chat-2",
        memberId: "m-2",
        contentHash: "hash-2"
      })
    );
    expect(r.findAiBootEventByMessageId("camp-a", "om-1")?.id).toBe("evt-1");
    expect(r.findAiBootEventByMessageId("camp-b", "om-1")?.id).toBe("evt-2");
    r.close();
  });

  it("throws on primary key conflict with a different source message", () => {
    const r = repo();
    r.insertAiBootEvent(event({ id: "evt-1", sourceMessageId: "om-1" }));
    expect(() =>
      r.insertAiBootEvent(
        event({
          id: "evt-1",
          campId: "camp-2",
          sourceMessageId: "om-2",
          contentHash: "hash-2"
        })
      )
    ).toThrow();
    r.close();
  });

  it("finds previous events by content hash and can exclude the current event", () => {
    const r = repo();
    r.insertAiBootEvent(event({ id: "evt-1", sourceMessageId: "om-1", contentHash: "hash-same" }));
    r.insertAiBootEvent(event({ id: "evt-2", sourceMessageId: "om-2", contentHash: "hash-same" }));

    expect(r.findAiBootEventByContentHash("default", "hash-same")?.id).toBe("evt-2");
    expect(r.findAiBootEventByContentHash("default", "hash-same", "evt-2")?.id).toBe("evt-1");
    expect(r.findAiBootEventByContentHash("default", "missing")).toBeUndefined();
    r.close();
  });

  it("inserts score events and sums approved v3 score", () => {
    const r = repo();
    expect(r.insertAiBootScoreEvent(scoreEvent())).toBe(true);
    r.insertAiBootScoreEvent(scoreEvent({
      id: "score-2",
      eventId: "evt-2",
      category: "resource_recommendation",
      scoreDelta: 3,
      confidence: "low",
      status: "review_required",
      notifyPolicy: "silent",
      reason: "needs review",
      evidence: "resource",
      reviewNote: "low confidence",
      decidedAt: "2026-05-16T00:02:00.000Z"
    }));
    expect(r.sumApprovedAiBootScore("default", "m-1")).toBe(4);
    r.close();
  });

  it("finds a score event by id", () => {
    const r = repo();
    r.insertAiBootScoreEvent(scoreEvent());
    expect(r.findAiBootScoreEventById("score-1")?.category).toBe("ai_artifact");
    r.close();
  });

  it("finds a score event by event id and ignores duplicate score inserts for the same event", () => {
    const r = repo();
    expect(r.insertAiBootScoreEvent(scoreEvent({ id: "score-1", eventId: "evt-1" }))).toBe(true);
    expect(r.insertAiBootScoreEvent(scoreEvent({ id: "score-2", eventId: "evt-1" }))).toBe(false);

    expect(r.findAiBootScoreEventByEventId("evt-1")?.id).toBe("score-1");
    expect(r.sumApprovedAiBootScore("default", "m-1")).toBe(4);
    r.close();
  });

  it("finds approved score events for duplicate content hashes", () => {
    const r = repo();
    r.insertAiBootEvent(event({ id: "evt-1", sourceMessageId: "om-1", contentHash: "hash-same" }));
    r.insertAiBootEvent(event({ id: "evt-2", sourceMessageId: "om-2", contentHash: "hash-same" }));
    r.insertAiBootScoreEvent(scoreEvent({ id: "score-1", eventId: "evt-1", status: "approved" }));

    expect(r.findApprovedAiBootScoreEventByContentHash("default", "hash-same")?.id).toBe("score-1");
    expect(r.findApprovedAiBootScoreEventByContentHash("default", "hash-same", "evt-1")).toBeUndefined();
    r.close();
  });

  it("counts approved score events for a category inside a decided-at window", () => {
    const r = repo();
    r.insertAiBootScoreEvent(scoreEvent({
      id: "score-1",
      eventId: "evt-1",
      category: "daily_participation",
      decidedAt: "2026-05-15T16:00:00.000Z"
    }));
    r.insertAiBootScoreEvent(scoreEvent({
      id: "score-2",
      eventId: "evt-2",
      category: "daily_participation",
      decidedAt: "2026-05-16T15:59:59.999Z"
    }));
    r.insertAiBootScoreEvent(scoreEvent({
      id: "score-3",
      eventId: "evt-3",
      category: "daily_participation",
      decidedAt: "2026-05-16T16:00:00.000Z"
    }));
    r.insertAiBootScoreEvent(scoreEvent({
      id: "score-4",
      eventId: "evt-4",
      category: "daily_participation",
      status: "shadow",
      decidedAt: "2026-05-16T08:00:00.000Z"
    }));

    expect(r.countApprovedAiBootScoreEvents({
      campId: "default",
      memberId: "m-1",
      category: "daily_participation",
      decidedAtFrom: "2026-05-15T16:00:00.000Z",
      decidedAtTo: "2026-05-16T16:00:00.000Z"
    })).toBe(2);
    r.close();
  });
});
