import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { loadLocalEnv } from "../../src/config/load-env";

describe("loadLocalEnv", () => {
  const originalAppId = process.env.FEISHU_APP_ID;
  const createdDirs: string[] = [];

  afterEach(() => {
    if (originalAppId === undefined) {
      delete process.env.FEISHU_APP_ID;
    } else {
      process.env.FEISHU_APP_ID = originalAppId;
    }

    for (const dir of createdDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("loads .env values from a target workspace", () => {
    const dir = mkdtempSync(join(tmpdir(), "feishu-env-"));
    createdDirs.push(dir);
    writeFileSync(join(dir, ".env"), "FEISHU_APP_ID=cli_from_file\n", "utf8");
    delete process.env.FEISHU_APP_ID;

    loadLocalEnv(dir);

    expect(process.env.FEISHU_APP_ID).toBe("cli_from_file");
  });

  it("keeps the example env file on the phase-one provider-neutral LLM contract", () => {
    const exampleEnv = readFileSync(join(process.cwd(), ".env.example"), "utf8");

    expect(exampleEnv).toContain("LLM_ENABLED=");
    expect(exampleEnv).toContain("LLM_PROVIDER=");
    expect(exampleEnv).toContain("LLM_BASE_URL=");
    expect(exampleEnv).toContain("LLM_API_KEY=");
    expect(exampleEnv).toContain("LLM_TEXT_MODEL=");
    expect(exampleEnv).toContain("LLM_FILE_MODEL=");
    expect(exampleEnv).toContain("LLM_TIMEOUT_MS=");
    expect(exampleEnv).toContain("LLM_MAX_INPUT_CHARS=");
    expect(exampleEnv).toContain("LLM_CONCURRENCY=");
    expect(exampleEnv).toContain("FEISHU_VERIFICATION_TOKEN=");
    expect(exampleEnv).toContain("FEISHU_ENCRYPT_KEY=");
    expect(exampleEnv).toContain("FEISHU_BASE_APP_TOKEN=");
    expect(exampleEnv).toContain("FEISHU_BASE_MEMBERS_TABLE=");
    expect(exampleEnv).toContain("FEISHU_BASE_RAW_EVENTS_TABLE=");
    expect(exampleEnv).toContain("FEISHU_BASE_SCORES_TABLE=");
    expect(exampleEnv).toContain("FEISHU_BASE_WARNINGS_TABLE=");
    expect(exampleEnv).toContain("FEISHU_BASE_SNAPSHOTS_TABLE=");
    expect(exampleEnv).not.toContain("OPENAI_API_KEY");
    expect(exampleEnv).not.toContain("OPENAI_MODEL");
  });
});
