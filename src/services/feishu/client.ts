import * as lark from "@larksuiteoapi/node-sdk";

import type { FeishuConfig, FeishuReceiveIdType } from "./config";
import { inferDocumentFileExt } from "../documents/file-format";

export interface FeishuMessageSendInput {
  receiveId: string;
  receiveIdType: FeishuReceiveIdType;
  text: string;
}

export interface FeishuBaseRecordInput {
  appToken: string;
  tableId: string;
  fields: Record<string, unknown>;
}

export interface FeishuBaseRecordSearchInput {
  appToken: string;
  tableId: string;
  fieldName: string;
  fieldValue: string;
}

export interface FeishuBaseRecordUpdateInput extends FeishuBaseRecordInput {
  recordId: string;
}

export interface FeishuChatSearchInput {
  query: string;
  pageSize?: number;
}

export interface FeishuMessageFileInput {
  messageId: string;
  fileKey: string;
  fileName?: string;
}

export interface FeishuChatCreateInput {
  name: string;
  description?: string;
  ownerOpenId?: string;
  userOpenIds?: string[];
  botAppIds?: string[];
  external?: boolean;
}

export interface FeishuBaseAppCreateInput {
  name: string;
  timeZone?: string;
}

export interface FeishuBaseTableCreateInput {
  appToken: string;
  name: string;
  fields?: Array<{ fieldName: string; type: number }>;
}

export interface FeishuApiClient {
  validateCredentials(): Promise<{ tenantKey?: string }>;
  sendTextMessage(input: FeishuMessageSendInput): Promise<{ messageId?: string }>;
  probeGroupMessageAccess(input: { chatId: string }): Promise<{
    ok: boolean;
    code?: number;
    message?: string;
    missingScope?: string;
    logId?: string;
  }>;
  getMessageFile(input: FeishuMessageFileInput): Promise<{
    fileKey: string;
    fileName?: string;
    fileExt?: string;
    mimeType?: string;
    bytes: Buffer;
  }>;
  createBaseRecord(input: FeishuBaseRecordInput): Promise<{ recordId?: string }>;
  searchBaseRecords(input: FeishuBaseRecordSearchInput): Promise<Array<{ recordId: string; fields?: Record<string, unknown> }>>;
  updateBaseRecord(input: FeishuBaseRecordUpdateInput): Promise<{ recordId?: string }>;
  searchChats(input: FeishuChatSearchInput): Promise<Array<{ chatId: string; name?: string }>>;
  createChat(input: FeishuChatCreateInput): Promise<{ chatId?: string; name?: string }>;
  createBaseApp(input: FeishuBaseAppCreateInput): Promise<{ appToken?: string; defaultTableId?: string; url?: string }>;
  renameBaseTable(input: { appToken: string; tableId: string; name: string }): Promise<void>;
  createBaseTable(input: FeishuBaseTableCreateInput): Promise<{ tableId?: string }>;
}

export class LarkFeishuApiClient implements FeishuApiClient {
  private readonly client: any;

  constructor(config: FeishuConfig) {
    if (!config.appId || !config.appSecret) {
      throw new Error("Feishu app credentials are required to create the API client.");
    }

    this.client = new lark.Client({
      appId: config.appId,
      appSecret: config.appSecret,
      appType: lark.AppType.SelfBuild,
      domain: lark.Domain.Feishu
    });
  }

  async validateCredentials() {
    const response = await this.client.im.chat.search({
      params: {
        page_size: 1,
        user_id_type: "open_id"
      }
    });

    return {
      tenantKey: response?.data?.items?.[0]?.owner_id
    };
  }

  async sendTextMessage(input: FeishuMessageSendInput) {
    const response = await this.client.im.message.create({
      params: {
        receive_id_type: input.receiveIdType
      },
      data: {
        receive_id: input.receiveId,
        msg_type: "text",
        content: JSON.stringify({
          text: input.text
        })
      }
    });

    return {
      messageId: response?.data?.message_id
    };
  }

  async probeGroupMessageAccess(input: { chatId: string }) {
    try {
      await this.client.im.message.list({
        params: {
          container_id: input.chatId,
          container_id_type: "chat",
          page_size: 1,
          sort_type: "ByCreateTimeDesc"
        }
      });

      return {
        ok: true
      };
    } catch (error) {
      const responseData = (
        error &&
        typeof error === "object" &&
        "response" in error &&
        (error as { response?: { data?: unknown } }).response?.data &&
        typeof (error as { response?: { data?: unknown } }).response?.data === "object"
      )
        ? ((error as { response?: { data?: Record<string, unknown> } }).response?.data ?? {})
        : {};
      const message = typeof responseData.msg === "string"
        ? responseData.msg
        : error instanceof Error
          ? error.message
          : "group_message_probe_failed";
      const missingScopeMatch = message.match(/need scope:\s*([A-Za-z0-9:._-]+)/);

      return {
        ok: false,
        code: typeof responseData.code === "number" ? responseData.code : undefined,
        message,
        missingScope: missingScopeMatch?.[1],
        logId:
          responseData.error &&
          typeof responseData.error === "object" &&
          typeof (responseData.error as { log_id?: unknown }).log_id === "string"
            ? (responseData.error as { log_id: string }).log_id
            : undefined
      };
    }
  }

  async getMessageFile(input: FeishuMessageFileInput) {
    let fileName = input.fileName;
    let mimeType: string | undefined;

    if (!fileName) {
      try {
        const message = await this.client.im.message.get({
          path: {
            message_id: input.messageId
          }
        });
        const content = String(message?.data?.items?.[0]?.body?.content ?? message?.data?.body?.content ?? "");
        if (content) {
          const parsed = JSON.parse(content) as { file_name?: string; mime_type?: string };
          fileName = parsed.file_name ?? fileName;
          mimeType = parsed.mime_type;
        }
      } catch {
        // Keep the download path resilient even when the metadata lookup is unavailable.
      }
    }

    const response =
      this.client.im.messageResource?.get
        ? await this.client.im.messageResource.get({
            path: {
              message_id: input.messageId,
              file_key: input.fileKey
            },
            params: {
              type: "file"
            }
          })
        : await this.client.im.file.get({
            path: {
              file_key: input.fileKey
            }
          });
    const stream = response.getReadableStream();
    const chunks: Buffer[] = [];

    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }

    return {
      fileKey: input.fileKey,
      fileName,
      fileExt: inferDocumentFileExt({
        fileName,
        mimeType
      }),
      mimeType,
      bytes: Buffer.concat(chunks)
    };
  }

  async createBaseRecord(input: FeishuBaseRecordInput) {
    const response = await this.client.bitable.appTableRecord.create({
      path: {
        app_token: input.appToken,
        table_id: input.tableId
      },
      data: {
        fields: input.fields
      }
    });

    return {
      recordId: response?.data?.record?.record_id
    };
  }

  async searchBaseRecords(input: FeishuBaseRecordSearchInput) {
    const response = await this.client.bitable.appTableRecord.search({
      path: {
        app_token: input.appToken,
        table_id: input.tableId
      },
      data: {
        filter: {
          conjunction: "and",
          conditions: [
            {
              field_name: input.fieldName,
              operator: "is",
              value: [input.fieldValue]
            }
          ]
        }
      }
    });

    return (response?.data?.items ?? []).flatMap((item: { record_id?: string; fields?: Record<string, unknown> }) =>
      item.record_id
        ? [
            {
              recordId: item.record_id,
              fields: item.fields
            }
          ]
        : []
    );
  }

  async updateBaseRecord(input: FeishuBaseRecordUpdateInput) {
    const response = await this.client.bitable.appTableRecord.update({
      path: {
        app_token: input.appToken,
        table_id: input.tableId,
        record_id: input.recordId
      },
      data: {
        fields: input.fields
      }
    });

    return {
      recordId: response?.data?.record?.record_id ?? input.recordId
    };
  }

  async searchChats(input: FeishuChatSearchInput) {
    const response = await this.client.im.chat.search({
      params: {
        query: input.query,
        page_size: input.pageSize ?? 50,
        user_id_type: "open_id"
      }
    });

    return (response?.data?.items ?? []).flatMap((item: { chat_id?: string; name?: string }) =>
      item.chat_id
        ? [
            {
              chatId: item.chat_id,
              name: item.name
            }
          ]
        : []
    );
  }

  async createChat(input: FeishuChatCreateInput) {
    const response = await this.client.im.chat.create({
      params: {
        user_id_type: "open_id"
      },
      data: {
        name: input.name,
        description: input.description,
        owner_id: input.ownerOpenId,
        user_id_list: input.userOpenIds,
        bot_id_list: input.botAppIds,
        chat_type: "group",
        external: input.external ?? false
      }
    });

    return {
      chatId: response?.data?.chat_id,
      name: response?.data?.name
    };
  }

  async createBaseApp(input: FeishuBaseAppCreateInput) {
    const response = await this.client.bitable.app.create({
      data: {
        name: input.name,
        time_zone: input.timeZone
      }
    });

    return {
      appToken: response?.data?.app?.app_token,
      defaultTableId: response?.data?.app?.default_table_id,
      url: response?.data?.app?.url
    };
  }

  async renameBaseTable(input: { appToken: string; tableId: string; name: string }) {
    await this.client.bitable.appTable.patch({
      path: {
        app_token: input.appToken,
        table_id: input.tableId
      },
      data: {
        name: input.name
      }
    });
  }

  async createBaseTable(input: FeishuBaseTableCreateInput) {
    const response = await this.client.bitable.appTable.create({
      path: {
        app_token: input.appToken
      },
      data: {
        table: {
          name: input.name,
          fields: input.fields?.map((field) => ({
            field_name: field.fieldName,
            type: field.type
          }))
        }
      }
    });

    return {
      tableId: response?.data?.table_id
    };
  }
}
