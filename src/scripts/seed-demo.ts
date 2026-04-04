import { loadLocalEnv } from "../config/load-env";
import { SqliteRepository } from "../storage/sqlite-repository";

loadLocalEnv();
const repository = new SqliteRepository(process.env.DATABASE_URL ?? "./data/app.db");
repository.seedDemo();
repository.close();

console.log("Seeded demo camp, members, and sessions.");
