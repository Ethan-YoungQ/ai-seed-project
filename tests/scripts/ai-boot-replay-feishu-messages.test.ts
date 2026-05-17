import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { replayFeishuMessages } from "../../src/scripts/ai-boot-replay-feishu-messages";
import { SqliteRepository } from "../../src/storage/sqlite-repository";

describe("replayFeishuMessages", () => {
  let dir: string | undefined;

  afterEach(() => {
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
      dir = undefined;
    }
  });

  function makeFixture() {
    dir = mkdtempSync(join(tmpdir(), "ai-boot-replay-test-"));
    const dbPath = join(dir, "app.db");
    const messagesPath = join(dir, "messages.json");
    const repository = new SqliteRepository(dbPath);
    repository.seedDemo();
    repository.updateCampGroupId("camp-demo", "chat-prod");
    repository.setMemberFeishuOpenId("user-alice", "ou-alice");
    repository.close();
    writeFileSync(
      messagesPath,
      JSON.stringify([
        {
          message_id: "om-1",
          msg_type: "text",
          content: "我用 AI 做了一张客户沟通海报，并总结了使用过程",
          create_time: "2026-05-16 22:00",
          sender: { id: "ou-alice", sender_type: "user" },
        },
        {
          message_id: "om-other-chat",
          chat_id: "chat-other",
          msg_type: "text",
          content: "其他群消息",
          create_time: "2026-05-16 22:01",
          sender: { id: "ou-alice", sender_type: "user" },
        },
      ]),
      "utf8",
    );
    return { dbPath, messagesPath };
  }

  it("dry-runs against a copied database and leaves the source database untouched", async () => {
    const { dbPath, messagesPath } = makeFixture();

    const result = await replayFeishuMessages({
      messagesPath,
      databaseUrl: dbPath,
      campId: "camp-demo",
      chatId: "chat-prod",
      dryRun: true,
    });

    expect(result).toMatchObject({
      dryRun: true,
      messagesSeen: 2,
      userMessages: 1,
      skippedWrongChat: 1,
      replayed: 1,
      scoreEventsBefore: 0,
    });

    const repository = new SqliteRepository(dbPath);
    expect(repository.countAiBootScoreEvents({ campId: "camp-demo" })).toBe(0);
    repository.close();
  });

  it("requires the requested camp to be bound to the requested chat", async () => {
    const { dbPath, messagesPath } = makeFixture();

    await expect(
      replayFeishuMessages({
        messagesPath,
        databaseUrl: dbPath,
        campId: "camp-demo",
        chatId: "chat-wrong",
        dryRun: true,
      }),
    ).rejects.toThrow("not chat-wrong");
  });
});
