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
    expect(packageJson.scripts?.["seed:ensure"]).toBe("tsx src/scripts/ensure-bootstrap-data.ts");
  });

  it("keeps the systemd unit templated for no-code deployment", () => {
    const serviceUnit = readFileSync("deploy/systemd/ai-seed-project.service", "utf8");
    expect(serviceUnit).toContain("WorkingDirectory=__APP_DIR__");
    expect(serviceUnit).toContain("ExecStart=__NODE_BIN__ __APP_DIR__/dist/server.js");
    expect(serviceUnit).toContain("Environment=DATABASE_URL=__DATABASE_URL__");
    expect(serviceUnit).toContain("User=__RUN_USER__");
    expect(serviceUnit).toContain("Group=__RUN_GROUP__");
  });

  it("renders the bootstrap script responsible for service-user setup", () => {
    const script = readFileSync("scripts/ops/bootstrap-server.sh", "utf8");
    expect(script).toContain("RUN_USER");
    expect(script).toContain("render_service_file");
    expect(script).toContain("ensure_service_user");
    expect(script).toContain("escape_sed_replacement");
    expect(script).toContain("mktemp");
    expect(script).toContain("run_privileged env RUN_USER=\"$RUN_USER\"");
    expect(script).toContain("FALLBACK_SERVICE_FILE");
    expect(script).toContain("install -Dm644");
    expect(script).toContain("$FALLBACK_SERVICE_FILE");
    expect(script).toContain("$SERVICE_FILE");
  });

  it("uses local one-click wrappers to upload the current repo before remote execution", () => {
    const windowsInit = readFileSync("scripts/ops/windows-init.ps1", "utf8");
    const windowsDeploy = readFileSync("scripts/ops/windows-deploy.ps1", "utf8");
    const macInit = readFileSync("scripts/ops/mac-init.command", "utf8");
    const macDeploy = readFileSync("scripts/ops/mac-deploy.command", "utf8");

    for (const script of [windowsInit, windowsDeploy, macInit, macDeploy]) {
      expect(script).toContain("git");
      expect(script).toContain("archive");
      expect(script).toContain("scp");
      expect(script).toContain("tar -xf");
    }
  });

  it("documents Aliyun MCP as preferred and scripts as fallback", () => {
    const runbook = readFileSync("docs/ops/aliyun-mcp-runbook.md", "utf8");
    expect(runbook).toContain("MCP/OpenAPI");
    expect(runbook).toContain("SSH");
    expect(runbook).toContain("Cloud Assistant");
  });

  it("documents one-click no-code operator flows", () => {
    const guide = readFileSync("docs/ops/no-code-operator-guide.md", "utf8");
    expect(guide).toContain("Windows");
    expect(guide).toContain("macOS");
    expect(guide).toContain("Aliyun MCP");
    expect(guide).toContain("Cloud Assistant");
  });

  it("seeds bootstrap data during deploy without overwriting existing camps", () => {
    const deployScript = readFileSync("scripts/ops/deploy-app.sh", "utf8");
    const seedScript = readFileSync("src/scripts/ensure-bootstrap-data.ts", "utf8");

    expect(deployScript).toContain("\"$NPM_BIN\" run seed:ensure");
    expect(seedScript).toContain("Seeded bootstrap demo data because the camps table was empty.");
    expect(seedScript).toContain("Aligned camp");
    expect(seedScript).toContain("Bootstrap data already present");
  });
});
