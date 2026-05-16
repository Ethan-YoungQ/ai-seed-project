import { afterEach, describe, expect, it, vi } from "vitest";

import type { AiBootScoreEventRecord } from "../../src/domain/v3/ai-boot-types.js";
import { runCutoverCheck } from "../../src/scripts/ai-boot-cutover-check.js";
import { SqliteRepository } from "../../src/storage/sqlite-repository.js";

const repositories: SqliteRepository[] = [];

function makeRepo(): SqliteRepository {
  const repository = new SqliteRepository(":memory:");
  repository.seedDemo();
  repositories.push(repository);
  return repository;
}

function addSnapshot(repository: SqliteRepository) {
  repository.upsertAiBootLegacyScoreSnapshot({
    id: "snapshot-1",
    campId: "camp-demo",
    memberId: "user-alice",
    totalScore: 0,
    dimensionJson: "{}",
    sourceNote: "test",
    snapshotAt: "2026-05-16T00:00:00.000Z",
  });
}

function scoreEvent(overrides: Partial<AiBootScoreEventRecord> = {}): AiBootScoreEventRecord {
  return {
    id: "score-1",
    eventId: "evt-1",
    campId: "camp-demo",
    memberId: "user-alice",
    category: "ai_artifact",
    scoreDelta: 4,
    confidence: "high",
    status: "approved",
    notifyPolicy: "silent",
    reason: "audit reason",
    evidence: "audit evidence",
    badgesJson: "[]",
    modelProvider: "test",
    modelName: "test",
    promptVersion: "test",
    reviewedByOpId: null,
    reviewNote: null,
    decidedAt: "2026-05-17T00:00:00.000Z",
    ...overrides,
  };
}

describe("runCutoverCheck", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    while (repositories.length > 0) {
      repositories.pop()?.close();
    }
  });

  it("fails when legacy snapshots are missing", async () => {
    const repository = makeRepo();
    const stdout = vi.fn();

    const result = await runCutoverCheck({
      repository,
      env: {} as NodeJS.ProcessEnv,
      campId: "camp-demo",
      now: () => "2026-05-17T00:00:00.000Z",
      stdout,
    });

    expect(result).toEqual({ ok: false, failures: ["legacy_snapshots_missing"] });
    expect(JSON.parse(stdout.mock.calls[0][0])).toEqual(result);
  });

  it("fails when any freeze-eligible member lacks a legacy snapshot", async () => {
    const repository = makeRepo();
    repository.ensureMember("user-bob", "camp-demo");
    repository.updateMember("user-bob", {
      roleType: "student",
      isParticipant: true,
      isExcludedFromBoard: false,
      displayName: "Bob",
    });
    addSnapshot(repository);

    await expect(runCutoverCheck({
      repository,
      env: {} as NodeJS.ProcessEnv,
      campId: "camp-demo",
      now: () => "2026-05-17T00:00:00.000Z",
      stdout: () => undefined,
    })).resolves.toEqual({ ok: false, failures: ["legacy_snapshots_incomplete"] });
  });

  it("fails when review-required score events are older than 24 hours", async () => {
    const repository = makeRepo();
    addSnapshot(repository);
    repository.insertAiBootScoreEvent(scoreEvent({
      status: "review_required",
      confidence: "low",
      decidedAt: "2026-05-15T23:59:59.999Z",
    }));

    await expect(runCutoverCheck({
      repository,
      env: {} as NodeJS.ProcessEnv,
      campId: "camp-demo",
      now: () => "2026-05-17T00:00:00.000Z",
      stdout: () => undefined,
    })).resolves.toEqual({ ok: false, failures: ["stale_review_required"] });
  });

  it("fails when v3 score events are missing audit reason or evidence", async () => {
    const repository = makeRepo();
    addSnapshot(repository);
    const db = (repository as unknown as { db: import("better-sqlite3").Database }).db;
    db.prepare(
      `INSERT INTO ai_boot_score_events
        (id, event_id, camp_id, member_id, category, score_delta, confidence,
         status, notify_policy, reason, evidence, badges_json, model_provider,
         model_name, prompt_version, decided_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      "score-missing-audit",
      "evt-missing-audit",
      "camp-demo",
      "user-alice",
      "ai_artifact",
      4,
      "high",
      "approved",
      "silent",
      "  ",
      "audit evidence",
      "[]",
      "test",
      "test",
      "test",
      "2026-05-17T00:00:00.000Z"
    );

    await expect(runCutoverCheck({
      repository,
      env: {} as NodeJS.ProcessEnv,
      campId: "camp-demo",
      now: () => "2026-05-17T00:00:00.000Z",
      stdout: () => undefined,
    })).resolves.toEqual({ ok: false, failures: ["score_event_missing_audit_text"] });
  });

  it("fails when group praise notifications exceed the daily cap", async () => {
    const repository = makeRepo();
    addSnapshot(repository);
    repository.insertAiBootScoreEvent(scoreEvent({
      id: "score-praise-1",
      eventId: "evt-praise-1",
      notifyPolicy: "group_praise",
      decidedAt: "2026-05-17T02:00:00.000Z",
    }));
    repository.insertAiBootScoreEvent(scoreEvent({
      id: "score-praise-2",
      eventId: "evt-praise-2",
      notifyPolicy: "group_praise",
      decidedAt: "2026-05-17T03:00:00.000Z",
    }));

    await expect(runCutoverCheck({
      repository,
      env: {
        AI_BOOT_ALLOW_GROUP_PRAISE: "1",
        AI_BOOT_DAILY_GROUP_PRAISE_CAP: "1",
      } as NodeJS.ProcessEnv,
      campId: "camp-demo",
      now: () => "2026-05-17T04:00:00.000Z",
      stdout: () => undefined,
    })).resolves.toEqual({ ok: false, failures: ["notification_daily_cap_exceeded"] });
  });

  it("passes when all cutover gates are clear", async () => {
    const repository = makeRepo();
    addSnapshot(repository);
    repository.insertAiBootScoreEvent(scoreEvent({
      status: "review_required",
      confidence: "low",
      decidedAt: "2026-05-16T00:00:00.001Z",
    }));

    await expect(runCutoverCheck({
      repository,
      env: {
        AI_BOOT_ALLOW_GROUP_PRAISE: "true",
        AI_BOOT_DAILY_GROUP_PRAISE_CAP: "20",
      } as NodeJS.ProcessEnv,
      campId: "camp-demo",
      now: () => "2026-05-17T00:00:00.000Z",
      stdout: () => undefined,
    })).resolves.toEqual({ ok: true, failures: [] });
  });

  it("uses Shanghai day bounds and counts only approved high group praise when cap is enabled", async () => {
    const repository = makeRepo();
    addSnapshot(repository);
    repository.insertAiBootScoreEvent(scoreEvent({
      id: "score-shanghai-1",
      eventId: "evt-shanghai-1",
      status: "approved",
      confidence: "high",
      notifyPolicy: "group_praise",
      decidedAt: "2026-05-16T16:30:00.000Z",
    }));
    repository.insertAiBootScoreEvent(scoreEvent({
      id: "score-shanghai-2",
      eventId: "evt-shanghai-2",
      status: "approved",
      confidence: "high",
      notifyPolicy: "group_praise",
      decidedAt: "2026-05-17T15:30:00.000Z",
    }));
    repository.insertAiBootScoreEvent(scoreEvent({
      id: "score-review-praise",
      eventId: "evt-review-praise",
      status: "review_required",
      confidence: "high",
      notifyPolicy: "group_praise",
      decidedAt: "2026-05-17T01:00:00.000Z",
    }));
    repository.insertAiBootScoreEvent(scoreEvent({
      id: "score-shadow-praise",
      eventId: "shadow-replay:evt-shadow-praise",
      status: "shadow",
      confidence: "high",
      notifyPolicy: "group_praise",
      decidedAt: "2026-05-17T02:00:00.000Z",
    }));
    repository.insertAiBootScoreEvent(scoreEvent({
      id: "score-rejected-praise",
      eventId: "evt-rejected-praise",
      status: "rejected",
      confidence: "high",
      notifyPolicy: "group_praise",
      decidedAt: "2026-05-17T03:00:00.000Z",
    }));

    await expect(runCutoverCheck({
      repository,
      env: {
        AI_BOOT_ALLOW_GROUP_PRAISE: "true",
        AI_BOOT_DAILY_GROUP_PRAISE_CAP: "1",
      } as NodeJS.ProcessEnv,
      campId: "camp-demo",
      now: () => "2026-05-17T08:00:00.000Z",
      stdout: () => undefined,
    })).resolves.toEqual({ ok: false, failures: ["notification_daily_cap_exceeded"] });

    await expect(runCutoverCheck({
      repository,
      env: {
        AI_BOOT_ALLOW_GROUP_PRAISE: "false",
        AI_BOOT_DAILY_GROUP_PRAISE_CAP: "1",
      } as NodeJS.ProcessEnv,
      campId: "camp-demo",
      now: () => "2026-05-17T08:00:00.000Z",
      stdout: () => undefined,
    })).resolves.toEqual({ ok: true, failures: [] });
  });
});
