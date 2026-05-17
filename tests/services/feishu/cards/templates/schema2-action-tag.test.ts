import { describe, expect, test } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

describe("Feishu card schema 2.0 templates", () => {
  test("do not use deprecated action rows", () => {
    const templatesDir = join(process.cwd(), "src/services/feishu/cards/templates");
    const offenders = readdirSync(templatesDir)
      .filter((name) => name.endsWith(".ts"))
      .filter((name) => {
        const source = readFileSync(join(templatesDir, name), "utf8");
        return /schema:\s*["']2\.0["']/.test(source) && /tag:\s*["']action["']/.test(source);
      });

    expect(offenders).toEqual([]);
  });
});
