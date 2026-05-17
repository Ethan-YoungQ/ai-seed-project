import { mkdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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

export function isDirectScriptRun(metaUrl: string, argvPath: string | undefined) {
  if (!argvPath) {
    return false;
  }

  return resolve(fileURLToPath(metaUrl)) === resolve(argvPath);
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
    const result = repository.runAiBootLegacyFreezeTransaction(() => {
      const orphanRows =
        repository.listAiBootLegacyOrphanDimensionScoreRows(campId);
      if (orphanRows.length > 0) {
        const sample = orphanRows
          .slice(0, 3)
          .map((row) => `${row.memberId}:${row.periodId}:${row.dimension}`)
          .join(",");
        throw new Error(
          `Cannot freeze legacy scores: found ${orphanRows.length} orphan dimension score row(s) with missing period records for camp ${campId}. sample=${sample}`
        );
      }

      const snapshotAt = now();
      let snapshotsWritten = 0;
      let snapshotsSkipped = 0;

      for (const member of repository.listAiBootLegacyFreezeCandidates(campId)) {
        const existing = repository.getAiBootLegacyScoreSnapshot(campId, member.id);
        if (existing && !forceFreeze) {
          snapshotsSkipped += 1;
          continue;
        }

        const scores = repository.fetchAiBootLegacyDimensionScoreTotals(
          campId,
          member.id
        );
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

      return { campId, snapshotsWritten, snapshotsSkipped };
    });

    console.log(
      `snapshots_written=${result.snapshotsWritten} camp=${campId} snapshots_skipped=${result.snapshotsSkipped}`
    );

    return result;
  } finally {
    if (ownedRepo) {
      repository.close();
    }
  }
}

const isDirectRun =
  typeof process !== "undefined" &&
  isDirectScriptRun(import.meta.url, process.argv[1]);

if (isDirectRun) {
  loadLocalEnv();
  await runFreezeLegacyScores({ env: process.env });
}
