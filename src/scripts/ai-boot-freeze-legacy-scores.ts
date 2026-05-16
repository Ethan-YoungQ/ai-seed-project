import { mkdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname, resolve } from "node:path";

import { loadLocalEnv } from "../config/load-env.js";
import { SqliteRepository } from "../storage/sqlite-repository.js";

export interface FreezeLegacyScoresOptions {
  repository?: SqliteRepository;
  env?: NodeJS.ProcessEnv;
  databaseUrl?: string;
  now?: () => string;
  uuid?: () => string;
}

export interface FreezeLegacyScoresResult {
  campId: string;
  snapshotsWritten: number;
  snapshotsSkipped: number;
}

export async function runFreezeLegacyScores(
  options: FreezeLegacyScoresOptions = {}
): Promise<FreezeLegacyScoresResult> {
  const env = options.env ?? process.env;
  const ownedRepo = !options.repository;
  const databaseUrl =
    options.databaseUrl ?? env.DATABASE_URL ?? "./data/app.db";
  const now = options.now ?? (() => new Date().toISOString());
  const uuid = options.uuid ?? randomUUID;

  let repository: SqliteRepository;
  if (options.repository) {
    repository = options.repository;
  } else {
    mkdirSync(dirname(resolve(databaseUrl)), { recursive: true });
    repository = new SqliteRepository(databaseUrl);
  }

  try {
    const campId = repository.getDefaultCampId();
    if (!campId) {
      throw new Error("Cannot freeze legacy scores: no default camp found.");
    }

    const forceFreeze = env.AI_BOOT_FORCE_FREEZE === "true";
    const snapshotAt = now();
    let snapshotsWritten = 0;
    let snapshotsSkipped = 0;

    for (const member of repository.listEligibleStudents(campId)) {
      const existing = repository.getAiBootLegacyScoreSnapshot(campId, member.id);
      if (existing && !forceFreeze) {
        snapshotsSkipped += 1;
        continue;
      }

      const scores = repository.fetchAiBootLegacyDimensionScoreTotals(member.id);
      repository.upsertAiBootLegacyScoreSnapshot({
        id: uuid(),
        campId,
        memberId: member.id,
        totalScore: scores.totalScore,
        dimensionJson: JSON.stringify(scores.dimensions),
        sourceNote: "freeze:v2_member_dimension_scores",
        snapshotAt
      });
      snapshotsWritten += 1;
    }

    console.log(
      `snapshots_written=${snapshotsWritten} camp=${campId} snapshots_skipped=${snapshotsSkipped}`
    );

    return { campId, snapshotsWritten, snapshotsSkipped };
  } finally {
    if (ownedRepo) {
      repository.close();
    }
  }
}

const isDirectRun =
  typeof process !== "undefined" &&
  process.argv[1] &&
  import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/"));

if (isDirectRun) {
  loadLocalEnv();
  await runFreezeLegacyScores({ env: process.env });
}
