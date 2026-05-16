import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { runFreezeLegacyScores } from "../../src/scripts/ai-boot-freeze-legacy-scores.js";
import { SqliteRepository } from "../../src/storage/sqlite-repository.js";

const repositories: SqliteRepository[] = [];

function makeRepo(): SqliteRepository {
  const repository = new SqliteRepository(":memory:");
  repository.seedDemo();
  repositories.push(repository);
  return repository;
}

function insertPeriod(repository: SqliteRepository, campId: string): string {
  const periodId = "period-freeze";
  repository.insertPeriod({
    id: periodId,
    campId,
    number: 1,
    isIceBreaker: false,
    startedAt: "2026-05-16T00:00:00.000Z",
    openedByOpId: null,
    createdAt: "2026-05-16T00:00:00.000Z",
    updatedAt: "2026-05-16T00:00:00.000Z",
  });
  return periodId;
}

function addDimensionScores(
  repository: SqliteRepository,
  memberId: string,
  periodId: string,
  scores: Record<string, number>
) {
  for (const [dimension, delta] of Object.entries(scores)) {
    repository.incrementMemberDimensionScore({
      memberId,
      periodId,
      dimension,
      delta,
      eventAt: "2026-05-16T01:00:00.000Z",
    });
  }
}

describe("runFreezeLegacyScores", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    while (repositories.length > 0) {
      repositories.pop()?.close();
    }
  });

  it("creates a legacy snapshot for an eligible member with summed v2 dimension scores", async () => {
    const repository = makeRepo();
    const campId = repository.getDefaultCampId()!;
    const periodId = insertPeriod(repository, campId);
    addDimensionScores(repository, "user-alice", periodId, {
      K: 3,
      H: 4,
      C: 5,
      S: 6,
      G: 7,
    });
    const result = await runFreezeLegacyScores({
      repository,
      env: {} as NodeJS.ProcessEnv,
      now: () => "2026-05-17T00:00:00.000Z",
      uuid: () => "snapshot-1",
    });

    expect(result).toEqual({
      campId,
      snapshotsWritten: 1,
      snapshotsSkipped: 0,
    });
    expect(
      repository.getAiBootLegacyScoreSnapshot(campId, "user-alice")
    ).toEqual({
      totalScore: 25,
      dimensionJson: JSON.stringify({ K: 3, H: 4, C: 5, S: 6, G: 7 }),
      snapshotAt: "2026-05-17T00:00:00.000Z",
    });
    expect(console.log).toHaveBeenCalledWith(
      `snapshots_written=1 camp=${campId} snapshots_skipped=0`
    );

  });

  it("skips existing snapshots unless force freeze is enabled", async () => {
    const repository = makeRepo();
    const campId = repository.getDefaultCampId()!;
    const periodId = insertPeriod(repository, campId);
    addDimensionScores(repository, "user-alice", periodId, { K: 2 });

    repository.upsertAiBootLegacyScoreSnapshot({
      id: "existing",
      campId,
      memberId: "user-alice",
      totalScore: 99,
      dimensionJson: JSON.stringify({ K: 99, H: 0, C: 0, S: 0, G: 0 }),
      sourceNote: "original",
      snapshotAt: "2026-05-16T00:00:00.000Z",
    });

    const result = await runFreezeLegacyScores({
      repository,
      env: {} as NodeJS.ProcessEnv,
      now: () => "2026-05-17T00:00:00.000Z",
      uuid: () => "snapshot-new",
    });

    expect(result.snapshotsSkipped).toBe(1);
    expect(
      repository.getAiBootLegacyScoreSnapshot(campId, "user-alice")
    ).toEqual({
      totalScore: 99,
      dimensionJson: JSON.stringify({ K: 99, H: 0, C: 0, S: 0, G: 0 }),
      snapshotAt: "2026-05-16T00:00:00.000Z",
    });

  });

  it("updates existing snapshots when force freeze is enabled", async () => {
    const repository = makeRepo();
    const campId = repository.getDefaultCampId()!;
    const periodId = insertPeriod(repository, campId);
    addDimensionScores(repository, "user-alice", periodId, { K: 2, H: 3 });
    repository.upsertAiBootLegacyScoreSnapshot({
      id: "existing",
      campId,
      memberId: "user-alice",
      totalScore: 99,
      dimensionJson: "{}",
      sourceNote: "original",
      snapshotAt: "2026-05-16T00:00:00.000Z",
    });

    const result = await runFreezeLegacyScores({
      repository,
      env: { AI_BOOT_FORCE_FREEZE: "true" } as NodeJS.ProcessEnv,
      now: () => "2026-05-17T00:00:00.000Z",
      uuid: () => "snapshot-replacement",
    });

    expect(result.snapshotsSkipped).toBe(0);
    expect(
      repository.getAiBootLegacyScoreSnapshot(campId, "user-alice")
    ).toEqual({
      totalScore: 5,
      dimensionJson: JSON.stringify({ K: 2, H: 3, C: 0, S: 0, G: 0 }),
      snapshotAt: "2026-05-17T00:00:00.000Z",
    });

  });

  it("does not snapshot non-participants, excluded members, or operators", async () => {
    const repository = makeRepo();
    const campId = repository.getDefaultCampId()!;
    const periodId = insertPeriod(repository, campId);
    repository.ensureMember("member-excluded", campId);
    repository.ensureMember("member-operator", campId);
    repository.updateMember("user-alice", { isParticipant: false });
    repository.updateMember("member-excluded", {
      roleType: "student",
      isParticipant: true,
      isExcludedFromBoard: true,
    });
    repository.updateMember("member-operator", {
      roleType: "operator",
      isParticipant: true,
      isExcludedFromBoard: false,
    });
    addDimensionScores(repository, "user-alice", periodId, { K: 1 });
    addDimensionScores(repository, "member-excluded", periodId, { K: 1 });
    addDimensionScores(repository, "member-operator", periodId, { K: 1 });

    const result = await runFreezeLegacyScores({
      repository,
      env: {} as NodeJS.ProcessEnv,
      now: () => "2026-05-17T00:00:00.000Z",
      uuid: () => "snapshot-ignored",
    });

    expect(result).toEqual({
      campId,
      snapshotsWritten: 0,
      snapshotsSkipped: 0,
    });
    expect(repository.getAiBootLegacyScoreSnapshot(campId, "user-alice")).toBeUndefined();
    expect(repository.getAiBootLegacyScoreSnapshot(campId, "member-excluded")).toBeUndefined();
    expect(repository.getAiBootLegacyScoreSnapshot(campId, "member-operator")).toBeUndefined();

  });

  it("snapshots hidden-from-board student participants for historical carryover", async () => {
    const repository = makeRepo();
    const campId = repository.getDefaultCampId()!;
    const periodId = insertPeriod(repository, campId);
    repository.setMemberHiddenFromBoard("user-alice", true);
    addDimensionScores(repository, "user-alice", periodId, { K: 8 });

    const result = await runFreezeLegacyScores({
      repository,
      env: {} as NodeJS.ProcessEnv,
      now: () => "2026-05-17T00:00:00.000Z",
      uuid: () => "snapshot-hidden",
    });

    expect(result.snapshotsWritten).toBe(1);
    expect(repository.getAiBootLegacyScoreSnapshot(campId, "user-alice")).toEqual({
      totalScore: 8,
      dimensionJson: JSON.stringify({ K: 8, H: 0, C: 0, S: 0, G: 0 }),
      snapshotAt: "2026-05-17T00:00:00.000Z",
    });
  });

  it("creates a complete zero snapshot for an eligible member with no v2 dimension scores", async () => {
    const repository = makeRepo();
    const campId = repository.getDefaultCampId()!;

    const result = await runFreezeLegacyScores({
      repository,
      env: {} as NodeJS.ProcessEnv,
      now: () => "2026-05-17T00:00:00.000Z",
      uuid: () => "snapshot-zero",
    });

    expect(result.snapshotsWritten).toBe(1);
    expect(repository.getAiBootLegacyScoreSnapshot(campId, "user-alice")).toEqual({
      totalScore: 0,
      dimensionJson: JSON.stringify({ K: 0, H: 0, C: 0, S: 0, G: 0 }),
      snapshotAt: "2026-05-17T00:00:00.000Z",
    });
  });

  it("preserves negative legacy totals produced by decremented dimension rows", async () => {
    const repository = makeRepo();
    const campId = repository.getDefaultCampId()!;
    const periodId = insertPeriod(repository, campId);
    repository.incrementMemberDimensionScore({
      memberId: "user-alice",
      periodId,
      dimension: "K",
      delta: 2,
      eventAt: "2026-05-16T01:00:00.000Z",
    });
    repository.decrementMemberDimensionScore({
      memberId: "user-alice",
      periodId,
      dimension: "K",
      delta: 5,
      eventAt: "2026-05-16T02:00:00.000Z",
    });

    const result = await runFreezeLegacyScores({
      repository,
      env: {} as NodeJS.ProcessEnv,
      now: () => "2026-05-17T00:00:00.000Z",
      uuid: () => "snapshot-negative",
    });

    expect(result.snapshotsWritten).toBe(1);
    expect(repository.getAiBootLegacyScoreSnapshot(campId, "user-alice")).toEqual({
      totalScore: -3,
      dimensionJson: JSON.stringify({ K: -3, H: 0, C: 0, S: 0, G: 0 }),
      snapshotAt: "2026-05-17T00:00:00.000Z",
    });
  });

  it("rolls back all freeze writes when one snapshot write fails", async () => {
    const repository = makeRepo();
    const campId = repository.getDefaultCampId()!;
    repository.ensureMember("user-bob", campId);
    repository.updateMember("user-bob", {
      roleType: "student",
      isParticipant: true,
      isExcludedFromBoard: false,
    });

    const originalUpsert =
      repository.upsertAiBootLegacyScoreSnapshot.bind(repository);
    let writes = 0;
    repository.upsertAiBootLegacyScoreSnapshot = (input) => {
      writes += 1;
      originalUpsert(input);
      if (writes === 1) {
        throw new Error("simulated write failure");
      }
    };

    await expect(
      runFreezeLegacyScores({
        repository,
        env: {} as NodeJS.ProcessEnv,
        now: () => "2026-05-17T00:00:00.000Z",
        uuid: () => `snapshot-${writes + 1}`,
      })
    ).rejects.toThrow("simulated write failure");

    expect(repository.getAiBootLegacyScoreSnapshot(campId, "user-alice")).toBeUndefined();
    expect(repository.getAiBootLegacyScoreSnapshot(campId, "user-bob")).toBeUndefined();
  });
});
