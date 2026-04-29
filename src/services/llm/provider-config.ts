export type LlmProvider = "aliyun" | "glm" | "openai_compatible";
export type LlmFileExtractor = "openai_file_chat" | "glm_file_parser";
export type GlmFileParserToolType = "lite" | "expert" | "prime";

export interface LlmProviderConfig {
  enabled: boolean;
  provider: LlmProvider;
  baseUrl: string;
  apiKey?: string;
  textModel: string;
  /** Vision model for multimodal (image) scoring. Defaults to "" when unset. */
  visionModel: string;
  fileModel: string;
  fileExtractor: LlmFileExtractor;
  fileParserToolType: GlmFileParserToolType;
  timeoutMs: number;
  maxInputChars: number;
  concurrency: number;
}

const DEFAULT_ALIYUN_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1";
const DEFAULT_GLM_BASE_URL = "https://open.bigmodel.cn/api/paas/v4";

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
  if (value === "aliyun") {
    return "aliyun";
  }

  if (value === "glm") {
    return "glm";
  }

  return "openai_compatible";
}

function resolveBaseUrl(provider: LlmProvider, value: string | undefined) {
  const trimmed = value?.trim();
  if (trimmed) {
    return trimmed.replace(/\/+$/, "");
  }

  if (provider === "aliyun") {
    return DEFAULT_ALIYUN_BASE_URL;
  }

  if (provider === "glm") {
    return DEFAULT_GLM_BASE_URL;
  }

  return "";
}

function readFileExtractor(
  provider: LlmProvider,
  value: string | undefined
): LlmFileExtractor {
  if (value === "openai_file_chat" || value === "glm_file_parser") {
    return value;
  }

  return provider === "glm" ? "glm_file_parser" : "openai_file_chat";
}

function readFileParserToolType(value: string | undefined): GlmFileParserToolType {
  return value === "expert" || value === "prime" ? value : "lite";
}

export function readLlmProviderConfig(env: NodeJS.ProcessEnv = process.env): LlmProviderConfig {
  const provider = readProvider(env.LLM_PROVIDER);
  const apiKey = env.LLM_API_KEY?.trim() || undefined;
  const baseUrl = resolveBaseUrl(provider, env.LLM_BASE_URL);
  const requestedEnabled = readBoolean(env.LLM_ENABLED, false);
  const textModel =
    env.LLM_TEXT_MODEL?.trim() || (provider === "glm" ? "glm-4.7" : "qwen3-flash");
  const visionModel = env.LLM_VISION_MODEL?.trim() || "";
  const fileModel = env.LLM_FILE_MODEL?.trim() || (provider === "glm" ? "" : "qwen-doc");

  return {
    enabled: requestedEnabled && Boolean(apiKey) && Boolean(baseUrl),
    provider,
    baseUrl,
    apiKey,
    textModel,
    visionModel,
    fileModel,
    fileExtractor: readFileExtractor(provider, env.LLM_FILE_EXTRACTOR),
    fileParserToolType: readFileParserToolType(env.LLM_FILE_PARSER_TOOL_TYPE),
    timeoutMs: readInteger(env.LLM_TIMEOUT_MS, 15000),
    maxInputChars: readInteger(env.LLM_MAX_INPUT_CHARS, 6000),
    concurrency: readInteger(env.LLM_CONCURRENCY, 3)
  };
}
