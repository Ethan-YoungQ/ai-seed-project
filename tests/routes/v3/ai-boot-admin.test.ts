import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { createApp } from "../../../src/app.js";
import type {
  AiBootEventRecord,
  AiBootScoreEventRecord,
} from "../../../src/domain/v3/ai-boot-types.js";
import { SqliteRepository } from "../../../src/storage/sqlite-repository.js";

function databasePath() {
  return join(mkdtempSync(join(tmpdir(), "ai-boot-admin-")), "test.db");
}

function aiBootEvent(
  memberId: string,
  overrides: Partial<AiBootEventRecord> = {}
): AiBootEventRecord {
  const id = overrides.id ?? `evt-${memberId}`;
  return {
    id,
    campId: "camp-demo",
    chatId: "chat-1",
    memberId,
    sourceMessageId: `om-${id}`,
    eventType: "text",
    rawText: "shared a workflow",
    sanitizedText: "shared a workflow",
    attachmentJson: "[]",
    evidenceJson: "{}",
    contentHash: `hash-${id}`,
    status: "decided",
    engineVersion: "v3.0.0",
    rulesetVersion: "2026-05-16",
    createdAt: "2026-05-16T00:00:00.000Z",
    ...overrides,
  };
}

function aiBootScoreEvent(
  memberId: string,
  overrides: Partial<AiBootScoreEventRecord> = {}
): AiBootScoreEventRecord {
  const eventId = overrides.eventId ?? `evt-${memberId}`;
  return {
    id: `score-${eventId}`,
    eventId,
    campId: "camp-demo",
    memberId,
    category: "ai_artifact",
    scoreDelta: 4,
    confidence: "low",
    status: "review_required",
    notifyPolicy: "silent",
    reason: "needs operator review",
    evidence: "workflow screenshot and explanation",
    badgesJson: "[]",
    modelProvider: "fake",
    modelName: "fake",
    promptVersion: "none",
    reviewedByOpId: null,
    reviewNote: null,
    decidedAt: "2026-05-16T00:01:00.000Z",
    ...overrides,
  };
}

function seedBase(dbPath: string) {
  const repo = new SqliteRepository(dbPath);
  repo.seedDemo();
  repo.setMemberFeishuOpenId("user-ops", "ou-operator");
  repo.setMemberFeishuOpenId("user-alice", "ou-student");
  return repo;
}

function seedScoreEvent(
  repo: SqliteRepository,
  overrides: Partial<AiBootScoreEventRecord> = {}
) {
  const event = aiBootEvent("user-alice", {
    id: overrides.eventId ?? "evt-review",
  });
  repo.insertAiBootEvent(event);
  repo.insertAiBootScoreEvent(
    aiBootScoreEvent("user-alice", {
      id: "score-review",
      eventId: event.id,
      ...overrides,
    })
  );
}

function getScoreEvent(dbPath: string, id: string) {
  const repo = new SqliteRepository(dbPath);
  const scoreEvent = repo.getAiBootScoreEvent(id);
  repo.close();
  return scoreEvent;
}

describe("v3 ai boot operator review APIs", () => {
  const apps: Array<Awaited<ReturnType<typeof createApp>>> = [];

  afterAll(async () => {
    for (const app of apps) {
      await app.close();
    }
  });

  it("returns 403 for non-admin review queue requests", async () => {
    const dbPath = databasePath();
    const repo = seedBase(dbPath);
    seedScoreEvent(repo);
    repo.close();

    const app = await createApp({ databaseUrl: dbPath });
    apps.push(app);

    const res = await app.inject({
      method: "GET",
      url: "/api/v3/ai-boot/review-queue?campId=camp-demo",
      headers: { "x-feishu-open-id": "ou-student" },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ ok: false, code: "not_admin" });
  });

  it("returns review_required score events with evidence", async () => {
    const dbPath = databasePath();
    const repo = seedBase(dbPath);
    seedScoreEvent(repo, {
      id: "score-old-low",
      eventId: "evt-old-low",
      evidence: "first low confidence evidence",
      confidence: "low",
      decidedAt: "2026-05-16T00:00:00.000Z",
    });
    seedScoreEvent(repo, {
      id: "score-approved",
      eventId: "evt-approved",
      status: "approved",
      evidence: "approved evidence",
    });
    seedScoreEvent(repo, {
      id: "score-medium-review",
      eventId: "evt-medium-review",
      status: "review_required",
      confidence: "medium",
      evidence: "medium confidence evidence",
    });
    repo.close();

    const app = await createApp({ databaseUrl: dbPath });
    apps.push(app);

    const res = await app.inject({
      method: "GET",
      url: "/api/v3/ai-boot/review-queue?campId=camp-demo",
      headers: { "x-feishu-open-id": "ou-operator" },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.rows).toHaveLength(1);
    expect(body.rows.map((row: { id: string }) => row.id)).not.toContain("score-medium-review");
    expect(body.rows[0]).toMatchObject({
      id: "score-old-low",
      status: "review_required",
      confidence: "low",
      evidence: "first low confidence evidence",
      reason: "needs operator review",
      category: "ai_artifact",
      scoreDelta: 4,
    });
  });

  it.each([
    "/api/v3/ai-boot/review-queue?campId=",
    "/api/v3/ai-boot/review-queue?limit=abc",
    "/api/v3/ai-boot/review-queue?limit=-1",
    "/api/v3/ai-boot/review-queue?limit=0",
    "/api/v3/ai-boot/review-queue?limit=1.5",
    "/api/v3/ai-boot/review-queue?limit=201",
    "/api/v3/ai-boot/review-queue?offset=-1",
    "/api/v3/ai-boot/review-queue?offset=1.5",
    "/api/v3/ai-boot/review-queue?offset=abc",
  ])("returns 400 for invalid review queue query %s", async (url) => {
    const dbPath = databasePath();
    const repo = seedBase(dbPath);
    repo.close();

    const app = await createApp({ databaseUrl: dbPath });
    apps.push(app);

    const res = await app.inject({
      method: "GET",
      url,
      headers: { "x-feishu-open-id": "ou-operator" },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ ok: false, code: "invalid_query" });
  });

  it("approve marks the score event approved and increments effective v3 score", async () => {
    const dbPath = databasePath();
    const repo = seedBase(dbPath);
    seedScoreEvent(repo, { scoreDelta: 7 });
    expect(repo.sumApprovedAiBootScore("camp-demo", "user-alice")).toBe(0);
    repo.close();

    const app = await createApp({ databaseUrl: dbPath });
    apps.push(app);

    const res = await app.inject({
      method: "POST",
      url: "/api/v3/ai-boot/score-events/score-review/approve",
      headers: { "x-feishu-open-id": "ou-operator" },
      payload: { reviewNote: "looks valid" },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().scoreEvent).toMatchObject({
      id: "score-review",
      status: "approved",
      reviewedByOpId: "user-ops",
      reviewNote: "looks valid",
      scoreDelta: 7,
    });

    const readRepo = new SqliteRepository(dbPath);
    expect(readRepo.sumApprovedAiBootScore("camp-demo", "user-alice")).toBe(7);
    readRepo.close();

    const repeat = await app.inject({
      method: "POST",
      url: "/api/v3/ai-boot/score-events/score-review/approve",
      headers: { "x-feishu-open-id": "ou-operator" },
      payload: { reviewNote: "approve again" },
    });

    expect(repeat.statusCode).toBe(409);
    expect(repeat.json()).toEqual({ ok: false, code: "decision_conflict" });
    expect(getScoreEvent(dbPath, "score-review")).toMatchObject({
      status: "approved",
      reviewNote: "looks valid",
      scoreDelta: 7,
    });
  });

  it("reject marks the score event rejected without incrementing effective v3 score", async () => {
    const dbPath = databasePath();
    const repo = seedBase(dbPath);
    seedScoreEvent(repo, { scoreDelta: 7 });
    repo.close();

    const app = await createApp({ databaseUrl: dbPath });
    apps.push(app);

    const res = await app.inject({
      method: "POST",
      url: "/api/v3/ai-boot/score-events/score-review/reject",
      headers: { "x-feishu-open-id": "ou-operator" },
      payload: { reviewNote: "not enough evidence" },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().scoreEvent).toMatchObject({
      id: "score-review",
      status: "rejected",
      reviewedByOpId: "user-ops",
      reviewNote: "not enough evidence",
      scoreDelta: 0,
    });

    const readRepo = new SqliteRepository(dbPath);
    expect(readRepo.sumApprovedAiBootScore("camp-demo", "user-alice")).toBe(0);
    readRepo.close();
  });

  it("correct updates scoring fields and approves the corrected score", async () => {
    const dbPath = databasePath();
    const repo = seedBase(dbPath);
    seedScoreEvent(repo, { scoreDelta: 2 });
    repo.close();

    const app = await createApp({ databaseUrl: dbPath });
    apps.push(app);

    const res = await app.inject({
      method: "POST",
      url: "/api/v3/ai-boot/score-events/score-review/correct",
      headers: { "x-feishu-open-id": "ou-operator" },
      payload: {
        category: "operator_adjustment",
        scoreDelta: -3,
        reason: "duplicate adjustment",
        reviewNote: "corrected by operator",
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().scoreEvent).toMatchObject({
      id: "score-review",
      status: "approved",
      reviewedByOpId: "user-ops",
      category: "operator_adjustment",
      scoreDelta: -3,
      reason: "duplicate adjustment",
      reviewNote: "corrected by operator",
    });

    const readRepo = new SqliteRepository(dbPath);
    expect(readRepo.sumApprovedAiBootScore("camp-demo", "user-alice")).toBe(-3);
    readRepo.close();
  });

  it("rejects non-admin POST decisions", async () => {
    const dbPath = databasePath();
    const repo = seedBase(dbPath);
    seedScoreEvent(repo);
    repo.close();

    const app = await createApp({ databaseUrl: dbPath });
    apps.push(app);

    const res = await app.inject({
      method: "POST",
      url: "/api/v3/ai-boot/score-events/score-review/reject",
      headers: { "x-feishu-open-id": "ou-student" },
      payload: { reviewNote: "student reject" },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ ok: false, code: "not_admin" });
  });

  it("returns 409 and preserves scores for non-reviewable score events", async () => {
    const dbPath = databasePath();
    const repo = seedBase(dbPath);
    seedScoreEvent(repo, {
      id: "score-approved",
      eventId: "evt-approved",
      status: "approved",
      confidence: "low",
      scoreDelta: 7,
      reviewNote: "already approved",
    });
    seedScoreEvent(repo, {
      id: "score-medium-review",
      eventId: "evt-medium-review",
      status: "review_required",
      confidence: "medium",
      scoreDelta: 8,
    });
    seedScoreEvent(repo, {
      id: "score-high-review",
      eventId: "evt-high-review",
      status: "review_required",
      confidence: "high",
      scoreDelta: 9,
    });
    seedScoreEvent(repo, {
      id: "score-low-rejected",
      eventId: "evt-low-rejected",
      status: "rejected",
      confidence: "low",
      scoreDelta: 0,
    });
    repo.close();

    const app = await createApp({ databaseUrl: dbPath });
    apps.push(app);

    const cases = [
      {
        id: "score-approved",
        action: "reject",
        payload: { reviewNote: "should not reject approved" },
      },
      {
        id: "score-medium-review",
        action: "approve",
        payload: { reviewNote: "should not approve medium" },
      },
      {
        id: "score-high-review",
        action: "correct",
        payload: {
          category: "ai_artifact",
          scoreDelta: 5,
          reason: "should not correct high",
          reviewNote: "not reviewable",
        },
      },
      {
        id: "score-low-rejected",
        action: "approve",
        payload: { reviewNote: "should not approve rejected" },
      },
    ];

    for (const c of cases) {
      const res = await app.inject({
        method: "POST",
        url: `/api/v3/ai-boot/score-events/${c.id}/${c.action}`,
        headers: { "x-feishu-open-id": "ou-operator" },
        payload: c.payload,
      });
      expect(res.statusCode).toBe(409);
      expect(res.json()).toEqual({ ok: false, code: "decision_conflict" });
    }

    const readRepo = new SqliteRepository(dbPath);
    expect(readRepo.sumApprovedAiBootScore("camp-demo", "user-alice")).toBe(7);
    expect(readRepo.getAiBootScoreEvent("score-approved")).toMatchObject({
      status: "approved",
      scoreDelta: 7,
      reviewNote: "already approved",
    });
    expect(readRepo.getAiBootScoreEvent("score-medium-review")).toMatchObject({
      status: "review_required",
      confidence: "medium",
      reviewedByOpId: null,
    });
    expect(readRepo.getAiBootScoreEvent("score-high-review")).toMatchObject({
      status: "review_required",
      confidence: "high",
      reviewedByOpId: null,
    });
    expect(readRepo.getAiBootScoreEvent("score-low-rejected")).toMatchObject({
      status: "rejected",
      reviewedByOpId: null,
    });
    readRepo.close();
  });

  it("normalizes corrected scores through v3 scoring rules", async () => {
    const dbPath = databasePath();
    const repo = seedBase(dbPath);
    seedScoreEvent(repo, {
      id: "score-artifact",
      eventId: "evt-artifact",
      category: "ai_artifact",
      scoreDelta: 4,
    });
    seedScoreEvent(repo, {
      id: "score-daily",
      eventId: "evt-daily",
      category: "ai_artifact",
      scoreDelta: 4,
    });
    seedScoreEvent(repo, {
      id: "score-fractional",
      eventId: "evt-fractional",
      category: "ai_artifact",
      scoreDelta: 4,
    });
    repo.close();

    const app = await createApp({ databaseUrl: dbPath });
    apps.push(app);

    const artifact = await app.inject({
      method: "POST",
      url: "/api/v3/ai-boot/score-events/score-artifact/correct",
      headers: { "x-feishu-open-id": "ou-operator" },
      payload: {
        category: "ai_artifact",
        scoreDelta: 999999,
        reason: "clamp artifact",
        reviewNote: "clamped",
      },
    });
    expect(artifact.statusCode).toBe(200);
    expect(artifact.json().scoreEvent).toMatchObject({
      category: "ai_artifact",
      scoreDelta: 5,
    });

    const daily = await app.inject({
      method: "POST",
      url: "/api/v3/ai-boot/score-events/score-daily/correct",
      headers: { "x-feishu-open-id": "ou-operator" },
      payload: {
        category: "daily_participation",
        scoreDelta: 50,
        reason: "daily is fixed",
        reviewNote: "fixed",
      },
    });
    expect(daily.statusCode).toBe(200);
    expect(daily.json().scoreEvent).toMatchObject({
      category: "daily_participation",
      scoreDelta: 1,
    });

    const fractional = await app.inject({
      method: "POST",
      url: "/api/v3/ai-boot/score-events/score-fractional/correct",
      headers: { "x-feishu-open-id": "ou-operator" },
      payload: {
        category: "ai_artifact",
        scoreDelta: 4.6,
        reason: "fractional rounds",
        reviewNote: "rounded",
      },
    });
    expect(fractional.statusCode).toBe(200);
    expect(fractional.json().scoreEvent).toMatchObject({
      category: "ai_artifact",
      scoreDelta: 5,
    });

    const readRepo = new SqliteRepository(dbPath);
    expect(readRepo.sumApprovedAiBootScore("camp-demo", "user-alice")).toBe(11);
    readRepo.close();
  });

  it("returns 404 for missing score event decisions", async () => {
    const dbPath = databasePath();
    const repo = seedBase(dbPath);
    repo.close();

    const app = await createApp({ databaseUrl: dbPath });
    apps.push(app);

    const res = await app.inject({
      method: "POST",
      url: "/api/v3/ai-boot/score-events/missing/approve",
      headers: { "x-feishu-open-id": "ou-operator" },
      payload: { reviewNote: "approve" },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ ok: false, code: "not_found" });
  });
});
