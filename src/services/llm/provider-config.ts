export type LlmProvider = "aliyun" | "openai_compatible";

export interface LlmProviderConfig {
  enabled: boolean;
  provider: LlmProvider;
  baseUrl: string;
  apiKey?: string;
  textModel: string;
  fileModel: string;
  timeoutMs: number;
  maxInputChars: number;
  concurrency: number;
}

const DEFAULT_ALIYUN_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1";

function readBoolean(value: string | undefined, fallback = false) {
  if (!value) {
    return fallback;
  }

  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function readInteger(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function readProvider(value: string | undefined): LlmProvider {
  return value === "openai_compatible" ? "openai_compatible" : "aliyun";
}

function resolveBaseUrl(provider: LlmProvider, value: string | undefined) {
  const trimmed = value?.trim();
  if (trimmed) {
    return trimmed.replace(/\/+$/, "");
  }

  if (provider === "aliyun") {
    return DEFAULT_ALIYUN_BASE_URL;
  }

  return "";
}

export function readLlmProviderConfig(env: NodeJS.ProcessEnv = process.env): LlmProviderConfig {
  const provider = readProvider(env.LLM_PROVIDER);
  const apiKey = env.LLM_API_KEY?.trim() || undefined;
  const baseUrl = resolveBaseUrl(provider, env.LLM_BASE_URL);
  const requestedEnabled = readBoolean(env.LLM_ENABLED, false);

  return {
    enabled: requestedEnabled && Boolean(apiKey) && Boolean(baseUrl),
    provider,
    baseUrl,
    apiKey,
    textModel: env.LLM_TEXT_MODEL?.trim() || "qwen3-flash",
    fileModel: env.LLM_FILE_MODEL?.trim() || "qwen-doc",
    timeoutMs: readInteger(env.LLM_TIMEOUT_MS, 15000),
    maxInputChars: readInteger(env.LLM_MAX_INPUT_CHARS, 6000),
    concurrency: readInteger(env.LLM_CONCURRENCY, 3)
  };
}
