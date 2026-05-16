import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../src/app.js";

describe("GET /api/feishu/status", () => {
  const aiBootEnvKeys = [
    "AI_BOOT_ENGINE_MODE",
    "AI_BOOT_ALLOW_GROUP_PRAISE",
    "AI_BOOT_ALLOW_DAILY_DIGEST",
  ] as const;
  const apps: Array<Awaited<ReturnType<typeof createApp>>> = [];
  const originalEnv = new Map<string, string | undefined>();

  beforeEach(() => {
    originalEnv.clear();
    for (const key of aiBootEnvKeys) {
      originalEnv.set(key, process.env[key]);
    }
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    for (const key of aiBootEnvKeys) {
      const value = originalEnv.get(key);
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    while (apps.length > 0) {
      const app = apps.pop();
      await app?.close();
    }
  });

  it("includes default AI Boot runtime config", async () => {
    for (const key of aiBootEnvKeys) {
      delete process.env[key];
    }

    const app = await createApp({ databaseUrl: ":memory:" });
    apps.push(app);

    const res = await app.inject({ method: "GET", url: "/api/feishu/status" });

    expect(res.statusCode).toBe(200);
    expect(res.json().aiBoot).toEqual({
      engineMode: "legacy",
      allowGroupPraise: false,
      allowDailyDigest: false,
    });
  });

  it("includes configured AI Boot runtime config", async () => {
    vi.stubEnv("AI_BOOT_ENGINE_MODE", "v3_shadow");
    vi.stubEnv("AI_BOOT_ALLOW_GROUP_PRAISE", "true");
    vi.stubEnv("AI_BOOT_ALLOW_DAILY_DIGEST", "1");

    const app = await createApp({ databaseUrl: ":memory:" });
    apps.push(app);

    const res = await app.inject({ method: "GET", url: "/api/feishu/status" });

    expect(res.statusCode).toBe(200);
    expect(res.json().aiBoot).toEqual({
      engineMode: "v3_shadow",
      allowGroupPraise: true,
      allowDailyDigest: true,
    });
  });
});
