import { afterEach, describe, expect, it, vi } from "vitest";

import type { AiBootEventRecord } from "../../src/domain/v3/ai-boot-types.js";
import { runShadowReplay } from "../../src/scripts/ai-boot-shadow-replay.js";
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
    });

    expect(result).toEqual({
      eventsReplayed: 3,
      approved: 2,
      noScore: 1,
      reviewRequired: 0,
    });
    expect(JSON.parse(stdout.mock.calls[0][0])).toEqual(result);
    expect(repository.findAiBootScoreEventByEventId("evt-image")).toMatchObject({
      status: "shadow",
      category: "ai_artifact",
      reason: expect.any(String),
      evidence: expect.any(String),
    });
    expect(repository.findAiBootScoreEventByEventId("evt-link")).toMatchObject({
      status: "shadow",
      scoreDelta: 0,
      notifyPolicy: "silent",
    });
    expect(repository.findAiBootScoreEventByEventId("evt-reflection")).toMatchObject({
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
    });

    expect(first.approved).toBe(1);
    expect(second.approved).toBe(1);
    expect(repository.findAiBootScoreEventByEventId("evt-image")?.id).toBe("score-shadow-1");
  });
});
