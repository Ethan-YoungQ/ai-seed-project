import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  AiBootEventRecord,
  AiBootScoreEventRecord,
} from "../../src/domain/v3/ai-boot-types.js";
import {
  resolveShadowReplayDirectRunOptions,
  runShadowReplay,
} from "../../src/scripts/ai-boot-shadow-replay.js";
import { SqliteRepository } from "../../src/storage/sqlite-repository.js";

const repositories: SqliteRepository[] = [];

function makeRepo(): SqliteRepository {
  const repository = new SqliteRepository(":memory:");
  repository.seedDemo();
  repositories.push(repository);
  return repository;
}

function event(overrides: Partial<AiBootEventRecord>): AiBootEventRecord {
  return {
    id: "evt-1",
    campId: "default",
    chatId: "chat-1",
    memberId: "user-alice",
    sourceMessageId: "om-1",
    eventType: "text",
    rawText: "",
    sanitizedText: "",
    attachmentJson: "[]",
    evidenceJson: "{}",
    contentHash: "hash-1",
    status: "extracted",
    engineVersion: "v3.0.0",
    rulesetVersion: "2026-05-16",
    createdAt: "2026-05-16T00:00:00.000Z",
    ...overrides,
  };
}

function scoreEvent(overrides: Partial<AiBootScoreEventRecord> = {}): AiBootScoreEventRecord {
  return {
    id: "score-live-1",
    eventId: "evt-1",
    campId: "default",
    memberId: "user-alice",
    category: "ai_artifact",
    scoreDelta: 4,
    confidence: "high",
    status: "approved",
    notifyPolicy: "group_praise",
    reason: "Live approved reason",
    evidence: "Live approved evidence",
    badgesJson: "[]",
    modelProvider: "live",
    modelName: "live",
    promptVersion: "live",
    reviewedByOpId: null,
    reviewNote: null,
    decidedAt: "2026-05-16T01:00:00.000Z",
    ...overrides,
  };
}

describe("runShadowReplay", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    while (repositories.length > 0) {
      repositories.pop()?.close();
    }
  });

  it("replays golden-set events into shadow score events without changing live approved sums", async () => {
    const repository = makeRepo();
    repository.insertAiBootEvent(event({
      id: "evt-image",
      sourceMessageId: "om-image",
      eventType: "image",
      rawText: "我的 AI 作品",
      sanitizedText: "我的 AI 作品",
      attachmentJson: JSON.stringify([{ type: "image", fileKey: "img-1" }]),
      contentHash: "hash-image",
      createdAt: "2026-05-16T00:00:00.000Z",
    }));
    repository.insertAiBootEvent(event({
      id: "evt-link",
      sourceMessageId: "om-link",
      rawText: "https://example.com/resource",
      sanitizedText: "https://example.com/resource",
      contentHash: "hash-link",
      createdAt: "2026-05-16T00:00:01.000Z",
    }));
    repository.insertAiBootEvent(event({
      id: "evt-reflection",
      sourceMessageId: "om-reflection",
      rawText: "我用AI做复盘，沉淀了实践经验",
      sanitizedText: "我用AI做复盘，沉淀了实践经验",
      contentHash: "hash-reflection",
      createdAt: "2026-05-16T00:00:02.000Z",
    }));
    const stdout = vi.fn();
    let scoreId = 0;

    const beforeSum = repository.sumApprovedAiBootScore("default", "user-alice");
    const result = await runShadowReplay({
      repository,
      env: {} as NodeJS.ProcessEnv,
      campId: "default",
      since: "2026-05-16",
      limit: 100,
      now: () => "2026-05-17T00:00:00.000Z",
      uuid: () => `score-shadow-${++scoreId}`,
      stdout,
      allowHeuristic: true,
    });

    expect(result).toEqual({
      eventsReplayed: 3,
      approved: 2,
      noScore: 1,
      reviewRequired: 0,
    });
    expect(JSON.parse(stdout.mock.calls[0][0])).toEqual(result);
    expect(repository.findAiBootScoreEventByEventId("shadow-replay:evt-image")).toMatchObject({
      eventId: "shadow-replay:evt-image",
      status: "shadow",
      category: "ai_artifact",
      reason: expect.any(String),
      evidence: expect.any(String),
      reviewNote: "source_event_id=evt-image",
    });
    expect(repository.findAiBootScoreEventByEventId("shadow-replay:evt-link")).toMatchObject({
      status: "shadow",
      scoreDelta: 0,
      notifyPolicy: "silent",
    });
    expect(repository.findAiBootScoreEventByEventId("shadow-replay:evt-reflection")).toMatchObject({
      status: "shadow",
      category: "ai_practice_reflection",
    });
    expect(repository.sumApprovedAiBootScore("default", "user-alice")).toBe(beforeSum);
  });

  it("is idempotent for events that already have score events", async () => {
    const repository = makeRepo();
    repository.insertAiBootEvent(event({
      id: "evt-image",
      sourceMessageId: "om-image",
      eventType: "image",
      attachmentJson: JSON.stringify([{ type: "image" }]),
      contentHash: "hash-image",
    }));

    const first = await runShadowReplay({
      repository,
      env: {} as NodeJS.ProcessEnv,
      campId: "default",
      since: "2026-05-16",
      limit: 100,
      now: () => "2026-05-17T00:00:00.000Z",
      uuid: () => "score-shadow-1",
      stdout: () => undefined,
      allowHeuristic: true,
    });
    const second = await runShadowReplay({
      repository,
      env: {} as NodeJS.ProcessEnv,
      campId: "default",
      since: "2026-05-16",
      limit: 100,
      now: () => "2026-05-17T00:00:00.000Z",
      uuid: () => "score-shadow-2",
      stdout: () => undefined,
      allowHeuristic: true,
    });

    expect(first.approved).toBe(1);
    expect(second.approved).toBe(1);
    expect(repository.findAiBootScoreEventByEventId("shadow-replay:evt-image")?.id).toBe("score-shadow-1");
  });

  it("creates an independent synthetic shadow score when the source event already has a live score", async () => {
    const repository = makeRepo();
    repository.insertAiBootEvent(event({
      id: "evt-live",
      sourceMessageId: "om-live",
      eventType: "image",
      attachmentJson: JSON.stringify([{ type: "image" }]),
      contentHash: "hash-live",
    }));
    repository.insertAiBootScoreEvent(scoreEvent({
      id: "score-live",
      eventId: "evt-live",
      scoreDelta: 5,
    }));

    const first = await runShadowReplay({
      repository,
      env: {} as NodeJS.ProcessEnv,
      campId: "default",
      since: "2026-05-16",
      limit: 100,
      now: () => "2026-05-17T00:00:00.000Z",
      uuid: () => "score-shadow-live",
      stdout: () => undefined,
      allowHeuristic: true,
    });
    const second = await runShadowReplay({
      repository,
      env: {} as NodeJS.ProcessEnv,
      campId: "default",
      since: "2026-05-16",
      limit: 100,
      now: () => "2026-05-17T00:00:00.000Z",
      uuid: () => "score-shadow-live-duplicate",
      stdout: () => undefined,
      allowHeuristic: true,
    });

    expect(first).toMatchObject({ eventsReplayed: 1, approved: 1 });
    expect(second).toMatchObject({ eventsReplayed: 1, approved: 1 });
    expect(repository.findAiBootScoreEventByEventId("evt-live")).toMatchObject({
      id: "score-live",
      status: "approved",
    });
    expect(repository.findAiBootScoreEventByEventId("shadow-replay:evt-live")).toMatchObject({
      id: "score-shadow-live",
      status: "shadow",
    });
    expect(repository.sumApprovedAiBootScore("default", "user-alice")).toBe(5);
  });

  it("runs deterministic guards before injected deciders", async () => {
    const repository = makeRepo();
    repository.insertAiBootEvent(event({
      id: "evt-trivial",
      sourceMessageId: "om-trivial",
      rawText: "ok",
      sanitizedText: "ok",
      contentHash: "hash-trivial",
    }));
    const decider = vi.fn();

    const result = await runShadowReplay({
      repository,
      env: {} as NodeJS.ProcessEnv,
      campId: "default",
      since: "2026-05-16",
      limit: 100,
      now: () => "2026-05-17T00:00:00.000Z",
      uuid: () => "score-shadow-trivial",
      stdout: () => undefined,
      decider,
    });

    expect(decider).not.toHaveBeenCalled();
    expect(result).toMatchObject({ eventsReplayed: 1, approved: 1, noScore: 0 });
    expect(repository.findAiBootScoreEventByEventId("shadow-replay:evt-trivial")).toMatchObject({
      status: "shadow",
      category: "daily_participation",
      scoreDelta: 1,
    });
  });

  it("does not use future events or future approved scores when checking duplicate content", async () => {
    const repository = makeRepo();
    repository.insertAiBootEvent(event({
      id: "evt-early",
      sourceMessageId: "om-early",
      rawText: "我用AI做复盘，沉淀了实践经验",
      sanitizedText: "我用AI做复盘，沉淀了实践经验",
      contentHash: "hash-duplicate",
      createdAt: "2026-05-16T00:00:00.000Z",
    }));
    repository.insertAiBootEvent(event({
      id: "evt-late",
      sourceMessageId: "om-late",
      rawText: "我用AI做复盘，沉淀了实践经验",
      sanitizedText: "我用AI做复盘，沉淀了实践经验",
      contentHash: "hash-duplicate",
      createdAt: "2026-05-16T00:00:01.000Z",
    }));
    repository.insertAiBootScoreEvent(scoreEvent({
      id: "score-live-late",
      eventId: "evt-late",
      category: "ai_practice_reflection",
      status: "approved",
      decidedAt: "2026-05-16T00:00:02.000Z",
    }));

    const result = await runShadowReplay({
      repository,
      env: {} as NodeJS.ProcessEnv,
      campId: "default",
      since: "2026-05-16",
      limit: 100,
      now: () => "2026-05-17T00:00:00.000Z",
      uuid: vi.fn()
        .mockReturnValueOnce("score-shadow-early")
        .mockReturnValueOnce("score-shadow-late"),
      stdout: () => undefined,
      allowHeuristic: true,
    });

    expect(result).toMatchObject({
      eventsReplayed: 2,
      approved: 1,
      reviewRequired: 1,
    });
    expect(repository.findAiBootScoreEventByEventId("shadow-replay:evt-early")).toMatchObject({
      status: "shadow",
      category: "ai_practice_reflection",
    });
    expect(repository.findAiBootScoreEventByEventId("shadow-replay:evt-late")).toMatchObject({
      status: "shadow",
      category: "formal_task",
      scoreDelta: 1,
    });
  });

  it("uses event time and in-memory replay state for daily participation caps", async () => {
    const repository = makeRepo();
    repository.insertAiBootEvent(event({
      id: "evt-trivial-1",
      sourceMessageId: "om-trivial-1",
      rawText: "ok",
      sanitizedText: "ok",
      contentHash: "hash-trivial-1",
      createdAt: "2026-05-16T01:00:00.000Z",
    }));
    repository.insertAiBootEvent(event({
      id: "evt-trivial-2",
      sourceMessageId: "om-trivial-2",
      rawText: "谢谢",
      sanitizedText: "谢谢",
      contentHash: "hash-trivial-2",
      createdAt: "2026-05-16T02:00:00.000Z",
    }));

    const result = await runShadowReplay({
      repository,
      env: {} as NodeJS.ProcessEnv,
      campId: "default",
      since: "2026-05-16",
      limit: 100,
      now: () => "2026-05-18T00:00:00.000Z",
      uuid: vi.fn()
        .mockReturnValueOnce("score-shadow-trivial-1")
        .mockReturnValueOnce("score-shadow-trivial-2"),
      stdout: () => undefined,
      allowHeuristic: true,
    });

    expect(result).toMatchObject({
      eventsReplayed: 2,
      approved: 1,
      noScore: 1,
    });
    expect(repository.findAiBootScoreEventByEventId("shadow-replay:evt-trivial-1")).toMatchObject({
      status: "shadow",
      category: "daily_participation",
      scoreDelta: 1,
    });
    expect(repository.findAiBootScoreEventByEventId("shadow-replay:evt-trivial-2")).toMatchObject({
      status: "shadow",
      scoreDelta: 0,
    });
  });

  it("handles malformed stored evidence and missing members without crashing", async () => {
    const repository = makeRepo();
    repository.insertAiBootEvent(event({
      id: "evt-bad-evidence",
      memberId: "missing-member",
      sourceMessageId: "om-bad-evidence",
      rawText: "ok",
      sanitizedText: "ok",
      attachmentJson: JSON.stringify([{ fileKey: "no-type" }, null, "bad"]),
      evidenceJson: JSON.stringify({ malformed: true }),
      contentHash: "hash-bad-evidence",
    }));

    const result = await runShadowReplay({
      repository,
      env: {} as NodeJS.ProcessEnv,
      campId: "default",
      since: "2026-05-16",
      limit: 100,
      now: () => "2026-05-17T00:00:00.000Z",
      uuid: () => "score-shadow-bad-evidence",
      stdout: () => undefined,
      allowHeuristic: true,
    });

    expect(result).toMatchObject({ eventsReplayed: 1, noScore: 1 });
    expect(repository.findAiBootScoreEventByEventId("shadow-replay:evt-bad-evidence")).toMatchObject({
      status: "shadow",
      scoreDelta: 0,
    });
  });

  it("sanitizes partially malformed stored evidence bundles", async () => {
    const repository = makeRepo();
    repository.insertAiBootEvent(event({
      id: "evt-partial-evidence",
      sourceMessageId: "om-partial-evidence",
      rawText: "",
      sanitizedText: "",
      attachmentJson: "[]",
      evidenceJson: JSON.stringify({
        sanitizedText: "",
        urls: [null, "https://x.test"],
        attachments: [null, { type: "image" }],
        documentText: "",
        extractionStatus: "parsed",
        extractionReason: "x",
        contentHash: "hash-partial-evidence",
      }),
      contentHash: "hash-partial-evidence",
    }));

    const result = await runShadowReplay({
      repository,
      env: {} as NodeJS.ProcessEnv,
      campId: "default",
      since: "2026-05-16",
      limit: 100,
      now: () => "2026-05-17T00:00:00.000Z",
      uuid: () => "score-shadow-partial-evidence",
      stdout: () => undefined,
      allowHeuristic: true,
    });

    expect(result).toMatchObject({ eventsReplayed: 1 });
    expect(repository.findAiBootScoreEventByEventId("shadow-replay:evt-partial-evidence")).toMatchObject({
      status: "shadow",
    });
  });

  it("does not use heuristic fallback by default in the exported API", async () => {
    const repository = makeRepo();
    repository.insertAiBootEvent(event({
      id: "evt-needs-llm",
      sourceMessageId: "om-needs-llm",
      rawText: "我用AI做复盘，沉淀了实践经验",
      sanitizedText: "我用AI做复盘，沉淀了实践经验",
      contentHash: "hash-needs-llm",
    }));

    const result = await runShadowReplay({
      repository,
      env: {} as NodeJS.ProcessEnv,
      campId: "default",
      since: "2026-05-16",
      limit: 100,
      now: () => "2026-05-17T00:00:00.000Z",
      uuid: () => "score-shadow-needs-llm",
      stdout: () => undefined,
    });

    expect(result).toMatchObject({ eventsReplayed: 1, reviewRequired: 1 });
    expect(repository.findAiBootScoreEventByEventId("shadow-replay:evt-needs-llm")).toMatchObject({
      status: "shadow",
      category: "formal_task",
      reason: expect.stringContaining("requires an LLM client"),
    });
  });

  it("requires an LLM client for direct CLI mode unless heuristic fallback is explicit", () => {
    expect(resolveShadowReplayDirectRunOptions(
      {} as NodeJS.ProcessEnv,
      ["--since", "2026-05-16"],
    )).toEqual({
      ok: false,
      error: "llm_client_required",
    });

    expect(resolveShadowReplayDirectRunOptions(
      { AI_BOOT_SHADOW_REPLAY_ALLOW_HEURISTIC: "true" } as NodeJS.ProcessEnv,
      ["--since", "2026-05-16"],
    )).toMatchObject({
      ok: true,
      options: { allowHeuristic: true, since: "2026-05-16" },
    });

    expect(resolveShadowReplayDirectRunOptions(
      {} as NodeJS.ProcessEnv,
      ["--allow-heuristic"],
    )).toMatchObject({
      ok: true,
      options: { allowHeuristic: true },
    });
  });
});
