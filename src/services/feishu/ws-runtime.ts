import * as lark from "@larksuiteoapi/node-sdk";

import type { FeishuConfig } from "./config";
import { normalizeFeishuMessageEvent } from "./normalize-message";

export interface FeishuWsRuntime {
  start(): Promise<void>;
  stop(): Promise<void>;
}

export class NoopFeishuWsRuntime implements FeishuWsRuntime {
  async start() {}

  async stop() {}
}

export class LarkFeishuWsRuntime implements FeishuWsRuntime {
  private wsClient?: any;

  constructor(
    private readonly config: FeishuConfig,
    private readonly onMessage: (payload: ReturnType<typeof normalizeFeishuMessageEvent>) => Promise<void>
  ) {}

  async start() {
    if (
      !this.config.enabled ||
      this.config.eventMode !== "long_connection" ||
      !this.config.appId ||
      !this.config.appSecret
    ) {
      return;
    }

    const dispatcher = new lark.EventDispatcher({
      encryptKey: this.config.encryptKey
    }).register({
      "im.message.receive_v1": async (data: unknown) => {
        const normalized = normalizeFeishuMessageEvent({
          event: data
        });

        if (normalized) {
          await this.onMessage(normalized);
        }
      }
    });

    this.wsClient = new lark.WSClient({
      appId: this.config.appId,
      appSecret: this.config.appSecret,
      loggerLevel: lark.LoggerLevel.info
    });

    this.wsClient.start({
      eventDispatcher: dispatcher
    });
  }

  async stop() {
    await this.wsClient?.stop?.();
  }
}
