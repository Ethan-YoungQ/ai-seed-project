import { describe, expect, test } from "vitest";

import {
  StubMemberSyncService,
  type MemberSyncService,
  type SyncResult
} from "../../../src/domain/v2/member-sync.js";

describe("StubMemberSyncService", () => {
  test("syncGroupMembers records the call and returns a zero SyncResult", async () => {
    const service: MemberSyncService = new StubMemberSyncService();
    const result: SyncResult = await service.syncGroupMembers("chat-1");
    expect(result.added).toBe(0);
    expect(result.updated).toBe(0);
    expect(result.totalInGroup).toBe(0);
    expect(typeof result.syncedAt).toBe("string");
  });

  test("syncUserAvatars records the openIds and resolves without throwing", async () => {
    const stub = new StubMemberSyncService();
    await stub.syncUserAvatars(["ou_a", "ou_b"]);
    expect(stub.trace).toContainEqual({
      method: "syncUserAvatars",
      openIds: ["ou_a", "ou_b"]
    });
  });

  test("trace captures both methods in order", async () => {
    const stub = new StubMemberSyncService();
    await stub.syncGroupMembers("chat-42");
    await stub.syncUserAvatars(["ou_x"]);
    expect(stub.trace).toHaveLength(2);
    expect(stub.trace[0]).toMatchObject({
      method: "syncGroupMembers",
      chatId: "chat-42"
    });
    expect(stub.trace[1]).toMatchObject({
      method: "syncUserAvatars",
      openIds: ["ou_x"]
    });
  });
});
