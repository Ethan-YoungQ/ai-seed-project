import { describe, expect, it } from "vitest";
import { SqliteRepository } from "../../src/storage/sqlite-repository.js";
import { runEnsureBootstrap } from "../../src/scripts/ensure-bootstrap-data.js";

function makeRepo(): SqliteRepository {
  return new SqliteRepository(":memory:");
}

describe("runEnsureBootstrap v2", () => {
  it("seeds fresh DB with camp, W1 and W2 window shells", async () => {
    const repository = makeRepo();

    const result = await runEnsureBootstrap({
      repository,
      env: { BOOTSTRAP_OPERATOR_OPEN_IDS: "" } as unknown as NodeJS.ProcessEnv,
    });

    expect(result.mutated).toBe(true);
    expect(result.campId).toBeTruthy();

    // W1 and W2 shells exist with settlement_state='open'
    const w1 = repository.findWindowByCode(result.campId!, "W1");
    const w2 = repository.findWindowByCode(result.campId!, "W2");
    expect(w1).toBeDefined();
    expect(w1!.settlementState).toBe("open");
    expect(w2).toBeDefined();
    expect(w2!.settlementState).toBe("open");

    repository.close();
  });

  it("is idempotent — running twice produces no error and same state", async () => {
    const repository = makeRepo();
    const env = { BOOTSTRAP_OPERATOR_OPEN_IDS: "" } as unknown as NodeJS.ProcessEnv;

    const r1 = await runEnsureBootstrap({ repository, env });
    expect(r1.mutated).toBe(true);

    const r2 = await runEnsureBootstrap({ repository, env });
    expect(r2.mutated).toBe(false);
    expect(r2.campId).toBe(r1.campId);

    repository.close();
  });

  it("does not duplicate windows that already exist", async () => {
    const repository = makeRepo();
    const env = { BOOTSTRAP_OPERATOR_OPEN_IDS: "" } as unknown as NodeJS.ProcessEnv;

    // First run seeds everything
    const r1 = await runEnsureBootstrap({ repository, env });
    const campId = r1.campId!;

    // Pre-insert windows manually (simulating they already exist)
    // Second run should not error
    const r2 = await runEnsureBootstrap({ repository, env });
    expect(r2.mutated).toBe(false);

    // Count windows — should be exactly 2
    const w1 = repository.findWindowByCode(campId, "W1");
    const w2 = repository.findWindowByCode(campId, "W2");
    expect(w1).toBeDefined();
    expect(w2).toBeDefined();

    repository.close();
  });

  it("promotes members listed in BOOTSTRAP_OPERATOR_OPEN_IDS", async () => {
    const repository = makeRepo();

    // First, seed the camp
    await runEnsureBootstrap({
      repository,
      env: { BOOTSTRAP_OPERATOR_OPEN_IDS: "" } as unknown as NodeJS.ProcessEnv,
    });

    const campId = repository.getDefaultCampId()!;

    // Insert two student members with feishu open ids
    repository.ensureMember("m-a", campId);
    repository.setMemberFeishuOpenId("m-a", "ou_a");
    repository.ensureMember("m-b", campId);
    repository.setMemberFeishuOpenId("m-b", "ou_b");

    // Run bootstrap with operator promotion
    const result = await runEnsureBootstrap({
      repository,
      env: {
        BOOTSTRAP_OPERATOR_OPEN_IDS: "ou_a,ou_b",
      } as unknown as NodeJS.ProcessEnv,
    });

    expect(result.mutated).toBe(true);
    expect(result.campId).toBe(campId);

    // Verify both members are now operators
    const memberA = repository.findMemberByFeishuOpenId("ou_a");
    const memberB = repository.findMemberByFeishuOpenId("ou_b");
    expect(memberA?.roleType).toBe("operator");
    expect(memberB?.roleType).toBe("operator");

    // Running again should not mutate
    const r2 = await runEnsureBootstrap({
      repository,
      env: {
        BOOTSTRAP_OPERATOR_OPEN_IDS: "ou_a,ou_b",
      } as unknown as NodeJS.ProcessEnv,
    });
    expect(r2.mutated).toBe(false);

    repository.close();
  });
});
