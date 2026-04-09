import { afterEach, describe, expect, it, vi } from "vitest";

import { SqliteRepository } from "../../src/storage/sqlite-repository";
import type { ScoringResult, SubmissionCandidate } from "../../src/domain/types";

function buildCandidate(
  sessionId: string,
  memberId: string,
  latestEventTime: string,
  deadlineAt: string
): SubmissionCandidate {
  return {
    id: `${sessionId}:${memberId}`,
    campId: "camp-demo",
    sessionId,
    memberId,
    homeworkTag: sessionId === "session-01" ? "#HW01" : sessionId === "session-02" ? "#HW02" : "#HW03",
    eventId: `${sessionId}:${memberId}:evt-1`,
    messageId: `${sessionId}:${memberId}:msg-1`,
    eventIds: [`${sessionId}:${memberId}:evt-1`],
    combinedText: "#HW01 #\u4f5c\u4e1a\u63d0\u4ea4",
    attachmentCount: 1,
    attachmentTypes: ["image"],
    firstEventTime: latestEventTime,
    latestEventTime,
    deadlineAt,
    evaluationWindowEnd: deadlineAt
  };
}

function buildInvalidScore(
  sessionId: string,
  memberId: string,
  candidateId: string,
  scoreReason: string
): ScoringResult {
  return {
    memberId,
    sessionId,
    candidateId,
    baseScore: 0,
    processScore: 0,
    qualityScore: 0,
    communityBonus: 0,
    totalScore: 0,
    finalStatus: "invalid",
    scoreReason,
    llmReason: "manual",
    reviewedBy: "ops-demo",
    reviewedAt: "2026-04-20T00:00:00.000Z",
    manualOverrideFlag: true,
    autoBaseScore: 0,
    autoProcessScore: 0,
    autoQualityScore: 0,
    autoCommunityBonus: 0
  };
}

function buildValidScore(sessionId: string, memberId: string, candidateId: string): ScoringResult {
  return {
    memberId,
    sessionId,
    candidateId,
    baseScore: 5,
    processScore: 2,
    qualityScore: 1,
    communityBonus: 0,
    totalScore: 8,
    finalStatus: "valid",
    scoreReason: "evidence_present",
    llmReason: "manual",
    reviewedBy: "ops-demo",
    reviewedAt: "2026-05-20T00:00:00.000Z",
    manualOverrideFlag: false,
    autoBaseScore: 5,
    autoProcessScore: 2,
    autoQualityScore: 1,
    autoCommunityBonus: 0
  };
}

describe("warning state machine", () => {
  let repository: SqliteRepository | undefined;

  afterEach(() => {
    repository?.close();
    repository = undefined;
    vi.useRealTimers();
  });

  it("creates a late-submission warning and lets restore_status resolve it", () => {
    repository = new SqliteRepository(":memory:");
    repository.seedDemo();

    const candidate = buildCandidate(
      "session-01",
      "user-alice",
      "2026-04-18T09:00:00.000Z",
      "2026-04-17T08:59:59.000Z"
    );
    repository.saveCandidate(candidate);
    repository.saveScore(
      "camp-demo",
      buildInvalidScore(candidate.sessionId, candidate.memberId, candidate.id, "late_submission")
    );

    const warnings = repository.syncMemberWarnings("camp-demo", "user-alice");

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({
      violationType: "late_submission",
      level: "reminder",
      resolvedFlag: false
    });
    expect(repository.getMember("user-alice")?.status).toBe("warned");

    const restored = repository.overrideReview(candidate.id, {
      action: "restore_status",
      reviewer: "ops-demo",
      note: "恢复状态"
    });

    expect(restored?.finalStatus).toBe("invalid");
    expect(repository.getMember("user-alice")?.status).toBe("active");

    const persistedWarnings = repository.listWarnings("camp-demo").filter((warning) => warning.memberId === "user-alice");
    expect(persistedWarnings).toHaveLength(1);
    expect(persistedWarnings[0]).toMatchObject({
      violationType: "late_submission",
      resolvedFlag: true
    });
  });

  it("creates absence warnings for missed sessions once their deadlines pass", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-20T00:00:00.000Z"));

    repository = new SqliteRepository(":memory:");
    repository.seedDemo();

    const candidate = buildCandidate(
      "session-03",
      "user-alice",
      "2026-05-10T09:00:00.000Z",
      "2026-05-15T08:59:59.000Z"
    );
    repository.saveCandidate(candidate);
    repository.saveScore("camp-demo", buildValidScore(candidate.sessionId, candidate.memberId, candidate.id));

    const warnings = repository.syncMemberWarnings("camp-demo", "user-alice");

    expect(warnings).toHaveLength(2);
    expect(warnings.map((warning) => warning.violationType)).toEqual(["absence", "absence"]);
    expect(warnings.map((warning) => warning.level)).toEqual(["reminder", "warning"]);
    expect(repository.getMember("user-alice")?.status).toBe("warned");
  });

  it("keeps the public board on valid-score-only footing", () => {
    repository = new SqliteRepository(":memory:");
    repository.seedDemo();

    const candidate = buildCandidate(
      "session-01",
      "user-alice",
      "2026-04-10T09:00:00.000Z",
      "2026-04-17T08:59:59.000Z"
    );
    repository.saveCandidate(candidate);
    repository.saveScore(
      "camp-demo",
      buildInvalidScore(candidate.sessionId, candidate.memberId, candidate.id, "missing_result")
    );

    expect(repository.getPublicBoard("camp-demo").entries).toHaveLength(0);

    repository.overrideReview(candidate.id, {
      action: "override_score",
      reviewer: "ops-demo",
      note: "改回有效作业",
      override: {
        finalStatus: "valid",
        baseScore: 5,
        processScore: 2,
        qualityScore: 1,
        communityBonus: 0
      }
    });

    expect(repository.getPublicBoard("camp-demo").entries).toHaveLength(1);
  });
});
