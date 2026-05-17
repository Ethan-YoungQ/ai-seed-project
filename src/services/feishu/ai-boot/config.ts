export type AiBootEngineMode = "legacy" | "v3_shadow" | "v3_live";

export interface AiBootConfig {
  engineMode: AiBootEngineMode;
  allowGroupPraise: boolean;
  allowDailyDigest: boolean;
}

function readMode(value: string | undefined): AiBootEngineMode {
  if (value === "v3_shadow" || value === "v3_live") return value;
  return "legacy";
}

function readBoolean(value: string | undefined, fallback: boolean): boolean {
  if (!value) return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

export function readAiBootConfig(env: Partial<NodeJS.ProcessEnv> = process.env): AiBootConfig {
  return {
    engineMode: readMode(env.AI_BOOT_ENGINE_MODE),
    allowGroupPraise: readBoolean(env.AI_BOOT_ALLOW_GROUP_PRAISE, false),
    allowDailyDigest: readBoolean(env.AI_BOOT_ALLOW_DAILY_DIGEST, false),
  };
}
