import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";

import * as schema from "./schema.js";

const databaseUrl = process.env.DATABASE_URL ?? "./data/app.db";

export function createDatabase() {
  const sqlite = new Database(databaseUrl);
  return drizzle(sqlite, { schema });
}

export type AppDatabase = ReturnType<typeof createDatabase>;
