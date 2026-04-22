const USER_COOLDOWN_MS = 30_000;
const USER_HOURLY_LIMIT = 20;
const USER_HOURLY_WINDOW_MS = 60 * 60 * 1000;
const CHAT_PER_MINUTE_LIMIT = 30;
const CHAT_WINDOW_MS = 60 * 1000;

export type RateLimitReason =
  | "user_cooldown"
  | "user_hourly"
  | "chat_per_minute";

export interface RateLimitDecision {
  allowed: boolean;
  reason?: RateLimitReason;
  retryAfterSeconds?: number;
}

export interface RateLimiter {
  check(openId: string, chatId: string): RateLimitDecision;
  markUsed(openId: string, chatId: string): void;
}

interface UserState {
  lastUsedAt: number;
  hourlyTimestamps: number[];
}

export function createRateLimiter(): RateLimiter {
  const userStore = new Map<string, UserState>();
  const chatStore = new Map<string, number[]>();

  function pruneHourly(ts: number[]): number[] {
    const cutoff = Date.now() - USER_HOURLY_WINDOW_MS;
    return ts.filter((t) => t >= cutoff);
  }

  function pruneChat(ts: number[]): number[] {
    const cutoff = Date.now() - CHAT_WINDOW_MS;
    return ts.filter((t) => t >= cutoff);
  }

  return {
    check(openId: string, chatId: string): RateLimitDecision {
      const now = Date.now();
      const user = userStore.get(openId);

      if (user) {
        const elapsed = now - user.lastUsedAt;
        if (elapsed < USER_COOLDOWN_MS) {
          return {
            allowed: false,
            reason: "user_cooldown",
            retryAfterSeconds: Math.ceil((USER_COOLDOWN_MS - elapsed) / 1000)
          };
        }

        const recent = pruneHourly(user.hourlyTimestamps);
        if (recent.length >= USER_HOURLY_LIMIT) {
          const oldest = recent[0];
          return {
            allowed: false,
            reason: "user_hourly",
            retryAfterSeconds: Math.ceil(
              (oldest + USER_HOURLY_WINDOW_MS - now) / 1000
            )
          };
        }
      }

      const chat = chatStore.get(chatId) ?? [];
      const recentChat = pruneChat(chat);
      if (recentChat.length >= CHAT_PER_MINUTE_LIMIT) {
        return {
          allowed: false,
          reason: "chat_per_minute",
          retryAfterSeconds: Math.ceil(
            (recentChat[0] + CHAT_WINDOW_MS - now) / 1000
          )
        };
      }

      return { allowed: true };
    },

    markUsed(openId: string, chatId: string): void {
      const now = Date.now();
      const existing = userStore.get(openId);
      const hourlyTimestamps = existing
        ? pruneHourly([...existing.hourlyTimestamps, now])
        : [now];
      userStore.set(openId, { lastUsedAt: now, hourlyTimestamps });

      const existingChat = chatStore.get(chatId) ?? [];
      chatStore.set(chatId, pruneChat([...existingChat, now]));
    }
  };
}
