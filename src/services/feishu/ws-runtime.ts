import * as lark from "@larksuiteoapi/node-sdk";

import type { FeishuConfig } from "./config.js";
import { normalizeFeishuMessageEvent } from "./normalize-message.js";

export interface CardActionInput {
  operatorOpenId: string;
  actionName: string;
  actionValue: Record<string, unknown>;
  formValue?: Record<string, unknown>;
  messageId: string;
  chatId: string;
}

export interface CardActionResponse {
  toast?: { type: string; content: string };
  card?: Record<string, unknown>;
}

export interface FeishuWsRuntime {
  start(): Promise<void>;
  stop(): Promise<void>;
  setCardActionHandler(handler: (input: CardActionInput) => Promise<CardActionResponse>): void;
}

export class NoopFeishuWsRuntime implements FeishuWsRuntime {
  async start() {}
  async stop() {}
  setCardActionHandler() {}
}

export class LarkFeishuWsRuntime implements FeishuWsRuntime {
  private wsClient?: any;
  private cardActionHandler?: (input: CardActionInput) => Promise<CardActionResponse>;

  constructor(
    private readonly config: FeishuConfig,
    private readonly onMessage: (payload: ReturnType<typeof normalizeFeishuMessageEvent>) => Promise<void>
  ) {}

  setCardActionHandler(handler: (input: CardActionInput) => Promise<CardActionResponse>): void {
    this.cardActionHandler = handler;
  }

  async start() {
    if (
      !this.config.enabled ||
      this.config.eventMode !== "long_connection" ||
      !this.config.appId ||
      !this.config.appSecret
    ) {
      console.log(`[AdminPanel] WS not started: enabled=${this.config.enabled}, eventMode=${this.config.eventMode}, appId=${!!this.config.appId}, appSecret=${!!this.config.appSecret}`);
      return;
    }

    console.log("[AdminPanel] Starting WebSocket long connection...");

    // Card action events arrive through the EventDispatcher in WS mode,
    // NOT through a separate CardActionHandler. The SDK's WSClient only
    // routes events via EventDispatcher — CardActionHandler is for HTTP
    // webhook mode only. Register "card.action.trigger" directly here.
    const self = this;

    const dispatcher = new lark.EventDispatcher({
      encryptKey: this.config.encryptKey
    }).register({
      "im.message.receive_v1": async (data: unknown) => {
        console.log("[AdminPanel] im.message.receive_v1 event received:", JSON.stringify(data).slice(0, 500));
        const normalized = normalizeFeishuMessageEvent({
          event: data
        });

        if (normalized) {
          console.log(`[AdminPanel] Normalized message: rawText="${normalized.rawText}", chatType=${normalized.chatType}, messageType=${normalized.messageType}`);
          await this.onMessage(normalized);
        } else {
          console.log("[AdminPanel] normalizeFeishuMessageEvent returned undefined — missing messageId/memberId/createTime");
        }
      },

      // Card action trigger — handles interactive button clicks on cards
      "card.action.trigger": async (data: unknown) => {
        console.log("[CardAction] card.action.trigger received via EventDispatcher:", JSON.stringify(data).slice(0, 500));

        if (!self.cardActionHandler) {
          console.warn("[CardAction] No card action handler registered, ignoring");
          return {};
        }

        try {
          const d = data as any;
          const action = d?.action ?? {};
          const operator = d?.operator ?? {};
          const context = d?.context ?? {};

          const input: CardActionInput = {
            operatorOpenId: operator.open_id ?? "",
            actionName: action.name ?? action.tag ?? "",
            actionValue: action.value ?? {},
            formValue: action.form_value,
            messageId: context.open_message_id ?? "",
            chatId: context.open_chat_id ?? "",
          };

          console.log(`[CardAction] Dispatching: action="${input.actionName}", operator=${input.operatorOpenId}`);
          const result = await self.cardActionHandler(input);
          console.log(`[CardAction] Handler returned: toast=${!!result.toast}, card=${!!result.card}`);

          if (result.toast) {
            return { toast: result.toast };
          }
          if (result.card) {
            return { card: { type: "raw", data: result.card } };
          }
          return {};
        } catch (err) {
          console.error("[CardAction] Error handling card action:", err);
          return { toast: { type: "error", content: "处理失败，请重试" } };
        }
      }
    } as any); // "card.action.trigger" is not in SDK's type definitions but works at runtime

    this.wsClient = new lark.WSClient({
      appId: this.config.appId,
      appSecret: this.config.appSecret,
      loggerLevel: lark.LoggerLevel.info
    });

    this.wsClient.start({
      eventDispatcher: dispatcher,
    });

    console.log("[AdminPanel] WebSocket client started (card actions via EventDispatcher)");
  }

  async stop() {
    await this.wsClient?.stop?.();
  }
}
