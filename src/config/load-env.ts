import { existsSync } from "node:fs";
import { resolve } from "node:path";

const loadedEnvFiles = new Set<string>();

export function loadLocalEnv(workdir = process.cwd()) {
  const envPath = resolve(workdir, ".env");

  if (loadedEnvFiles.has(envPath) || !existsSync(envPath)) {
    return envPath;
  }

  process.loadEnvFile(envPath);
  loadedEnvFiles.add(envPath);
  return envPath;
}
