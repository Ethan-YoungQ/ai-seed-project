import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { SqliteRepository } from "../../../src/storage/sqlite-repository.js";

function repo() {
  const dir = mkdtempSync(join(tmpdir(), "ai-boot-v3-"));
  return new SqliteRepository(join(dir, "test.db"));
}

describe("SqliteRepository ai boot v3", () => {
  it("inserts and finds an event by source message id", () => {
    const r = repo();
    r.insertAiBootEvent({
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
      createdAt: "2026-05-16T00:00:00.000Z"
    });
    expect(r.findAiBootEventByMessageId("om-1")?.id).toBe("evt-1");
    r.close();
  });

  it("inserts score events and sums approved v3 score", () => {
    const r = repo();
    r.insertAiBootScoreEvent({
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
      decidedAt: "2026-05-16T00:01:00.000Z"
    });
    r.insertAiBootScoreEvent({
      id: "score-2",
      eventId: "evt-2",
      campId: "default",
      memberId: "m-1",
      category: "resource_recommendation",
      scoreDelta: 3,
      confidence: "low",
      status: "review_required",
      notifyPolicy: "silent",
      reason: "needs review",
      evidence: "resource",
      badgesJson: "[]",
      modelProvider: "fake",
      modelName: "fake",
      promptVersion: "none",
      reviewedByOpId: null,
      reviewNote: "low confidence",
      decidedAt: "2026-05-16T00:02:00.000Z"
    });
    expect(r.sumApprovedAiBootScore("default", "m-1")).toBe(4);
    r.close();
  });

  it("finds a score event by id", () => {
    const r = repo();
    r.insertAiBootScoreEvent({
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
      decidedAt: "2026-05-16T00:01:00.000Z"
    });
    expect(r.findAiBootScoreEventById("score-1")?.category).toBe("ai_artifact");
    r.close();
  });
});
