import { afterEach, describe, expect, it } from "vitest";

import type {
  AiBootEventRecord,
  AiBootScoreEventRecord,
} from "../../src/domain/v3/ai-boot-types.js";
import { auditFirstCycleScores } from "../../src/scripts/ai-boot-score-audit-first-cycle.js";
import { SqliteRepository } from "../../src/storage/sqlite-repository.js";

const repositories: SqliteRepository[] = [];

function makeRepo(): SqliteRepository {
  const repository = new SqliteRepository(":memory:");
  repository.seedDemo();
  repositories.push(repository);
  return repository;
}

function event(overrides: Partial<AiBootEventRecord>): AiBootEventRecord {
  return {
    id: "evt-existing",
    campId: "camp-demo",
    chatId: "chat-1",
    memberId: "user-alice",
    sourceMessageId: "om-existing",
    eventType: "text",
    rawText: "已有加分",
    sanitizedText: "已有加分",
    attachmentJson: "[]",
    evidenceJson: "{}",
    contentHash: "hash-existing",
    status: "extracted",
    engineVersion: "v3.0.0",
    rulesetVersion: "2026-05-18",
    createdAt: "2026-05-01T00:00:00.000Z",
    ...overrides,
  };
}

function scoreEvent(overrides: Partial<AiBootScoreEventRecord>): AiBootScoreEventRecord {
  return {
    id: "score-existing",
    eventId: "evt-existing",
    campId: "camp-demo",
    memberId: "user-alice",
    category: "ai_artifact",
    scoreDelta: 2,
    confidence: "high",
    status: "approved",
    notifyPolicy: "silent",
    reason: "existing score",
    evidence: "existing evidence",
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

function seedExistingScore(repository: SqliteRepository, scoreDelta: number): void {
  repository.insertAiBootEvent(event({}));
  repository.insertAiBootScoreEvent(scoreEvent({ scoreDelta }));
}

describe("auditFirstCycleScores", () => {
  afterEach(() => {
    while (repositories.length > 0) {
      repositories.pop()?.close();
    }
  });

  it("dry-runs a correction plan without adding audit score events", () => {
    const repository = makeRepo();
    seedExistingScore(repository, 2);

    const result = auditFirstCycleScores({
      repository,
      campId: "camp-demo",
      apply: false,
      plan: {
        members: [
          {
            memberId: "user-alice",
            replayedTotal: 7,
            missingEvents: [
              {
                sourceMessageId: "om-missing-1",
                scoreDelta: 5,
                reason: "真实群回放发现正式作业漏记",
              },
            ],
          },
        ],
      },
    });

    expect(result.members.find((member) => member.memberId === "user-alice")).toMatchObject({
      memberId: "user-alice",
      beforeTotal: 2,
      replayedTotal: 7,
      delta: 5,
      applied: false,
    });
    expect(repository.sumApprovedAiBootScore("camp-demo", "user-alice")).toBe(2);
    expect(repository.countApprovedAiBootScoreEventsForMember("camp-demo", "user-alice")).toBe(1);
  });

  it("applies only confirmed positive missing score as an approved v3 operator adjustment", () => {
    const repository = makeRepo();
    seedExistingScore(repository, 2);

    const result = auditFirstCycleScores({
      repository,
      campId: "camp-demo",
      apply: true,
      now: "2026-05-18T08:00:00.000Z",
      uuid: () => "fixed",
      plan: {
        members: [
          {
            memberId: "user-alice",
            replayedTotal: 7,
            missingEvents: [
              {
                sourceMessageId: "om-missing-1",
                scoreDelta: 5,
                reason: "真实群回放发现正式作业漏记",
              },
            ],
          },
        ],
      },
    });

    expect(result.members.find((member) => member.memberId === "user-alice")).toMatchObject({
      beforeTotal: 2,
      replayedTotal: 7,
      delta: 5,
      applied: true,
    });
    expect(repository.sumApprovedAiBootScore("camp-demo", "user-alice")).toBe(7);

    const adjustment = repository.getAiBootScoreEvent("first-cycle-score-audit-score-fixed");
    expect(adjustment).toMatchObject({
      category: "operator_adjustment",
      scoreDelta: 5,
      status: "approved",
      reviewedByOpId: "codex",
      reason: expect.stringContaining("first_cycle_score_audit"),
      reviewNote: expect.stringContaining("om-missing-1"),
    });
    expect(adjustment?.reviewNote).toContain("真实群回放发现正式作业漏记");
  });

  it("reports negative deltas without applying deductions", () => {
    const repository = makeRepo();
    seedExistingScore(repository, 8);

    const result = auditFirstCycleScores({
      repository,
      campId: "camp-demo",
      apply: true,
      plan: {
        members: [
          {
            memberId: "user-alice",
            replayedTotal: 5,
            overScoredEvents: [
              {
                sourceMessageId: "om-over-1",
                scoreDelta: -3,
                reason: "回放建议扣减，但审计脚本不自动扣分",
              },
            ],
          },
        ],
      },
    });

    expect(result.members.find((member) => member.memberId === "user-alice")).toMatchObject({
      beforeTotal: 8,
      replayedTotal: 5,
      delta: -3,
      applied: false,
      overScoredEvents: [
        expect.objectContaining({ sourceMessageId: "om-over-1" }),
      ],
    });
    expect(repository.sumApprovedAiBootScore("camp-demo", "user-alice")).toBe(8);
    expect(repository.countApprovedAiBootScoreEventsForMember("camp-demo", "user-alice")).toBe(1);
  });

  it("without a plan returns current member totals and does not write", () => {
    const repository = makeRepo();
    seedExistingScore(repository, 2);

    const result = auditFirstCycleScores({
      repository,
      campId: "camp-demo",
      apply: true,
    });

    expect(result.apply).toBe(true);
    expect(result.planProvided).toBe(false);
    expect(result.members.find((member) => member.memberId === "user-alice")).toMatchObject({
      beforeTotal: 2,
      replayedTotal: null,
      delta: null,
      missingEvents: [],
      overScoredEvents: [],
      applied: false,
    });
    expect(repository.sumApprovedAiBootScore("camp-demo", "user-alice")).toBe(2);
  });
});
