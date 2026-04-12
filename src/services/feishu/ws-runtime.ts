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

// In-memory cache for dropdown selections per user (keyed by operatorOpenId)
// Entries auto-expire after 10 minutes to prevent memory leaks.
const selectCache = new Map<string, { value: string; expiresAt: number }>();

function cacheSelect(operatorId: string, selectKey: string, value: string): void {
  const key = `${operatorId}:${selectKey}`;
  selectCache.set(key, { value, expiresAt: Date.now() + 10 * 60 * 1000 });
}

function getCachedSelect(operatorId: string, selectKey: string): string | null {
  const key = `${operatorId}:${selectKey}`;
  const entry = selectCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    selectCache.delete(key);
    return null;
  }
  return entry.value;
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

  /**
   * Process a card action from any source (EventDispatcher or monkey-patch).
   * Returns the response object for the SDK to send back to Feishu.
   */
  private async handleCardAction(data: unknown): Promise<unknown> {
    if (!this.cardActionHandler) {
      console.warn("[CardAction] No card action handler registered");
      return {};
    }

    try {
      const d = data as any;
      const action = d?.action ?? {};
      const operator = d?.operator ?? {};
      const tag = action.tag ?? "";

      const operatorId = operator?.open_id ?? d?.open_id ?? "";

      // Handle dropdown selections: cache the value and return ACK
      if (tag === "select_static") {
        const selectName = (action.value as any)?.action ?? action.name ?? "";
        const selectedOption = action.option ?? "";
        console.log(`[CardAction] Select cached: operator=${operatorId}, key="${selectName}", value="${selectedOption}"`);
        if (selectName && selectedOption) {
          cacheSelect(operatorId, selectName, selectedOption);
        }
        return undefined; // plain ACK, no toast
      }

      // Ignore other non-button interactions
      if (tag === "select_person" || tag === "date_picker" || tag === "picker_time" || tag === "picker_datetime") {
        console.log(`[CardAction] Ignoring non-button interaction: tag="${tag}"`);
        return undefined;
      }

      // For button clicks, inject cached select values into actionValue
      const actionValue = action.value ?? {};
      const enrichedValue = { ...actionValue } as Record<string, unknown>;

      // Inject cached period selection
      const cachedPeriod = getCachedSelect(operatorId, "admin_panel_select_period");
      if (cachedPeriod) {
        enrichedValue["admin_panel_select_period"] = cachedPeriod;
      }
      // Inject cached window selection
      const cachedWindow = getCachedSelect(operatorId, "admin_panel_select_window");
      if (cachedWindow) {
        enrichedValue["admin_panel_select_window"] = cachedWindow;
      }

      const input: CardActionInput = {
        operatorOpenId: operatorId,
        actionName: action.name ?? "",
        actionValue: enrichedValue,
        formValue: action.form_value,
        messageId: d?.open_message_id ?? d?.context?.open_message_id ?? "",
        chatId: d?.open_chat_id ?? d?.context?.open_chat_id ?? "",
      };

      console.log(`[CardAction] Dispatching: tag="${tag}", action="${input.actionName}", value=${JSON.stringify(input.actionValue).slice(0, 200)}, operator=${input.operatorOpenId}`);
      const result = await this.cardActionHandler(input);
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

    // Path 1: EventDispatcher handles events with WS header type="event"
    // Some card interactions (select_static) arrive this way.
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
        console.log("[CardAction] card.action.trigger via EventDispatcher:", JSON.stringify(data).slice(0, 300));
        return self.handleCardAction(data);
      },
    };

    const dispatcher = new lark.EventDispatcher({
      encryptKey: this.config.encryptKey
    }).register(eventHandlers as any);

    this.wsClient = new lark.WSClient({
      appId: this.config.appId,
      appSecret: this.config.appSecret,
      loggerLevel: lark.LoggerLevel.info
    });

    // -----------------------------------------------------------------------
    // Path 2: MONKEY-PATCH for WS messages with header type="card"
    //
    // Lark SDK v1.60 WSClient.handleEventData() (lib/index.js:85553) has:
    //   if (type !== "event") return;
    // This silently drops card-type WS messages. Button clicks use type="card",
    // while select changes use type="event". We patch handleEventData to also
    // process type="card" messages.
    // -----------------------------------------------------------------------
    const originalHandleEventData = this.wsClient.handleEventData.bind(this.wsClient);

    this.wsClient.handleEventData = async (data: any) => {
      const headers: Record<string, string> = (data.headers || []).reduce(
        (acc: Record<string, string>, cur: { key: string; value: string }) => {
          acc[cur.key] = cur.value;
          return acc;
        },
        {}
      );
      const msgType = headers["type"];

      // Standard events (type="event") — delegate to original SDK handler
      if (msgType === "event") {
        return originalHandleEventData(data);
      }

      // Card button clicks (type="card") — handle directly
      if (msgType === "card") {
        const messageId = headers["message_id"] ?? "";
        console.log(`[CardAction] WS type=card message received, message_id=${messageId}`);

        const respPayload: { code: number; data?: string } = { code: 200 };
        try {
          const payloadStr = new TextDecoder("utf-8").decode(data.payload);
          console.log(`[CardAction] Card payload: ${payloadStr.slice(0, 500)}`);

          const cardData = JSON.parse(payloadStr);
          const result = await self.handleCardAction(cardData);

          if (result && Object.keys(result as any).length > 0) {
            respPayload.data = Buffer.from(JSON.stringify(result)).toString("base64");
          }
        } catch (err) {
          console.error("[CardAction] Error processing card message:", err);
          respPayload.code = 500;
          respPayload.data = Buffer.from(
            JSON.stringify({ toast: { type: "error", content: "处理失败" } })
          ).toString("base64");
        }

        // Send response back through WebSocket
        this.wsClient.sendMessage({
          ...data,
          headers: [...data.headers, { key: "biz_rt", value: "0" }],
          payload: new TextEncoder().encode(JSON.stringify(respPayload))
        });
        return;
      }

      // Other types (ping/pong handled elsewhere) — log and ignore
      console.log(`[WS] Unknown message type="${msgType}", ignoring`);
    };

    this.wsClient.start({
      eventDispatcher: dispatcher,
    });

    console.log("[AdminPanel] WebSocket client started (EventDispatcher + card monkey-patch)");
  }

  async stop() {
    await this.wsClient?.stop?.();
  }
}
