import type { FeishuConfig, FeishuReceiveIdType } from "./config";
import type { FeishuApiClient } from "./client";

export interface FeishuMessenger {
  sendTextMessage(input: {
    receiveId: string;
    receiveIdType: FeishuReceiveIdType;
    text: string;
  }): Promise<{ messageId?: string }>;
}

export class NoopFeishuMessenger implements FeishuMessenger {
  async sendTextMessage() {
    return {};
  }
}

export class ConfiguredFeishuMessenger implements FeishuMessenger {
  constructor(
    private readonly config: FeishuConfig,
    private readonly apiClient: FeishuApiClient
  ) {}

  async sendTextMessage(input: {
    receiveId?: string;
    receiveIdType?: FeishuReceiveIdType;
    text: string;
  }) {
    const receiveId = input.receiveId ?? this.config.botChatId;
    const receiveIdType = input.receiveIdType ?? this.config.botReceiveIdType;

    if (!receiveId) {
      throw new Error("Feishu bot receive target is not configured.");
    }

    return this.apiClient.sendTextMessage({
      receiveId,
      receiveIdType,
      text: input.text
    });
  }
}
