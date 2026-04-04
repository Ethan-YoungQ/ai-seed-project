export type FeishuEventMode = "disabled" | "webhook" | "long_connection";
export type FeishuReceiveIdType = "chat_id" | "open_id" | "email" | "union_id";

export interface FeishuBaseTablesConfig {
  members?: string;
  rawEvents?: string;
  scores?: string;
  warnings?: string;
  snapshots?: string;
}

export interface FeishuConfig {
  enabled: boolean;
  appId?: string;
  appSecret?: string;
  verificationToken?: string;
  encryptKey?: string;
  eventMode: FeishuEventMode;
  botChatId?: string;
  botReceiveIdType: FeishuReceiveIdType;
  base: {
    enabled: boolean;
    appToken?: string;
    tables: FeishuBaseTablesConfig;
  };
}

function readBoolean(value: string | undefined, fallback = false) {
  if (!value) {
    return fallback;
  }

  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function readEventMode(value: string | undefined): FeishuEventMode {
  if (value === "webhook" || value === "long_connection" || value === "disabled") {
    return value;
  }

  return "disabled";
}

function readReceiveIdType(value: string | undefined): FeishuReceiveIdType {
  if (value === "chat_id" || value === "open_id" || value === "email" || value === "union_id") {
    return value;
  }

  return "chat_id";
}

export function readFeishuConfig(env: NodeJS.ProcessEnv = process.env): FeishuConfig {
  const appId = env.FEISHU_APP_ID?.trim() || undefined;
  const appSecret = env.FEISHU_APP_SECRET?.trim() || undefined;

  return {
    enabled: Boolean(appId && appSecret),
    appId,
    appSecret,
    verificationToken: env.FEISHU_VERIFICATION_TOKEN?.trim() || undefined,
    encryptKey: env.FEISHU_ENCRYPT_KEY?.trim() || undefined,
    eventMode: readEventMode(env.FEISHU_EVENT_MODE),
    botChatId: env.FEISHU_BOT_CHAT_ID?.trim() || undefined,
    botReceiveIdType: readReceiveIdType(env.FEISHU_BOT_RECEIVE_ID_TYPE),
    base: {
      enabled: readBoolean(env.FEISHU_BASE_ENABLED, false),
      appToken: env.FEISHU_BASE_APP_TOKEN?.trim() || undefined,
      tables: {
        members: env.FEISHU_BASE_MEMBERS_TABLE?.trim() || undefined,
        rawEvents: env.FEISHU_BASE_RAW_EVENTS_TABLE?.trim() || undefined,
        scores: env.FEISHU_BASE_SCORES_TABLE?.trim() || undefined,
        warnings: env.FEISHU_BASE_WARNINGS_TABLE?.trim() || undefined,
        snapshots: env.FEISHU_BASE_SNAPSHOTS_TABLE?.trim() || undefined
      }
    }
  };
}

export function isFeishuReady(config: FeishuConfig) {
  return config.enabled;
}

export function withResolvedFeishuConfig(config: Omit<FeishuConfig, "enabled"> & { enabled?: boolean }): FeishuConfig {
  return {
    ...config,
    enabled: Boolean(config.appId && config.appSecret)
  };
}
