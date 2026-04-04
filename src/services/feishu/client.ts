import * as lark from "@larksuiteoapi/node-sdk";

import type { FeishuConfig, FeishuReceiveIdType } from "./config";

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
