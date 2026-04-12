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

    // -----------------------------------------------------------------------
    // Card action events arrive via WebSocket with header type="event"
    // (NOT "card"). The SDK's EventDispatcher routes them by event_type
    // extracted from the payload header. We register "card.action.trigger"
    // directly in the EventDispatcher alongside regular event handlers.
    //
    // The handler receives the PARSED event data (after SDK's parse() merges
    // header + event fields into a flat object).
    // -----------------------------------------------------------------------
    const self = this;

    const eventHandlers: Record<string, (data: unknown) => Promise<unknown>> = {
      "im.message.receive_v1": async (data: unknown) => {
        console.log("[AdminPanel] im.message.receive_v1 event received:", JSON.stringify(data).slice(0, 500));
        const normalized = normalizeFeishuMessageEvent({ event: data });

        if (normalized) {
          console.log(`[AdminPanel] Normalized message: rawText="${normalized.rawText}", chatType=${normalized.chatType}, messageType=${normalized.messageType}`);
          await this.onMessage(normalized);
        } else {
          console.log("[AdminPanel] normalizeFeishuMessageEvent returned undefined");
        }
      },

      "card.action.trigger": async (data: unknown) => {
        console.log("[CardAction] card.action.trigger event received:", JSON.stringify(data).slice(0, 500));

        if (!self.cardActionHandler) {
          console.warn("[CardAction] No card action handler registered");
          return {};
        }

        try {
          // After SDK parse(), the data is a flat merge of header + event fields.
          // operator, action, context are from the event; event_type etc from header.
          const d = data as any;
          const action = d?.action ?? {};
          const operator = d?.operator ?? {};
          const tag = action.tag ?? "";

          // Ignore non-button interactions (dropdown select, etc.)
          // These fire on dropdown change but don't need a response.
          if (tag === "select_static" || tag === "select_person" || tag === "date_picker" || tag === "picker_time" || tag === "picker_datetime") {
            console.log(`[CardAction] Ignoring non-button interaction: tag="${tag}"`);
            return {};
          }

          const input: CardActionInput = {
            operatorOpenId: operator?.open_id ?? d?.open_id ?? "",
            actionName: action.name ?? "",
            actionValue: action.value ?? {},
            formValue: action.form_value,
            messageId: d?.open_message_id ?? "",
            chatId: d?.open_chat_id ?? "",
          };

          console.log(`[CardAction] Dispatching: action="${input.actionName}", operator=${input.operatorOpenId}, formValue=${JSON.stringify(input.formValue)}`);
          const result = await self.cardActionHandler(input);
          console.log(`[CardAction] Result: toast=${!!result.toast}, card=${!!result.card}`);

          if (result.toast) {
            return { toast: result.toast };
          }
          if (result.card) {
            return { card: { type: "raw", data: result.card } };
          }
          return {};
        } catch (err) {
          console.error("[CardAction] Error:", err);
          return { toast: { type: "error", content: "处理失败，请重试" } };
        }
      },
    };

    const dispatcher = new lark.EventDispatcher({
      encryptKey: this.config.encryptKey
    }).register(eventHandlers as any);

    // Verify handlers are registered
    const registeredHandles = (dispatcher as any).handles as Map<string, unknown>;
    console.log(`[AdminPanel] EventDispatcher handles registered: ${[...registeredHandles.keys()].join(", ")}`);

    this.wsClient = new lark.WSClient({
      appId: this.config.appId,
      appSecret: this.config.appSecret,
      loggerLevel: lark.LoggerLevel.info
    });

    this.wsClient.start({
      eventDispatcher: dispatcher,
    });

    console.log("[AdminPanel] WebSocket client started (card.action.trigger registered in EventDispatcher)");
  }

  async stop() {
    await this.wsClient?.stop?.();
  }
}
