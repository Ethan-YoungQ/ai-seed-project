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
});
