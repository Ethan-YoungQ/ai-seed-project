import { Readable } from "node:stream";

import { beforeEach, describe, expect, it, vi } from "vitest";

const messageResourceGet = vi.fn();
const fileGet = vi.fn();
const messageGet = vi.fn();

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
        get: messageGet
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
});
