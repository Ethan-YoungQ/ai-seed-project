import { afterEach, describe, expect, it } from "vitest";

import type {
  AiBootEventRecord,
  AiBootScoreEventRecord,
} from "../../src/domain/v3/ai-boot-types.js";
import { reconcileV3PeriodCaps } from "../../src/scripts/ai-boot-reconcile-v3-period-caps.js";
import { SqliteRepository } from "../../src/storage/sqlite-repository.js";

const repositories: SqliteRepository[] = [];

function makeRepo(): SqliteRepository {
  const repository = new SqliteRepository(":memory:");
  repository.seedDemo();
  repository.insertPeriod({
    id: "period-2",
    campId: "default",
    number: 2,
    isIceBreaker: false,
    startedAt: "2026-04-22T00:00:00.000Z",
    openedByOpId: null,
    createdAt: "2026-04-22T00:00:00.000Z",
    updatedAt: "2026-04-22T00:00:00.000Z",
  });
  repositories.push(repository);
  return repository;
}

function event(overrides: Partial<AiBootEventRecord>): AiBootEventRecord {
  return {
    id: "evt-1",
    campId: "default",
    chatId: "chat-1",
    memberId: "user-alice",
    sourceMessageId: "om-1",
    eventType: "text",
    rawText: "AI 作品",
    sanitizedText: "AI 作品",
    attachmentJson: "[]",
    evidenceJson: "{}",
    contentHash: "hash-1",
    status: "extracted",
    engineVersion: "v3.0.0",
    rulesetVersion: "2026-05-18",
    createdAt: "2026-05-01T00:00:00.000Z",
    ...overrides,
  };
}

function scoreEvent(overrides: Partial<AiBootScoreEventRecord>): AiBootScoreEventRecord {
  return {
    id: "score-1",
    eventId: "evt-1",
    campId: "default",
    memberId: "user-alice",
    category: "ai_artifact",
    scoreDelta: 4,
    confidence: "high",
    status: "approved",
    notifyPolicy: "silent",
    reason: "AI 作品加分",
    evidence: "有明确作品",
    badgesJson: "[]",
    modelProvider: "test",
    modelName: "test",
    promptVersion: "test",
    reviewedByOpId: null,
    reviewNote: null,
    decidedAt: "2026-05-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("reconcileV3PeriodCaps", () => {
  afterEach(() => {
    while (repositories.length > 0) {
      repositories.pop()?.close();
    }
  });

  it("dry-runs category cap changes without mutating score events", () => {
    const repository = makeRepo();
    for (let i = 1; i <= 3; i += 1) {
      repository.insertAiBootEvent(event({
        id: `evt-${i}`,
        sourceMessageId: `om-${i}`,
        contentHash: `hash-${i}`,
        createdAt: `2026-05-0${i}T00:00:00.000Z`,
      }));
      repository.insertAiBootScoreEvent(scoreEvent({
        id: `score-${i}`,
        eventId: `evt-${i}`,
        decidedAt: `2026-05-0${i}T00:00:00.000Z`,
      }));
    }

    const result = reconcileV3PeriodCaps({
      repository,
      campId: "default",
      periodNumber: 2,
      apply: false,
      nowIso: "2026-05-18T00:00:00.000Z",
    });

    expect(result.totalDelta).toBe(-4);
    expect(result.changes).toHaveLength(1);
    expect(result.changes[0]).toMatchObject({
      scoreEventId: "score-3",
      memberId: "user-alice",
      category: "ai_artifact",
      oldScoreDelta: 4,
      newScoreDelta: 0,
      oldStatus: "approved",
      newStatus: "no_score",
    });
    expect(repository.sumApprovedAiBootScore("default", "user-alice")).toBe(12);
  });

  it("applies category cap changes and reduces approved v3 score", () => {
    const repository = makeRepo();
    for (let i = 1; i <= 3; i += 1) {
      repository.insertAiBootEvent(event({
        id: `evt-${i}`,
        sourceMessageId: `om-${i}`,
        contentHash: `hash-${i}`,
        createdAt: `2026-05-0${i}T00:00:00.000Z`,
      }));
      repository.insertAiBootScoreEvent(scoreEvent({
        id: `score-${i}`,
        eventId: `evt-${i}`,
        decidedAt: `2026-05-0${i}T00:00:00.000Z`,
      }));
    }

    const result = reconcileV3PeriodCaps({
      repository,
      campId: "default",
      periodNumber: 2,
      apply: true,
      nowIso: "2026-05-18T00:00:00.000Z",
    });

    expect(result.totalDelta).toBe(-4);
    expect(repository.sumApprovedAiBootScore("default", "user-alice")).toBe(8);
    expect(repository.getAiBootScoreEvent("score-3")).toMatchObject({
      status: "no_score",
      scoreDelta: 0,
      notifyPolicy: "silent",
      reviewNote: expect.stringContaining("v3_period_cap_replay_20260518"),
    });
  });
});
