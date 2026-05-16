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

  it("seeds bootstrap data during deploy without overwriting existing camps", () => {
    const deployScript = readFileSync("scripts/ops/deploy-app.sh", "utf8");
    const seedScript = readFileSync("src/scripts/ensure-bootstrap-data.ts", "utf8");

    expect(deployScript).toContain("\"$NPM_BIN\" run seed:ensure");
    expect(seedScript).toContain("Seeded bootstrap demo data because the camps table was empty.");
    expect(seedScript).toContain("Aligned camp");
    expect(seedScript).toContain("Bootstrap data already present");
  });

  it("prints AI Boot status during health checks when available", () => {
    const checkScript = readFileSync("scripts/ops/check-health.sh", "utf8");

    expect(checkScript).toContain("/api/feishu/status");
    expect(checkScript).toContain("engineMode");
    expect(checkScript).toContain("allowGroupPraise");
    expect(checkScript).toContain("allowDailyDigest");
    expect(checkScript).not.toContain("jq");
    expect(checkScript).not.toContain("AI Boot status unavailable");
    expect(checkScript).not.toContain("|| true");
    expect(checkScript).toContain("Missing aiBoot.engineMode");
  });

  it("keeps deploy shadow-safe without auto-enabling AI Boot modes", () => {
    const deployScript = readFileSync("scripts/ops/deploy-app.sh", "utf8");

    expect(deployScript).toContain("AI_BOOT_ENGINE_MODE");
    expect(deployScript).toContain("v3_shadow");
    expect(deployScript).toContain("does not change production AI Boot mode");
    expect(deployScript).toContain("\"$NPM_BIN\" run seed:ensure");
    expect(deployScript).not.toContain("systemctl restart \"$SERVICE_NAME\" || true");
    expect(deployScript).not.toContain("sudo systemctl restart \"$SERVICE_NAME\" || true");
  });

  it("documents the production shadow cutover and rollback sequence", () => {
    const runbook = readFileSync(
      "docs/scoring-audit/2026-05-16-ai-boot-cutover-runbook.md",
      "utf8",
    );

    expect(runbook).toContain("npm run build\nnpm test\nnpm run ai-boot:freeze-legacy\nnpm run ai-boot:cutover-check");
    expect(runbook).toContain("cd /opt/ai-seed-project");
    expect(runbook).toContain("ENV_FILE=/opt/ai-seed-project/.env");
    expect(runbook).toContain("BACKUP_OUTPUT=\"$(./scripts/ops/backup-db.sh)\"");
    expect(runbook).toContain("BACKUP_PATH=");
    expect(runbook).toContain("test -f \"$BACKUP_PATH\"");
    expect(runbook).toContain("AI_BOOT_ENGINE_MODE=v3_shadow");
    expect(runbook).toContain("AI_BOOT_ALLOW_GROUP_PRAISE=false");
    expect(runbook).toContain("AI_BOOT_ALLOW_DAILY_DIGEST=false");
    expect(runbook).toContain("systemctl restart ai-seed-project.service");
    expect(runbook).not.toContain("AI_BOOT_ENGINE_MODE=v3_shadow systemctl restart");
    expect(runbook).toContain("v3 events and shadow score events are created");
    expect(runbook).toContain("no v3 group praise is sent");
    expect(runbook).toContain("existing production score behavior remains unchanged");
    expect(runbook).toContain("shadow replay metrics are available for review");
    expect(runbook).toContain("AI_BOOT_ENGINE_MODE=legacy");
    expect(runbook).not.toContain("AI_BOOT_ENGINE_MODE=legacy systemctl restart");
    expect(runbook).toContain("DB backup path");
    expect(runbook).toContain("server git SHA");
    expect(runbook).toContain("engine mode");
    expect(runbook).toContain("curl -fsS http://127.0.0.1:3001/api/health");
    expect(runbook).toContain("curl -fsS http://127.0.0.1:3001/api/feishu/status");
  });
});
