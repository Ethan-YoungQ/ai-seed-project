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
      }
    });

    this.wsClient = new lark.WSClient({
      appId: this.config.appId,
      appSecret: this.config.appSecret,
      loggerLevel: lark.LoggerLevel.info
    });

    // -----------------------------------------------------------------------
    // MONKEY-PATCH: Lark SDK v1.60 WSClient.handleEventData() hardcodes
    //   `if (type !== "event") return;`
    // which silently drops all card-type WebSocket messages. We override it
    // to also process "card" type messages by calling our cardActionHandler.
    //
    // SDK code ref: node_modules/@larksuiteoapi/node-sdk/lib/index.js:85544
    // -----------------------------------------------------------------------
    const wsClient = this.wsClient;
    const originalHandleEventData = wsClient.handleEventData.bind(wsClient);

    wsClient.handleEventData = async (data: any) => {
      const headers: Record<string, string> = (data.headers || []).reduce(
        (acc: Record<string, string>, cur: { key: string; value: string }) => {
          acc[cur.key] = cur.value;
          return acc;
        },
        {}
      );
      const msgType = headers["type"];

      // Standard events — delegate to original SDK handler (EventDispatcher)
      if (msgType === "event") {
        return originalHandleEventData(data);
      }

      // Card action events — handle directly since SDK drops them
      if (msgType === "card") {
        const messageId = headers["message_id"] ?? "";
        const traceId = headers["trace_id"] ?? "";
        console.log(`[CardAction] WS card message received, message_id=${messageId}, trace_id=${traceId}`);

        if (!self.cardActionHandler) {
          console.warn("[CardAction] No card action handler registered, ignoring card event");
          return;
        }

        // Reconstruct response frame using the same SDK pattern
        const respPayload: { code: number; data?: string } = { code: 200 };

        try {
          // Parse the payload — SDK uses the raw payload bytes
          const payloadBytes = data.payload;
          const payloadStr = new TextDecoder("utf-8").decode(payloadBytes);
          console.log(`[CardAction] Card payload: ${payloadStr.slice(0, 500)}`);

          const cardData = JSON.parse(payloadStr);
          const action = cardData?.action ?? {};
          const operator = cardData?.operator ?? {};
          const context = cardData?.context ?? {};

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
            respPayload.data = Buffer.from(JSON.stringify({ toast: result.toast })).toString("base64");
          } else if (result.card) {
            respPayload.data = Buffer.from(
              JSON.stringify({ card: { type: "raw", data: result.card } })
            ).toString("base64");
          }
        } catch (err) {
          console.error("[CardAction] Error handling card action:", err);
          respPayload.code = 500;
          respPayload.data = Buffer.from(
            JSON.stringify({ toast: { type: "error", content: "处理失败，请重试" } })
          ).toString("base64");
        }

        // Send response back through WebSocket using SDK's sendMessage
        wsClient.sendMessage({
          ...data,
          headers: [
            ...data.headers,
            { key: "biz_rt", value: "0" }
          ],
          payload: new TextEncoder().encode(JSON.stringify(respPayload))
        });
      }
    };

    wsClient.start({
      eventDispatcher: dispatcher,
    });

    console.log("[AdminPanel] WebSocket client started (with card action monkey-patch)");
  }

  async stop() {
    await this.wsClient?.stop?.();
  }
}
