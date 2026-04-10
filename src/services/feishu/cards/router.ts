import type { FastifyInstance, FastifyPluginAsync, FastifyReply } from "fastify";
import { z } from "zod";
import type { CardActionDispatcher } from "./card-action-dispatcher.js";
import type { CardActionResult, CardType } from "./types.js";

// ---------------------------------------------------------------------------
// Schema definitions
// ---------------------------------------------------------------------------

const cardTypeSchema = z.enum([
  "period_open", "window_open", "quiz", "homework_submit",
  "video_checkin", "peer_review_vote", "peer_review_settle",
  "daily_checkin", "leaderboard", "level_announcement",
  "graduation", "llm_decision", "c1_echo", "review_queue",
  "member_mgmt", "manual_adjust"
]);

const cardActionBodySchema = z.object({
  operator: z.object({ open_id: z.string().min(1) }),
  trigger_id: z.string().min(1),
  action: z.object({
    name: z.string().min(1),
    value: z.record(z.string(), z.unknown()).default({})
  }),
  context: z.object({
    open_message_id: z.string().min(1),
    open_chat_id: z.string().min(1),
    url: z.string().optional()
  }),
  card: z.object({
    type: cardTypeSchema,
    version: z.string().optional()
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
    void reply.code(200).send({ card: result.newCardJson });
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
    app.post("/api/v2/feishu/card-action", async (request, reply) => {
      const parsed = cardActionBodySchema.safeParse(request.body);
      if (!parsed.success) {
        void reply.code(400).send({ error: "invalid_body", details: parsed.error.flatten() });
        return;
      }
      const body = parsed.data;
      const result = await options.dispatcher.dispatch({
        cardType: body.card.type,
        actionName: body.action.name,
        payload: body.action.value,
        operatorOpenId: body.operator.open_id,
        triggerId: body.trigger_id,
        messageId: body.context.open_message_id,
        chatId: body.context.open_chat_id,
        receivedAt: new Date().toISOString(),
        currentVersion: body.card.version ?? options.currentVersion(body.card.type)
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
