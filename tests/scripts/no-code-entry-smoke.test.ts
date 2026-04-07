import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const expectedFiles = [
  "scripts/ops/bootstrap-server.sh",
  "scripts/ops/deploy-app.sh",
  "scripts/ops/check-health.sh",
  "scripts/ops/backup-db.sh",
  "scripts/ops/windows-init.ps1",
  "scripts/ops/windows-deploy.ps1",
  "scripts/ops/windows-check.ps1",
  "scripts/ops/mac-init.command",
  "scripts/ops/mac-deploy.command",
  "scripts/ops/mac-check.command",
  "deploy/systemd/ai-seed-project.service",
  "docs/ops/aliyun-mcp-runbook.md",
  "docs/ops/no-code-operator-guide.md",
];

describe("no-code entry smoke", () => {
  it("exposes the phase-one operator entry points", () => {
    for (const file of expectedFiles) {
      expect(existsSync(file), `${file} should exist`).toBe(true);
    }
  });

  it("registers ops package scripts", () => {
    const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
      scripts?: Record<string, string>;
    };

    expect(packageJson.scripts?.["ops:bootstrap"]).toBe("bash scripts/ops/bootstrap-server.sh");
    expect(packageJson.scripts?.["ops:deploy"]).toBe("bash scripts/ops/deploy-app.sh");
    expect(packageJson.scripts?.["ops:check"]).toBe("bash scripts/ops/check-health.sh");
    expect(packageJson.scripts?.["ops:backup"]).toBe("bash scripts/ops/backup-db.sh");
  });

  it("documents Aliyun MCP as preferred and scripts as fallback", () => {
    const runbook = readFileSync("docs/ops/aliyun-mcp-runbook.md", "utf8");
    expect(runbook).toContain("优先走 Aliyun MCP");
    expect(runbook).toContain("脚本/SSH/Cloud Assistant");
  });

  it("documents one-click no-code operator flows", () => {
    const guide = readFileSync("docs/ops/no-code-operator-guide.md", "utf8");
    expect(guide).toContain("一键启动");
    expect(guide).toContain("一键进入");
    expect(guide).toContain("学员");
    expect(guide).toContain("运营");
  });
});
