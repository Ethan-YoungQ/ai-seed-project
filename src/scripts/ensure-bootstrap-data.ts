import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { loadLocalEnv } from "../config/load-env.js";
import { SqliteRepository } from "../storage/sqlite-repository.js";

export interface EnsureBootstrapOptions {
  repository?: SqliteRepository;
  env?: NodeJS.ProcessEnv;
  databaseUrl?: string;
}

export interface EnsureBootstrapResult {
  mutated: boolean;
  campId: string | null;
}

/**
 * Ensure a window shell row exists for the given code.
 * Idempotent: if the row already exists, this is a no-op.
 */
function ensureWindowShell(
  repository: SqliteRepository,
  campId: string,
  code: string
): boolean {
  const existing = repository.findWindowByCode(campId, code);
  if (existing) return false;

  repository.insertWindowShell({
    code,
    campId,
    isFinal: false,
    createdAt: new Date().toISOString(),
  });
  return true;
}

/**
 * Promote members whose Feishu open IDs appear in the given list
 * to operator role with hidden_from_board=true.
 * Idempotent: members already promoted are skipped.
 */
function promoteBootstrapOperators(
  repository: SqliteRepository,
  openIds: string[]
): boolean {
  let anyMutated = false;
  for (const openId of openIds) {
    const member = repository.findMemberByFeishuOpenId(openId);
    if (!member) continue;
    if (member.roleType === "operator") continue;

    repository.patchMemberForAdmin(member.id, {
      roleType: "operator",
      hiddenFromBoard: true,
    });
    anyMutated = true;
  }
  return anyMutated;
}

/**
 * Seeds bootstrap data: ensures the demo camp exists, creates W1/W2
 * window shells, and promotes configured bootstrap operators.
 *
 * Fully injectable: tests pass a :memory: repository and an in-memory
 * env map. The top-level entrypoint passes process.env.
 */
export async function runEnsureBootstrap(
  options: EnsureBootstrapOptions = {}
): Promise<EnsureBootstrapResult> {
  const env = options.env ?? process.env;
  const ownedRepo = !options.repository;
  const databaseUrl =
    options.databaseUrl ?? env.DATABASE_URL ?? "./data/app.db";

  let repository: SqliteRepository;
  if (options.repository) {
    repository = options.repository;
  } else {
    mkdirSync(dirname(resolve(databaseUrl)), { recursive: true });
    repository = new SqliteRepository(databaseUrl);
  }

  let mutated = false;

  // Step 1: Ensure camp exists (legacy seed)
  let defaultCampId = repository.getDefaultCampId();
  if (!defaultCampId) {
    repository.seedDemo();
    defaultCampId = repository.getDefaultCampId();
    mutated = true;
    console.log(
      "Seeded bootstrap demo data because the camps table was empty."
    );
  }

  // Step 2: Align group_id if configured
  const configuredChatId = env.FEISHU_BOT_CHAT_ID?.trim() || "";
  if (defaultCampId && configuredChatId) {
    const camp = repository.getCamp(defaultCampId);
    if (camp && camp.groupId !== configuredChatId) {
      repository.updateCampGroupId(defaultCampId, configuredChatId);
      mutated = true;
      console.log(
        `Aligned camp ${defaultCampId} group_id with FEISHU_BOT_CHAT_ID.`
      );
    }
  }

  // Step 3: Ensure W1 and W2 window shells exist
  if (defaultCampId) {
    if (ensureWindowShell(repository, defaultCampId, "W1")) {
      mutated = true;
    }
    if (ensureWindowShell(repository, defaultCampId, "W2")) {
      mutated = true;
    }
  }

  // Step 4: Promote bootstrap operators
  const operatorCsv = env.BOOTSTRAP_OPERATOR_OPEN_IDS?.trim() ?? "";
  if (operatorCsv) {
    const openIds = operatorCsv
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    if (openIds.length > 0) {
      if (promoteBootstrapOperators(repository, openIds)) {
        mutated = true;
      }
    }
  }

  if (ownedRepo) {
    repository.close();
  }

  if (!mutated) {
    console.log(
      `Bootstrap data already present for camp ${defaultCampId ?? "unknown"}.`
    );
  }

  return { mutated, campId: defaultCampId ?? null };
}

// Top-level entrypoint — only runs when executed directly, not when imported
const isDirectRun =
  typeof process !== "undefined" &&
  process.argv[1] &&
  import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/"));

if (isDirectRun) {
  loadLocalEnv();
  await runEnsureBootstrap({ env: process.env });
}
