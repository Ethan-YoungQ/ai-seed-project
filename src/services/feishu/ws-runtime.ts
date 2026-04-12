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

export function getCachedSelect(operatorId: string, selectKey: string): string | null {
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

    // -----------------------------------------------------------------------
    // ARCHITECTURE NOTES (see memory/project_feishu_ws_card_action_lessons.md):
    //
    // 1. Both im.message.receive_v1 and card.action.trigger arrive with WS
    //    header type="event" and are routed through EventDispatcher.
    // 2. DO NOT monkey-patch handleEventData — it breaks message delivery.
    // 3. Toast responses work via EventDispatcher. Card update responses
    //    cause 200672. So card actions return toasts, not card updates.
    // 4. select_static events return undefined (plain ACK) to avoid 200672.
    // -----------------------------------------------------------------------
    const self = this;

    const eventHandlers: Record<string, (data: unknown) => Promise<unknown>> = {
      "im.message.receive_v1": async (data: unknown) => {
        const normalized = normalizeFeishuMessageEvent({ event: data });
        if (normalized) {
          console.log(`[AdminPanel] Message: rawText="${normalized.rawText}", chatType=${normalized.chatType}`);
          await this.onMessage(normalized);
        }
      },

      "card.action.trigger": async (data: unknown) => {
        const d = data as any;
        const action = d?.action ?? {};
        const operator = d?.operator ?? {};
        const tag = action.tag ?? "";
        const operatorId = operator?.open_id ?? d?.open_id ?? "";

        // select_static: cache value, return undefined (plain ACK, no toast)
        if (tag === "select_static") {
          const selectName = (action.value as any)?.action ?? action.name ?? "";
          const selectedOption = action.option ?? "";
          console.log(`[CardAction] Select: operator=${operatorId}, key="${selectName}", value="${selectedOption}"`);
          if (selectName && selectedOption) {
            cacheSelect(operatorId, selectName, selectedOption);
          }
          return undefined;
        }

        // Non-button interactions: plain ACK
        if (tag !== "button") {
          console.log(`[CardAction] Ignoring tag="${tag}"`);
          return undefined;
        }

        // Button click: inject cached values and dispatch
        if (!self.cardActionHandler) {
          console.warn("[CardAction] No handler registered");
          return undefined;
        }

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
          messageId: d?.open_message_id ?? "",
          chatId: d?.open_chat_id ?? "",
        };

        console.log(`[CardAction] Button: action="${input.actionName}", value=${JSON.stringify(input.actionValue).slice(0, 200)}`);

        try {
          const result = await self.cardActionHandler(input);
          console.log(`[CardAction] Result: toast=${!!result.toast}, card=${!!result.card}`);

          // Only return toast responses — card updates cause 200672 via WS
          if (result.toast) {
            return { toast: result.toast };
          }
          if (result.card) {
            // Card update succeeded on server but can't be sent via WS.
            // Return a success toast instead.
            return { toast: { type: "success", content: "操作成功" } };
          }
          return undefined;
        } catch (err) {
          console.error("[CardAction] Error:", err);
          return { toast: { type: "error", content: "处理失败，请重试" } };
        }
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

    // NO monkey-patch — it breaks im.message.receive_v1 delivery
    this.wsClient.start({
      eventDispatcher: dispatcher,
    });

    console.log("[AdminPanel] WebSocket client started (EventDispatcher only, no monkey-patch)");
  }

  async stop() {
    await this.wsClient?.stop?.();
  }
}
