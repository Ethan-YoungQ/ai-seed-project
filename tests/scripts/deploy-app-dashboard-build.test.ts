import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

describe("deploy-app.sh", () => {
  test("builds dashboard assets before restarting the service", () => {
    const script = readFileSync("scripts/ops/deploy-app.sh", "utf8");

    expect(script).toContain('"$NPM_BIN" --prefix apps/dashboard');
    expect(script).toContain("run build");
    expect(script.indexOf("--prefix apps/dashboard")).toBeLessThan(script.indexOf("systemctl restart"));
  });
});
