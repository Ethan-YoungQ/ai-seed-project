import { describe, expect, it } from "vitest";
import { readAiBootConfig } from "../../../../src/services/feishu/ai-boot/config";

describe("readAiBootConfig", () => {
  it("defaults to legacy mode so source deploys do not unexpectedly enable v3", () => {
    expect(readAiBootConfig({}).engineMode).toBe("legacy");
  });

  it("accepts v3_shadow and v3_live explicitly", () => {
    expect(readAiBootConfig({ AI_BOOT_ENGINE_MODE: "v3_shadow" }).engineMode).toBe("v3_shadow");
    expect(readAiBootConfig({ AI_BOOT_ENGINE_MODE: "v3_live" }).engineMode).toBe("v3_live");
  });

  it("falls back to legacy for invalid values", () => {
    expect(readAiBootConfig({ AI_BOOT_ENGINE_MODE: "semantic" }).engineMode).toBe("legacy");
  });

  it("defaults feature flags to false", () => {
    expect(readAiBootConfig({}).allowGroupPraise).toBe(false);
    expect(readAiBootConfig({}).allowDailyDigest).toBe(false);
  });

  it("accepts true and 1 as truthy feature flag values", () => {
    expect(readAiBootConfig({ AI_BOOT_ALLOW_GROUP_PRAISE: "true" }).allowGroupPraise).toBe(true);
    expect(readAiBootConfig({ AI_BOOT_ALLOW_GROUP_PRAISE: "1" }).allowGroupPraise).toBe(true);
    expect(readAiBootConfig({ AI_BOOT_ALLOW_DAILY_DIGEST: "true" }).allowDailyDigest).toBe(true);
    expect(readAiBootConfig({ AI_BOOT_ALLOW_DAILY_DIGEST: "1" }).allowDailyDigest).toBe(true);
  });

  it("keeps false and invalid feature flag values disabled", () => {
    expect(readAiBootConfig({ AI_BOOT_ALLOW_GROUP_PRAISE: "false" }).allowGroupPraise).toBe(false);
    expect(readAiBootConfig({ AI_BOOT_ALLOW_GROUP_PRAISE: "semantic" }).allowGroupPraise).toBe(false);
    expect(readAiBootConfig({ AI_BOOT_ALLOW_DAILY_DIGEST: "false" }).allowDailyDigest).toBe(false);
    expect(readAiBootConfig({ AI_BOOT_ALLOW_DAILY_DIGEST: "semantic" }).allowDailyDigest).toBe(false);
  });
});
