import type { FastifyInstance, FastifyPluginAsync, FastifyReply } from "fastify";
import { z } from "zod";
import type { CardActionDispatcher } from "./card-action-dispatcher.js";
import type { CardActionResult, CardType } from "./types.js";

// ---------------------------------------------------------------------------
// Schema definitions
// ---------------------------------------------------------------------------

/**
 * Feishu card action callback payload (schema v2.0).
 * The actual event data is nested inside the `event` field.
 * Reference: https://open.feishu.cn/document/uAjLw4CM/ukzMukzMukzM/feishu-cards/card-callback-communication
 */
const cardActionBodySchema = z.object({
  schema: z.string().optional(),
  header: z.object({
    event_type: z.string().optional(),
    token: z.string().optional(),
    app_id: z.string().optional()
  }).optional(),
  event: z.object({
    operator: z.object({ open_id: z.string().min(1) }),
    token: z.string().optional(),
    action: z.object({
      name: z.string().optional().default(""),
      value: z.record(z.string(), z.unknown()).default({}),
      tag: z.string().optional(),
      form_value: z.record(z.string(), z.unknown()).optional()
    }),
    context: z.object({
      open_message_id: z.string().min(1),
      open_chat_id: z.string().min(1)
    })
  })
});

const commandBodySchema = z.object({
  sender: z.object({ open_id: z.string().min(1) }),
  chat: z.object({ chat_id: z.string().min(1) }),
  message: z.object({
    message_id: z.string().min(1),
    text: z.string().min(1)
  })
});

// ---------------------------------------------------------------------------
// Card type resolution from action name
// ---------------------------------------------------------------------------

/**
 * Determines the card type from the action name prefix.
 * Our handlers embed the card type as a prefix in the action name
 * (e.g., "daily_checkin_k3_submit" → "daily_checkin").
 * Falls back to checking `action.value.action` field which handlers also set.
 */
export function resolveCardType(actionName: string, actionValue: Record<string, unknown>): CardType | null {
  // Check action name prefix first
  if (actionName.startsWith("daily_checkin_")) return "daily_checkin";
  if (actionName.startsWith("quiz_")) return "quiz";
  if (actionName.startsWith("homework_")) return "homework_submit";
  if (actionName.startsWith("review_")) return "review_queue";
  if (actionName.startsWith("member_")) return "member_mgmt";
  if (actionName.startsWith("manual_")) return "manual_adjust";
  if (actionName.startsWith("admin_panel_")) return "admin_panel";
  if (actionName.startsWith("video_")) return "video_checkin";
  if (actionName.startsWith("peer_review_")) return "peer_review_vote";
  if (actionName.startsWith("llm_")) return "llm_decision";
  if (actionName.startsWith("leaderboard_")) return "leaderboard";
  if (actionName.startsWith("period_")) return "period_open";
  if (actionName.startsWith("window_")) return "window_open";
  if (actionName.startsWith("level_")) return "level_announcement";
  if (actionName.startsWith("graduation_")) return "graduation";
  if (actionName.startsWith("c1_")) return "c1_echo";
  if (actionName.startsWith("settle_")) return "peer_review_settle";

  // Fallback: check action.value.action field
  const embeddedAction = actionValue["action"];
  if (typeof embeddedAction === "string") {
    return resolveCardType(embeddedAction, {});
  }

  return null;
}

// ---------------------------------------------------------------------------
// Plugin options
// ---------------------------------------------------------------------------

export interface FeishuCardsPluginOptions {
  dispatcher: CardActionDispatcher;
  currentVersion: (cardType: CardType) => string;
  commandDispatcher?: (
    commandName: string,
    body: z.infer<typeof commandBodySchema>
  ) => Promise<CardActionResult | null>;
}

// ---------------------------------------------------------------------------
// Response helper — use reply.code().send() pattern for Fastify async routes
// ---------------------------------------------------------------------------

function sendResult(reply: FastifyReply, result: CardActionResult): void {
  if (result.newCardJson) {
    // Feishu card callback API requires the card JSON to be wrapped in
    // { type: "raw", data: {...} } per the official documentation.
    void reply.code(200).send({ card: { type: "raw", data: result.newCardJson } });
    return;
  }
  if (result.toast) {
    void reply.code(200).send({ toast: result.toast });
    return;
  }
  void reply.code(500).send({ error: "empty_response" });
}

// ---------------------------------------------------------------------------
// Fastify plugin
// ---------------------------------------------------------------------------

export const feishuCardsPlugin: FastifyPluginAsync<FeishuCardsPluginOptions> =
  async (app: FastifyInstance, options: FeishuCardsPluginOptions) => {
    // Route 1: Card action callbacks from Feishu
    // Verify Feishu verification token to prevent forged callbacks
    const expectedToken = process.env.FEISHU_VERIFICATION_TOKEN;

    app.post("/api/v2/feishu/card-action", async (request, reply) => {
      const parsed = cardActionBodySchema.safeParse(request.body);
      if (!parsed.success) {
        void reply.code(400).send({ error: "invalid_body", details: parsed.error.flatten() });
        return;
      }

      // Verify Feishu verification token (header.token or event.token)
      if (expectedToken) {
        const callbackToken = parsed.data.header?.token ?? parsed.data.event.token;
        if (callbackToken !== expectedToken) {
          void reply.code(401).send({ error: "invalid_verification_token" });
          return;
        }
      }
      const { event } = parsed.data;
      const actionName = event.action.name;
      const actionValue = event.action.value;

      const cardType = resolveCardType(actionName, actionValue);
      if (!cardType) {
        void reply.code(400).send({ error: "unresolvable_card_type", actionName });
        return;
      }

      const result = await options.dispatcher.dispatch({
        cardType,
        actionName,
        payload: actionValue,
        operatorOpenId: event.operator.open_id,
        triggerId: event.token ?? "",
        messageId: event.context.open_message_id,
        chatId: event.context.open_chat_id,
        receivedAt: new Date().toISOString(),
        currentVersion: options.currentVersion(cardType)
      });
      sendResult(reply, result);
    });

    // Route 2: Slash command dispatch
    app.post<{ Params: { name: string } }>(
      "/api/v2/feishu/commands/:name",
      async (request, reply) => {
        const parsed = commandBodySchema.safeParse(request.body);
        if (!parsed.success) {
          void reply.code(400).send({ error: "invalid_body", details: parsed.error.flatten() });
          return;
        }
        if (!options.commandDispatcher) {
          void reply.code(404).send({ error: "unknown_command", command: request.params.name });
          return;
        }
        const result = await options.commandDispatcher(request.params.name, parsed.data);
        if (!result) {
          void reply.code(404).send({ error: "unknown_command", command: request.params.name });
          return;
        }
        sendResult(reply, result);
      }
    );
  };
