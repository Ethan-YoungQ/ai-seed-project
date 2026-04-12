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

// In-memory cache for dropdown selections per user
const selectCache = new Map<string, { value: string; expiresAt: number }>();

function cacheSelect(operatorId: string, selectKey: string, value: string): void {
  selectCache.set(`${operatorId}:${selectKey}`, { value, expiresAt: Date.now() + 600_000 });
}

function getCachedSelect(operatorId: string, selectKey: string): string | null {
  const entry = selectCache.get(`${operatorId}:${selectKey}`);
  if (!entry || Date.now() > entry.expiresAt) return null;
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

    // EventDispatcher for regular events (im.message.receive_v1)
    // card.action.trigger is handled separately in the monkey-patch below
    const dispatcher = new lark.EventDispatcher({
      encryptKey: this.config.encryptKey
    }).register({
      "im.message.receive_v1": async (data: unknown) => {
        const normalized = normalizeFeishuMessageEvent({ event: data });
        if (normalized) {
          console.log(`[AdminPanel] Message: rawText="${normalized.rawText}", chatType=${normalized.chatType}`);
          await this.onMessage(normalized);
        }
      },
    });

    this.wsClient = new lark.WSClient({
      appId: this.config.appId,
      appSecret: this.config.appSecret,
      loggerLevel: lark.LoggerLevel.info
    });

    // -----------------------------------------------------------------------
    // MONKEY-PATCH: Intercept card.action.trigger events BEFORE the SDK
    // processes them, because the SDK's response format ({ code, data: base64 })
    // is for event ACKs — card callbacks need the response sent directly.
    //
    // For card.action.trigger: we handle + send response ourselves, bypassing SDK
    // For other events: delegate to original SDK handler
    // -----------------------------------------------------------------------
    const wsClient = this.wsClient;
    const originalHandleEventData = wsClient.handleEventData.bind(wsClient);

    wsClient.handleEventData = async (data: any) => {
      // Parse headers
      const headers: Record<string, string> = (data.headers || []).reduce(
        (acc: Record<string, string>, cur: { key: string; value: string }) => {
          acc[cur.key] = cur.value;
          return acc;
        },
        {}
      );

      // For type="card" — SDK normally drops these, we process them
      // For type="event" — check if it's card.action.trigger before delegating
      const msgType = headers["type"];

      // Try to detect card.action.trigger in the payload
      let isCardAction = false;
      let parsedPayload: any = null;

      if (msgType === "event" || msgType === "card") {
        try {
          // For fragmented messages, we need to handle merging
          // But for card actions, they're typically single-frame
          const payloadBytes = data.payload;
          if (payloadBytes) {
            const payloadStr = new TextDecoder("utf-8").decode(payloadBytes);
            parsedPayload = JSON.parse(payloadStr);

            // Check for card.action.trigger in both v1 and v2 event formats
            const eventType = parsedPayload?.header?.event_type
              ?? parsedPayload?.event_type
              ?? parsedPayload?.type;
            if (eventType === "card.action.trigger") {
              isCardAction = true;
            }
          }
        } catch {
          // Payload parsing failed — not a card action, let SDK handle it
        }
      }

      // Regular events (not card actions) — delegate to SDK
      if (!isCardAction) {
        if (msgType === "event") {
          return originalHandleEventData(data);
        }
        // type="card" but not card.action.trigger, or other types — skip
        return;
      }

      // ===== CARD ACTION HANDLING =====
      // Process card.action.trigger ourselves and send response directly
      console.log(`[CardAction] Intercepted card.action.trigger (wsType=${msgType})`);

      let cardResponse: any = {};
      try {
        // Extract event data — handle both v2 ({ header, event }) and flat formats
        const eventData = parsedPayload?.event ?? parsedPayload;
        const action = eventData?.action ?? {};
        const operator = eventData?.operator ?? {};
        const context = eventData?.context ?? {};
        const tag = action.tag ?? "";
        const operatorId = operator?.open_id ?? "";

        // Handle select_static: cache value, return empty toast as ACK
        if (tag === "select_static") {
          const selectName = (action.value as any)?.action ?? action.name ?? "";
          const selectedOption = action.option ?? "";
          console.log(`[CardAction] Select: operator=${operatorId}, key="${selectName}", value="${selectedOption}"`);
          if (selectName && selectedOption) {
            cacheSelect(operatorId, selectName, selectedOption);
          }
          // Return minimal valid card callback response
          cardResponse = {};
        } else if (self.cardActionHandler) {
          // Button click: inject cached values and dispatch
          const actionValue = { ...(action.value ?? {}) } as Record<string, unknown>;
          const cached1 = getCachedSelect(operatorId, "admin_panel_select_period");
          if (cached1) actionValue["admin_panel_select_period"] = cached1;
          const cached2 = getCachedSelect(operatorId, "admin_panel_select_window");
          if (cached2) actionValue["admin_panel_select_window"] = cached2;

          const input: CardActionInput = {
            operatorOpenId: operatorId,
            actionName: action.name ?? "",
            actionValue,
            formValue: action.form_value,
            messageId: context?.open_message_id ?? "",
            chatId: context?.open_chat_id ?? "",
          };

          console.log(`[CardAction] Button: tag="${tag}", action="${input.actionName}", value=${JSON.stringify(input.actionValue).slice(0, 200)}`);
          const result = await self.cardActionHandler(input);
          console.log(`[CardAction] Result: toast=${!!result.toast}, card=${!!result.card}`);

          if (result.toast) {
            cardResponse = { toast: result.toast };
          } else if (result.card) {
            cardResponse = { card: { type: "raw", data: result.card } };
          }
        }
      } catch (err) {
        console.error("[CardAction] Error:", err);
        cardResponse = { toast: { type: "error", content: "处理失败，请重试" } };
      }

      // Send response directly — card callback responses use data as JSON object,
      // NOT base64-encoded string (which is the format for event ACKs).
      const responseJson = JSON.stringify(cardResponse);
      console.log(`[CardAction] Sending WS response: ${responseJson.slice(0, 300)}`);

      // Card callback response: data is the response object directly (not base64)
      const hasContent = cardResponse && Object.keys(cardResponse).length > 0;
      const respPayload = hasContent
        ? { code: 200, data: cardResponse }
        : { code: 200 };

      wsClient.sendMessage({
        ...data,
        headers: [...data.headers, { key: "biz_rt", value: "0" }],
        payload: new TextEncoder().encode(JSON.stringify(respPayload))
      });
    };

    wsClient.start({
      eventDispatcher: dispatcher,
    });

    console.log("[AdminPanel] WebSocket client started (card actions intercepted before SDK)");
  }

  async stop() {
    await this.wsClient?.stop?.();
  }
}
