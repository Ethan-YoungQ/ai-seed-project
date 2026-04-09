import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { loadLocalEnv } from "../config/load-env.js";
import { SqliteRepository } from "../storage/sqlite-repository.js";

loadLocalEnv();

const databaseUrl = process.env.DATABASE_URL ?? "./data/app.db";
const configuredChatId = process.env.FEISHU_BOT_CHAT_ID?.trim() || "";
mkdirSync(dirname(resolve(databaseUrl)), { recursive: true });

const repository = new SqliteRepository(databaseUrl);
let defaultCampId = repository.getDefaultCampId();
let mutated = false;

if (!defaultCampId) {
  repository.seedDemo();
  defaultCampId = repository.getDefaultCampId();
  mutated = true;
  console.log("Seeded bootstrap demo data because the camps table was empty.");
}

if (defaultCampId && configuredChatId) {
  const camp = repository.getCamp(defaultCampId);
  if (camp && camp.groupId !== configuredChatId) {
    repository.updateCampGroupId(defaultCampId, configuredChatId);
    mutated = true;
    console.log(`Aligned camp ${defaultCampId} group_id with FEISHU_BOT_CHAT_ID.`);
  }
}

repository.close();

if (!mutated) {
  console.log(`Bootstrap data already present for camp ${defaultCampId ?? "unknown"}.`);
}
