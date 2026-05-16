import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loadLocalEnv } from "../config/load-env.js";
import { SqliteRepository } from "../storage/sqlite-repository.js";

const DEFAULT_DAILY_GROUP_PRAISE_CAP = 20;

export type CutoverFailure =
  | "legacy_snapshots_missing"
  | "stale_review_required"
  | "score_event_missing_audit_text"
  | "notification_daily_cap_exceeded";

export interface CutoverCheckOptions {
  repository?: SqliteRepository;
  env?: NodeJS.ProcessEnv;
  databaseUrl?: string;
  campId?: string;
  now?: () => string;
  stdout?: (line: string) => void;
}

export interface CutoverCheckResult {
  ok: boolean;
  failures: CutoverFailure[];
}

export function isDirectScriptRun(metaUrl: string, argvPath: string | undefined) {
  if (!argvPath) {
    return false;
  }

  return resolve(fileURLToPath(metaUrl)) === resolve(argvPath);
}

export async function runCutoverCheck(
  options: CutoverCheckOptions = {}
): Promise<CutoverCheckResult> {
  const env = options.env ?? process.env;
  const ownedRepo = !options.repository;
  const databaseUrl = options.databaseUrl ?? env.DATABASE_URL ?? "./data/app.db";
  const now = options.now ?? (() => new Date().toISOString());
  const stdout = options.stdout ?? ((line: string) => console.log(line));

  let repository: SqliteRepository;
  if (options.repository) {
    repository = options.repository;
  } else {
    mkdirSync(dirname(resolve(databaseUrl)), { recursive: true });
    repository = new SqliteRepository(databaseUrl);
  }

  try {
    const campId = options.campId ?? repository.getDefaultCampId();
    if (!campId) {
      throw new Error("Cannot run cutover check: no default camp found.");
    }

    const nowIso = now();
    const failures: CutoverFailure[] = [];
    if (repository.countAiBootLegacyScoreSnapshots(campId) === 0) {
      failures.push("legacy_snapshots_missing");
    }
    if (repository.countStaleAiBootReviewRequired({ campId, nowIso, olderThanHours: 24 }) > 0) {
      failures.push("stale_review_required");
    }
    if (repository.countAiBootScoreEventsMissingAuditText(campId) > 0) {
      failures.push("score_event_missing_audit_text");
    }

    const cap = parseDailyCap(env.AI_BOOT_DAILY_GROUP_PRAISE_CAP);
    const dayStartIso = utcDayStart(nowIso);
    const dayEndIso = new Date(new Date(dayStartIso).getTime() + 24 * 60 * 60 * 1000).toISOString();
    if (repository.countAiBootGroupPraiseNotificationsForDay({
      campId,
      dayStartIso,
      dayEndIso,
    }) > cap) {
      failures.push("notification_daily_cap_exceeded");
    }

    const result: CutoverCheckResult = {
      ok: failures.length === 0,
      failures,
    };
    stdout(JSON.stringify(result));
    return result;
  } finally {
    if (ownedRepo) {
      repository.close();
    }
  }
}

function parseDailyCap(value: string | undefined): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return DEFAULT_DAILY_GROUP_PRAISE_CAP;
  }
  return Math.floor(parsed);
}

function utcDayStart(nowIso: string): string {
  return `${nowIso.slice(0, 10)}T00:00:00.000Z`;
}

function parseCliArgs(argv: string[]): Pick<CutoverCheckOptions, "campId"> {
  const options: Pick<CutoverCheckOptions, "campId"> = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--camp-id") {
      options.campId = argv[++index];
    }
  }
  return options;
}

const isDirectRun =
  typeof process !== "undefined" &&
  isDirectScriptRun(import.meta.url, process.argv[1]);

if (isDirectRun) {
  loadLocalEnv();
  const result = await runCutoverCheck({ env: process.env, ...parseCliArgs(process.argv.slice(2)) });
  if (!result.ok) {
    process.exitCode = 1;
  }
}
