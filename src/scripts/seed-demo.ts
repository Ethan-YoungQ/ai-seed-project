import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { loadLocalEnv } from "../config/load-env.js";
import { SqliteRepository } from "../storage/sqlite-repository.js";

loadLocalEnv();
const databaseUrl = process.env.DATABASE_URL ?? "./data/app.db";
mkdirSync(dirname(resolve(databaseUrl)), { recursive: true });
const repository = new SqliteRepository(databaseUrl);
repository.seedDemo();
repository.close();

console.log("Seeded demo camp, members, and sessions.");
