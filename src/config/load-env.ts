import { existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Loads environment variables from a local `.env` file (once per path).
 *
 * Documented env keys (see `.env.example`):
 * - PORT: HTTP server port (default 3000)
 * - APP_ENV: runtime environment label
 * - DATABASE_URL: path to SQLite file
 * - LLM_ENABLED: enable LLM scoring (true/false)
 * - LLM_PROVIDER: LLM provider name (glm, aliyun, openai_compatible)
 * - LLM_BASE_URL: LLM API base URL
 * - LLM_API_KEY: LLM API key
 * - LLM_TEXT_MODEL: model used for text scoring
 * - LLM_CONCURRENCY: max concurrent LLM scoring requests (default 3)
 * - LLM_RATE_LIMIT_PER_SEC: max requests per second for LLM worker (default 5)
 * - LLM_POLL_INTERVAL_MS: worker poll interval in ms when queue empty (default 1500)
 * - LLM_TASK_TIMEOUT_MS: per-task timeout in ms before retry (default 30000)
 * - LLM_MAX_ATTEMPTS: total attempts per task before review_required (default 3)
 * - BOOTSTRAP_OPERATOR_OPEN_IDS: comma-separated Feishu open ids to auto-promote
 */

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
