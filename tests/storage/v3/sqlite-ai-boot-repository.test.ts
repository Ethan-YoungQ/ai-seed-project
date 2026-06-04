import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type {
  AiBootEventRecord,
  AiBootImageUnderstandingRecord,
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

function imageUnderstanding(
  overrides: Partial<AiBootImageUnderstandingRecord> = {}
): AiBootImageUnderstandingRecord {
  return {
    fileKey: "img-001",
    messageId: "om-001",
    contentHash: "hash-image-001",
    modelName: "qwen3.5-flash",
    caption: "一张医疗主题 AI 海报",
    scoreHint: "ai_artifact:4",
    latencyMs: 74271,
    status: "succeeded",
    errorReason: "",
    createdAt: "2026-05-17T10:00:00.000Z",
    updatedAt: "2026-05-17T10:00:00.000Z",
    ...overrides
  };
}

function insertPeriod(r: SqliteRepository): void {
  r.insertPeriod({
    id: "period-2",
    campId: "default",
    number: 2,
    isIceBreaker: false,
    startedAt: "2026-04-22T00:00:00.000Z",
    endedAt: null,
    openedByOpId: null,
    closedReason: null,
    createdAt: "2026-04-22T00:00:00.000Z",
    updatedAt: "2026-04-22T00:00:00.000Z",
  });
}

describe("SqliteRepository ai boot v3", () => {
  it("upserts and fetches image understanding records by content hash", () => {
    const r = repo();
    r.upsertAiBootImageUnderstanding(imageUnderstanding());

    expect(r.findAiBootImageUnderstandingByContentHash("hash-image-001")).toMatchObject({
      fileKey: "img-001",
      caption: "一张医疗主题 AI 海报",
      scoreHint: "ai_artifact:4",
      status: "succeeded"
    });

    r.upsertAiBootImageUnderstanding(imageUnderstanding({
      caption: "更新后的图片描述",
      status: "failed",
      errorReason: "vision timeout",
      updatedAt: "2026-05-17T10:01:00.000Z"
    }));

    expect(r.findAiBootImageUnderstandingByContentHash("hash-image-001")).toMatchObject({
      caption: "更新后的图片描述",
      status: "failed",
      errorReason: "vision timeout",
      updatedAt: "2026-05-17T10:01:00.000Z"
    });
    expect(r.findAiBootImageUnderstandingByContentHash("missing")).toBeNull();
    r.close();
  });

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

  it("lists image-only ai boot events that do not have score events for recovery", () => {
    const r = repo();
    r.insertAiBootEvent(event({
      id: "evt-image-pending",
      sourceMessageId: "om-image-pending",
      eventType: "image",
      rawText: "",
      sanitizedText: "",
      attachmentJson: JSON.stringify([{ type: "image", fileKey: "img-1" }]),
      evidenceJson: JSON.stringify({
        sanitizedText: "",
        urls: [],
        attachments: [{ type: "image", fileKey: "img-1" }],
        documentText: "",
        extractionStatus: "not_applicable",
        extractionReason: "non_file_message",
        contentHash: "hash-image-pending",
      }),
      contentHash: "hash-image-pending",
    }));
    r.insertAiBootEvent(event({
      id: "evt-image-scored",
      sourceMessageId: "om-image-scored",
      eventType: "image",
      rawText: "",
      sanitizedText: "",
      attachmentJson: JSON.stringify([{ type: "image", fileKey: "img-2" }]),
      evidenceJson: JSON.stringify({
        sanitizedText: "",
        urls: [],
        attachments: [{ type: "image", fileKey: "img-2" }],
        documentText: "",
        extractionStatus: "not_applicable",
        extractionReason: "non_file_message",
        contentHash: "hash-image-scored",
      }),
      contentHash: "hash-image-scored",
    }));
    r.insertAiBootScoreEvent(scoreEvent({
      id: "score-image-scored",
      eventId: "evt-image-scored",
    }));
    r.insertAiBootEvent(event({
      id: "evt-text-pending",
      sourceMessageId: "om-text-pending",
      eventType: "text",
      rawText: "普通文字",
      sanitizedText: "普通文字",
      attachmentJson: "[]",
      evidenceJson: JSON.stringify({
        sanitizedText: "普通文字",
        urls: [],
        attachments: [],
        documentText: "",
        extractionStatus: "not_applicable",
        extractionReason: "non_file_message",
        contentHash: "hash-text-pending",
      }),
      contentHash: "hash-text-pending",
    }));
    r.insertAiBootEvent(event({
      id: "evt-image-file-pending",
      sourceMessageId: "om-image-file-pending",
      eventType: "file",
      rawText: "",
      sanitizedText: "",
      attachmentJson: JSON.stringify([{
        type: "file",
        fileKey: "file-png-1",
        fileName: "Gemini海报.png",
        fileExt: "png",
      }]),
      evidenceJson: JSON.stringify({
        sanitizedText: "",
        urls: [],
        attachments: [{
          type: "file",
          fileKey: "file-png-1",
          fileName: "Gemini海报.png",
          fileExt: "png",
        }],
        documentText: "",
        extractionStatus: "unsupported",
        extractionReason: "unsupported_file_ext:png",
        contentHash: "hash-image-file-pending",
      }),
      contentHash: "hash-image-file-pending",
    }));

    const rows = r.listAiBootImageOnlyEventsWithoutScore({ campId: "default", limit: 10 });

    expect(rows.map((row) => row.id)).toEqual(["evt-image-file-pending", "evt-image-pending"]);
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

  it("counts approved score events for a member even when the net score is zero", () => {
    const r = repo();
    r.insertAiBootScoreEvent(scoreEvent({
      id: "score-1",
      eventId: "evt-1",
      scoreDelta: 5
    }));
    r.insertAiBootScoreEvent(scoreEvent({
      id: "score-2",
      eventId: "evt-2",
      category: "operator_adjustment",
      scoreDelta: -5
    }));
    r.insertAiBootScoreEvent(scoreEvent({
      id: "score-3",
      eventId: "evt-3",
      status: "review_required",
      scoreDelta: 100
    }));

    expect(r.sumApprovedAiBootScore("default", "m-1")).toBe(0);
    expect(r.countApprovedAiBootScoreEventsForMember("default", "m-1")).toBe(2);
    r.close();
  });

  it("finds a score event by id", () => {
    const r = repo();
    r.insertAiBootScoreEvent(scoreEvent());
    expect(r.findAiBootScoreEventById("score-1")?.category).toBe("ai_artifact");
    r.close();
  });

  it("lists and updates ai boot score decisions for operator review", () => {
    const r = repo();
    r.insertAiBootScoreEvent(scoreEvent({
      id: "score-approved",
      eventId: "evt-approved",
      status: "approved",
      confidence: "high",
      decidedAt: "2026-05-16T00:00:00.000Z",
    }));
    r.insertAiBootScoreEvent(scoreEvent({
      id: "score-review-old",
      eventId: "evt-review-old",
      status: "review_required",
      confidence: "low",
      evidence: "old evidence",
      decidedAt: "2026-05-16T00:01:00.000Z",
    }));
    r.insertAiBootScoreEvent(scoreEvent({
      id: "score-review-new",
      eventId: "evt-review-new",
      status: "review_required",
      confidence: "medium",
      evidence: "new evidence",
      decidedAt: "2026-05-16T00:02:00.000Z",
    }));

    expect(r.listAiBootReviewQueue({
      campId: "default",
      limit: 10,
      offset: 0,
    }).map((row) => row.id)).toEqual(["score-review-old"]);

    expect(r.updateAiBootScoreDecision({
      id: "score-review-old",
      status: "approved",
      reviewedByOpId: "op-1",
      reviewNote: "corrected",
      category: "operator_adjustment",
      scoreDelta: -2,
      reason: "operator correction",
    })).toBe(true);

    expect(r.getAiBootScoreEvent("score-review-old")).toMatchObject({
      status: "approved",
      reviewedByOpId: "op-1",
      reviewNote: "corrected",
      category: "operator_adjustment",
      scoreDelta: -2,
      reason: "operator correction",
    });
    expect(r.sumApprovedAiBootScore("default", "m-1")).toBe(2);

    expect(r.updateAiBootScoreDecision({
      id: "score-review-new",
      status: "approved",
      reviewedByOpId: "op-1",
      reviewNote: "should not update medium confidence",
    })).toBe(false);
    expect(r.getAiBootScoreEvent("score-review-new")).toMatchObject({
      status: "review_required",
      confidence: "medium",
      reviewedByOpId: null,
      reviewNote: null,
    });

    expect(r.updateAiBootScoreDecision({
      id: "score-approved",
      status: "rejected",
      reviewedByOpId: "op-1",
      reviewNote: "should not update approved",
      scoreDelta: 0,
    })).toBe(false);
    expect(r.getAiBootScoreEvent("score-approved")).toMatchObject({
      status: "approved",
      confidence: "high",
      scoreDelta: 4,
      reviewedByOpId: null,
      reviewNote: null,
    });
    r.close();
  });

  it("caps v3 review approval against existing category period score", () => {
    const r = repo();
    insertPeriod(r);
    r.insertAiBootScoreEvent(scoreEvent({
      id: "score-existing",
      eventId: "evt-existing",
      category: "ai_artifact",
      scoreDelta: 6,
      status: "approved",
      decidedAt: "2026-05-16T00:00:00.000Z",
    }));
    r.insertAiBootScoreEvent(scoreEvent({
      id: "score-review",
      eventId: "evt-review",
      category: "ai_artifact",
      scoreDelta: 4,
      status: "review_required",
      confidence: "low",
      decidedAt: "2026-05-16T00:10:00.000Z",
    }));

    expect(r.updateAiBootScoreDecision({
      id: "score-review",
      status: "approved",
      reviewedByOpId: "op-1",
      reviewNote: "approved_by_review_card",
      scoreDelta: 4,
      category: "ai_artifact",
      reason: "operator approved image artifact",
    })).toBe(true);

    expect(r.getAiBootScoreEvent("score-review")).toMatchObject({
      status: "approved",
      scoreDelta: 2,
      reviewNote: expect.stringContaining("v3_period_cap_applied_on_review"),
    });
    expect(r.sumApprovedAiBootScore("default", "m-1")).toBe(8);
    r.close();
  });

  it("turns v3 review approval into no_score when category period cap is exhausted", () => {
    const r = repo();
    insertPeriod(r);
    r.insertAiBootScoreEvent(scoreEvent({
      id: "score-existing",
      eventId: "evt-existing",
      category: "ai_artifact",
      scoreDelta: 8,
      status: "approved",
      decidedAt: "2026-05-16T00:00:00.000Z",
    }));
    r.insertAiBootScoreEvent(scoreEvent({
      id: "score-review",
      eventId: "evt-review",
      category: "ai_artifact",
      scoreDelta: 3,
      status: "review_required",
      confidence: "low",
      decidedAt: "2026-05-16T00:10:00.000Z",
    }));

    expect(r.updateAiBootScoreDecision({
      id: "score-review",
      status: "approved",
      reviewedByOpId: "op-1",
      reviewNote: "approved_by_review_card",
      scoreDelta: 3,
      category: "ai_artifact",
    })).toBe(true);

    expect(r.getAiBootScoreEvent("score-review")).toMatchObject({
      status: "no_score",
      scoreDelta: 0,
      notifyPolicy: "silent",
      reviewNote: expect.stringContaining("v3_period_cap_applied_on_review"),
    });
    expect(r.sumApprovedAiBootScore("default", "m-1")).toBe(8);
    r.close();
  });

  it("uses the original message text as review queue evidence when available", () => {
    const r = repo();
    r.insertAiBootEvent(event({
      id: "evt-review-old",
      sanitizedText: "我用 AI 做了一张客户沟通海报，并分享了复盘。",
      rawText: "raw fallback",
    }));
    r.insertAiBootScoreEvent(scoreEvent({
      id: "score-review-old",
      eventId: "evt-review-old",
      status: "review_required",
      confidence: "low",
      reason: "LLM returned invalid scoring output; operator review required.",
      evidence: "Invalid response from aliyun/qwen3.5-flash while scoring content hash abc.",
    }));

    const [row] = r.listAiBootReviewQueue({
      campId: "default",
      limit: 10,
      offset: 0,
    });

    expect(row.evidence).toBe("我用 AI 做了一张客户沟通海报，并分享了复盘。");
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

  it("lists replay events by since and stable created/id order", () => {
    const r = repo();
    r.insertAiBootEvent(event({
      id: "evt-c",
      sourceMessageId: "om-c",
      createdAt: "2026-05-16T00:00:01.000Z",
      contentHash: "hash-c",
    }));
    r.insertAiBootEvent(event({
      id: "evt-b",
      sourceMessageId: "om-b",
      createdAt: "2026-05-16T00:00:00.000Z",
      contentHash: "hash-b",
    }));
    r.insertAiBootEvent(event({
      id: "evt-a",
      sourceMessageId: "om-a",
      createdAt: "2026-05-15T23:59:59.999Z",
      contentHash: "hash-a",
    }));

    expect(r.listAiBootEventsForReplay({
      campId: "default",
      since: "2026-05-16T00:00:00.000Z",
      limit: 2,
    }).map((row) => row.id)).toEqual(["evt-b", "evt-c"]);
    r.close();
  });

  it("counts cutover audit gates with optional camp scope", () => {
    const r = repo();
    r.upsertAiBootLegacyScoreSnapshot({
      id: "snapshot-1",
      campId: "default",
      memberId: "m-1",
      totalScore: 0,
      dimensionJson: "{}",
      sourceNote: "test",
      snapshotAt: "2026-05-16T00:00:00.000Z",
    });
    r.insertAiBootScoreEvent(scoreEvent({
      id: "score-stale",
      eventId: "evt-stale",
      status: "review_required",
      confidence: "low",
      decidedAt: "2026-05-15T23:59:59.999Z",
    }));
    r.insertAiBootScoreEvent(scoreEvent({
      id: "score-praise",
      eventId: "evt-praise",
      notifyPolicy: "group_praise",
      decidedAt: "2026-05-17T01:00:00.000Z",
    }));
    const db = (r as unknown as { db: import("better-sqlite3").Database }).db;
    db.prepare("UPDATE ai_boot_score_events SET evidence = '' WHERE id = ?").run("score-praise");

    expect(r.countAiBootLegacyScoreSnapshots("default")).toBe(1);
    expect(r.countStaleAiBootReviewRequired({
      campId: "default",
      nowIso: "2026-05-17T00:00:00.000Z",
      olderThanHours: 24,
    })).toBe(1);
    expect(r.countAiBootScoreEventsMissingAuditText("default")).toBe(1);
    expect(r.countAiBootGroupPraiseNotificationsForDay({
      campId: "default",
      dayStartIso: "2026-05-17T00:00:00.000Z",
      dayEndIso: "2026-05-18T00:00:00.000Z",
    })).toBe(1);
    r.close();
  });

  it("finds only previous ai boot events and approved scores by content hash", () => {
    const r = repo();
    r.insertAiBootEvent(event({
      id: "evt-a",
      sourceMessageId: "om-a",
      contentHash: "hash-same",
      createdAt: "2026-05-16T00:00:00.000Z",
    }));
    r.insertAiBootEvent(event({
      id: "evt-b",
      sourceMessageId: "om-b",
      contentHash: "hash-same",
      createdAt: "2026-05-16T00:00:00.000Z",
    }));
    r.insertAiBootEvent(event({
      id: "evt-c",
      sourceMessageId: "om-c",
      contentHash: "hash-same",
      createdAt: "2026-05-16T00:00:01.000Z",
    }));
    r.insertAiBootScoreEvent(scoreEvent({
      id: "score-a",
      eventId: "evt-a",
      status: "approved",
    }));
    r.insertAiBootScoreEvent(scoreEvent({
      id: "score-c",
      eventId: "evt-c",
      status: "approved",
    }));

    expect(r.findPreviousAiBootEventByContentHash({
      campId: "default",
      contentHash: "hash-same",
      beforeCreatedAt: "2026-05-16T00:00:00.000Z",
      beforeEventId: "evt-a",
    })).toBeUndefined();
    expect(r.findPreviousAiBootEventByContentHash({
      campId: "default",
      contentHash: "hash-same",
      beforeCreatedAt: "2026-05-16T00:00:00.000Z",
      beforeEventId: "evt-b",
    })?.id).toBe("evt-a");
    expect(r.findPreviousApprovedAiBootScoreEventByContentHash({
      campId: "default",
      contentHash: "hash-same",
      beforeCreatedAt: "2026-05-16T00:00:01.000Z",
      beforeEventId: "evt-c",
    })?.id).toBe("score-a");
    r.close();
  });

  it("counts approved score events before a cutoff and approved high group praise notifications only", () => {
    const r = repo();
    r.insertAiBootScoreEvent(scoreEvent({
      id: "score-before",
      eventId: "evt-before",
      category: "daily_participation",
      status: "approved",
      notifyPolicy: "group_praise",
      confidence: "high",
      decidedAt: "2026-05-16T15:30:00.000Z",
    }));
    r.insertAiBootScoreEvent(scoreEvent({
      id: "score-after",
      eventId: "evt-after",
      category: "ai_artifact",
      status: "approved",
      notifyPolicy: "group_praise",
      confidence: "high",
      decidedAt: "2026-05-16T16:30:00.000Z",
    }));
    r.insertAiBootScoreEvent(scoreEvent({
      id: "score-daily",
      eventId: "evt-daily",
      category: "daily_participation",
      status: "approved",
      notifyPolicy: "group_praise",
      confidence: "high",
      decidedAt: "2026-05-16T17:30:00.000Z",
    }));
    r.insertAiBootScoreEvent(scoreEvent({
      id: "score-adjustment",
      eventId: "evt-adjustment",
      category: "operator_adjustment",
      status: "approved",
      scoreDelta: 3,
      notifyPolicy: "group_praise",
      confidence: "high",
      decidedAt: "2026-05-16T18:30:00.000Z",
    }));
    r.insertAiBootScoreEvent(scoreEvent({
      id: "score-review",
      eventId: "evt-review",
      status: "review_required",
      notifyPolicy: "group_praise",
      confidence: "high",
      decidedAt: "2026-05-16T17:00:00.000Z",
    }));
    r.insertAiBootScoreEvent(scoreEvent({
      id: "score-shadow",
      eventId: "shadow-replay:evt-shadow",
      status: "shadow",
      notifyPolicy: "group_praise",
      confidence: "high",
      decidedAt: "2026-05-16T18:00:00.000Z",
    }));
    r.insertAiBootScoreEvent(scoreEvent({
      id: "score-low",
      eventId: "evt-low",
      status: "approved",
      notifyPolicy: "group_praise",
      confidence: "low",
      decidedAt: "2026-05-16T19:00:00.000Z",
    }));

    expect(r.countApprovedAiBootScoreEventsBefore({
      campId: "default",
      memberId: "m-1",
      category: "daily_participation",
      decidedAtFrom: "2026-05-16T00:00:00.000Z",
      decidedAtTo: "2026-05-17T00:00:00.000Z",
      beforeDecidedAt: "2026-05-16T16:00:00.000Z",
    })).toBe(1);
    expect(r.countAiBootGroupPraiseNotificationsForDay({
      campId: "default",
      dayStartIso: "2026-05-16T16:00:00.000Z",
      dayEndIso: "2026-05-17T16:00:00.000Z",
    })).toBe(1);
    r.close();
  });

  it("counts missing legacy snapshots using freeze-eligible members", () => {
    const r = repo();
    r.seedDemo();

    expect(r.countMissingAiBootLegacyScoreSnapshots("camp-demo")).toBe(1);
    expect(r.hasCompleteAiBootLegacyScoreSnapshots("camp-demo")).toBe(false);

    r.upsertAiBootLegacyScoreSnapshot({
      id: "snapshot-alice",
      campId: "camp-demo",
      memberId: "user-alice",
      totalScore: 0,
      dimensionJson: "{}",
      sourceNote: "test",
      snapshotAt: "2026-05-16T00:00:00.000Z",
    });

    expect(r.countMissingAiBootLegacyScoreSnapshots("camp-demo")).toBe(0);
    expect(r.hasCompleteAiBootLegacyScoreSnapshots("camp-demo")).toBe(true);

    r.ensureMember("user-bob", "camp-demo");
    r.updateMember("user-bob", {
      roleType: "student",
      isParticipant: true,
      isExcludedFromBoard: false,
      displayName: "Bob",
    });

    expect(r.countMissingAiBootLegacyScoreSnapshots("camp-demo")).toBe(1);
    expect(r.hasCompleteAiBootLegacyScoreSnapshots("camp-demo")).toBe(false);
    r.close();
  });

  it("records and queries durable AI Boot notification ledger events", () => {
    const r = repo();

    expect(r.insertAiBootNotificationEvent({
      id: "notification-1",
      scoreEventId: "score-1",
      campId: "default",
      memberId: "m-1",
      chatId: "chat-1",
      topicHash: "topic-1",
      notifyPolicy: "group_praise",
      sentAt: "2026-05-16T08:00:00.000Z",
      textHash: "text-1",
    })).toBe(true);
    expect(r.insertAiBootNotificationEvent({
      id: "notification-duplicate",
      scoreEventId: "score-1",
      campId: "default",
      memberId: "m-1",
      chatId: "chat-1",
      topicHash: "topic-1",
      notifyPolicy: "group_praise",
      sentAt: "2026-05-16T08:30:00.000Z",
      textHash: "text-duplicate",
    })).toBe(false);
    expect(r.insertAiBootNotificationEvent({
      id: "notification-2",
      scoreEventId: "score-2",
      campId: "default",
      memberId: "m-1",
      chatId: "chat-1",
      topicHash: "topic-2",
      notifyPolicy: "group_praise",
      sentAt: "2026-05-16T09:00:00.000Z",
      textHash: "text-2",
    })).toBe(true);

    expect(r.countAiBootNotificationEventsForMember({
      campId: "default",
      memberId: "m-1",
      from: "2026-05-16T00:00:00.000Z",
      to: "2026-05-17T00:00:00.000Z",
    })).toBe(2);
    expect(r.countAiBootNotificationEventsForChat({
      campId: "default",
      chatId: "chat-1",
      from: "2026-05-16T08:30:00.000Z",
    })).toBe(1);
    expect(r.findRecentAiBootNotificationByTopicHash({
      campId: "default",
      topicHash: "topic-1",
      since: "2026-05-16T07:59:59.000Z",
    })).toMatchObject({
      id: "notification-1",
      scoreEventId: "score-1",
      textHash: "text-1",
    });
    expect(r.findAiBootNotificationEventByScoreEventId("score-1")).toMatchObject({
      id: "notification-1",
      topicHash: "topic-1",
    });
    r.close();
  });

  it("deduplicates near-promotion nudges by member and target level", () => {
    const r = repo();

    expect(r.insertPromotionNudgeRecord({
      id: "nudge-1",
      campId: "default",
      memberId: "m-1",
      targetLevel: 2,
      scoreAtReminder: 29,
      gapAtReminder: 3,
      remindedAt: "2026-06-04T08:00:00.000Z",
    })).toBe(true);
    expect(r.insertPromotionNudgeRecord({
      id: "nudge-duplicate",
      campId: "default",
      memberId: "m-1",
      targetLevel: 2,
      scoreAtReminder: 30,
      gapAtReminder: 2,
      remindedAt: "2026-06-04T09:00:00.000Z",
    })).toBe(false);
    expect(r.insertPromotionNudgeRecord({
      id: "nudge-next-level",
      campId: "default",
      memberId: "m-1",
      targetLevel: 3,
      scoreAtReminder: 61,
      gapAtReminder: 3,
      remindedAt: "2026-06-05T09:00:00.000Z",
    })).toBe(true);

    r.close();
  });

  it("sums only approved catch-up bonus score events in the active period", () => {
    const r = repo();
    insertPeriod(r);
    r.insertAiBootEvent(event({ id: "evt-catch-up-1" }));
    r.insertAiBootEvent(event({ id: "evt-catch-up-2", sourceMessageId: "om-2" }));
    r.insertAiBootEvent(event({ id: "evt-other", sourceMessageId: "om-3" }));
    r.insertAiBootScoreEvent(scoreEvent({
      id: "score-catch-up-1",
      eventId: "evt-catch-up-1:catch-up",
      category: "operator_adjustment",
      scoreDelta: 2,
      reviewNote: "catch_up_bonus: sourceScoreEvent=score-1; period=period-2",
      decidedAt: "2026-05-16T00:01:00.000Z",
    }));
    r.insertAiBootScoreEvent(scoreEvent({
      id: "score-catch-up-2",
      eventId: "evt-catch-up-2:catch-up",
      category: "operator_adjustment",
      scoreDelta: 3,
      reviewNote: "catch_up_bonus: sourceScoreEvent=score-2; period=period-2",
      decidedAt: "2026-05-17T00:01:00.000Z",
    }));
    r.insertAiBootScoreEvent(scoreEvent({
      id: "score-other",
      eventId: "evt-other",
      category: "operator_adjustment",
      scoreDelta: 7,
      reviewNote: "manual_adjustment",
      decidedAt: "2026-05-17T00:01:00.000Z",
    }));

    expect(r.sumCatchUpBonusForPeriod({
      campId: "default",
      memberId: "m-1",
      decidedAtFrom: "2026-05-16T00:00:00.000Z",
      decidedAtTo: "2026-05-18T00:00:00.000Z",
    })).toBe(5);

    r.close();
  });
});
