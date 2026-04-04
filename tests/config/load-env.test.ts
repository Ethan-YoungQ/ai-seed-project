import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
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
});
