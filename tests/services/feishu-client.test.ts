import { Readable } from "node:stream";

import { beforeEach, describe, expect, it, vi } from "vitest";

const messageResourceGet = vi.fn();
const fileGet = vi.fn();
const messageGet = vi.fn();
const messageCreate = vi.fn();

vi.mock("@larksuiteoapi/node-sdk", () => ({
  AppType: {
    SelfBuild: "SelfBuild"
  },
  Domain: {
    Feishu: "https://open.feishu.cn"
  },
  Client: vi.fn().mockImplementation(() => ({
    im: {
      message: {
        get: messageGet,
        create: messageCreate
      },
      messageResource: {
        get: messageResourceGet
      },
      file: {
        get: fileGet
      }
    }
  }))
}));

import { LarkFeishuApiClient } from "../../src/services/feishu/client";

describe("LarkFeishuApiClient", () => {
  beforeEach(() => {
    messageResourceGet.mockReset();
    fileGet.mockReset();
    messageGet.mockReset();
    messageCreate.mockReset();
  });

  it("downloads user message attachments through messageResource.get", async () => {
    messageResourceGet.mockResolvedValue({
      getReadableStream: () => Readable.from([Buffer.from("demo-file")])
    });

    const client = new LarkFeishuApiClient({
      enabled: true,
      appId: "cli_test",
      appSecret: "secret_test",
      eventMode: "long_connection",
      verificationToken: undefined,
      encryptKey: undefined,
      botChatId: "",
      botReceiveIdType: "chat_id",
      base: {
        enabled: false,
        appToken: undefined,
        tables: {}
      }
    });

    const file = await client.getMessageFile({
      messageId: "om_file_001",
      fileKey: "file_001",
      fileName: "submission.pdf"
    });

    expect(messageResourceGet).toHaveBeenCalledWith({
      path: {
        message_id: "om_file_001",
        file_key: "file_001"
      },
      params: {
        type: "file"
      }
    });
    expect(fileGet).not.toHaveBeenCalled();
    expect(file.fileExt).toBe("pdf");
    expect(file.bytes.toString()).toBe("demo-file");
  });

  it("can download image message resources through messageResource.get", async () => {
    messageResourceGet.mockResolvedValue({
      getReadableStream: () => Readable.from([Buffer.from("demo-image")])
    });

    const client = new LarkFeishuApiClient({
      enabled: true,
      appId: "cli_test",
      appSecret: "secret_test",
      eventMode: "long_connection",
      verificationToken: undefined,
      encryptKey: undefined,
      botChatId: "",
      botReceiveIdType: "chat_id",
      base: {
        enabled: false,
        appToken: undefined,
        tables: {}
      }
    });

    const file = await client.getMessageFile({
      messageId: "om_image_001",
      fileKey: "img_001",
      resourceType: "image"
    });

    expect(messageResourceGet).toHaveBeenCalledWith({
      path: {
        message_id: "om_image_001",
        file_key: "img_001"
      },
      params: {
        type: "image"
      }
    });
    expect(file.bytes.toString()).toBe("demo-image");
  });

  it("wraps Feishu send card errors without leaking request headers or content", async () => {
    messageCreate.mockRejectedValue({
      response: {
        data: {
          code: 230099,
          msg: "Failed to create card content",
          error: { log_id: "log-secret-safe-id" }
        }
      },
      config: {
        headers: { Authorization: "Bearer secret-token" },
        data: "contains-sensitive-card-content"
      }
    });

    const client = new LarkFeishuApiClient({
      enabled: true,
      appId: "cli_test",
      appSecret: "secret_test",
      eventMode: "long_connection",
      verificationToken: undefined,
      encryptKey: undefined,
      botChatId: "",
      botReceiveIdType: "chat_id",
      base: {
        enabled: false,
        appToken: undefined,
        tables: {}
      }
    });

    let error: unknown;
    try {
      await client.sendCardMessage({
        chatId: "oc-test",
        cardJson: { schema: "2.0" },
      });
    } catch (err) {
      error = err;
    }

    expect(error).toBeInstanceOf(Error);
    const text = String(error);
    expect(text).toContain("code=230099");
    expect(text).toContain("Failed to create card content");
    expect(text).toContain("log-secret-safe-id");
    expect(text).not.toContain("secret-token");
    expect(text).not.toContain("contains-sensitive-card-content");
  });

  it("does not fall back to raw Error.message when Feishu error response lacks msg", async () => {
    const sdkError = new Error("Bearer secret-token contains-sensitive-card-content") as Error & {
      response: { data: Record<string, unknown>; headers: Record<string, string> };
    };
    sdkError.response = {
      data: { code: 230099 },
      headers: { "x-tt-logid": "header-log-id" }
    };
    messageCreate.mockRejectedValue(sdkError);

    const client = new LarkFeishuApiClient({
      enabled: true,
      appId: "cli_test",
      appSecret: "secret_test",
      eventMode: "long_connection",
      verificationToken: undefined,
      encryptKey: undefined,
      botChatId: "",
      botReceiveIdType: "chat_id",
      base: {
        enabled: false,
        appToken: undefined,
        tables: {}
      }
    });

    let error: unknown;
    try {
      await client.sendCardMessage({
        chatId: "oc-test",
        cardJson: { schema: "2.0" },
      });
    } catch (err) {
      error = err;
    }

    expect(error).toBeInstanceOf(Error);
    const text = String(error);
    expect(text).toContain("code=230099");
    expect(text).toContain("msg=feishu request failed");
    expect(text).toContain("header-log-id");
    expect(text).not.toContain("secret-token");
    expect(text).not.toContain("contains-sensitive-card-content");
  });
});
