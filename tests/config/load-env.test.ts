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

    const keys = new Set(
      exampleEnv
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && !line.startsWith("#"))
        .map((line) => line.split("=", 1)[0] ?? "")
    );

    const expectedKeys = [
      "APP_ENV",
      "DATABASE_URL",
      "FEISHU_APP_ID",
      "FEISHU_APP_SECRET",
      "FEISHU_BASE_APP_TOKEN",
      "FEISHU_BASE_ENABLED",
      "FEISHU_BASE_MEMBERS_TABLE",
      "FEISHU_BASE_NAME",
      "FEISHU_BASE_RAW_EVENTS_TABLE",
      "FEISHU_BASE_SCORES_TABLE",
      "FEISHU_BASE_SNAPSHOTS_TABLE",
      "FEISHU_BASE_WARNINGS_TABLE",
      "FEISHU_BOT_CHAT_ID",
      "FEISHU_BOT_RECEIVE_ID_TYPE",
      "FEISHU_ENCRYPT_KEY",
      "FEISHU_EVENT_MODE",
      "FEISHU_LEARNER_HOME_DOC_TOKEN",
      "FEISHU_LEARNER_HOME_DOC_URL",
      "FEISHU_OPERATOR_HOME_DOC_TOKEN",
      "FEISHU_OPERATOR_HOME_DOC_URL",
      "FEISHU_TEST_CAMP_ID",
      "FEISHU_TEST_CHAT_ID",
      "FEISHU_TEST_CHAT_MEMBER_OPEN_IDS",
      "FEISHU_TEST_CHAT_NAME",
      "FEISHU_TEST_CHAT_OWNER_OPEN_ID",
      "FEISHU_VERIFICATION_TOKEN",
      "LLM_API_KEY",
      "LLM_BASE_URL",
      "LLM_CONCURRENCY",
      "LLM_ENABLED",
      "LLM_FILE_MODEL",
      "LLM_MAX_INPUT_CHARS",
      "LLM_PROVIDER",
      "LLM_TEXT_MODEL",
      "LLM_TIMEOUT_MS",
      "PORT"
    ];

    expect(Array.from(keys).sort()).toEqual([...expectedKeys].sort());

    expect(Array.from(keys).some((key) => key.startsWith("OPENAI_"))).toBe(false);
  });
});
