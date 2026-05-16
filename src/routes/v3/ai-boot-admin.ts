import type { FastifyInstance, FastifyReply } from "fastify";
import { z, type ZodError, type ZodType } from "zod";

import type { requireAdmin } from "../../app.js";
import type {
  AiBootScoreCategory,
  AiBootScoreEventRecord,
} from "../../domain/v3/ai-boot-types.js";
import type { SqliteRepository } from "../../storage/sqlite-repository.js";

export interface V3AiBootAdminRouteDeps {
  repository: SqliteRepository;
  requireAdmin: ReturnType<typeof requireAdmin>;
}

const aiBootScoreCategories = [
  "daily_participation",
  "ai_artifact",
  "ai_practice_reflection",
  "prompt_or_method",
  "resource_recommendation",
  "peer_help",
  "formal_task",
  "operator_adjustment",
] as const;

const optionalNoteSchema = z
  .object({
    reviewNote: z.string().optional(),
  })
  .strict();

const correctSchema = z
  .object({
    category: z.enum(aiBootScoreCategories),
    scoreDelta: z.number().finite(),
    reason: z.string().trim().min(1),
    reviewNote: z.string().trim().min(1),
  })
  .strict();

function parseStrict<T>(
  schema: ZodType<T>,
  body: unknown,
  reply: FastifyReply
): T | null {
  const parsed = (schema as {
    safeParse(data: unknown): {
      success: boolean;
      data?: T;
      error?: ZodError;
    };
  }).safeParse(body ?? {});
  if (!parsed.success) {
    reply.code(400).send({
      ok: false,
      code: "invalid_body",
      details: parsed.error!.flatten(),
    });
    return null;
  }
  return parsed.data as T;
}

function parseNonNegativeInteger(value: unknown, fallback: number): number {
  if (typeof value !== "string" || value.trim() === "") {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(0, Math.trunc(parsed));
}

function reviewNoteOrDefault(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : fallback;
}

function updateDecision(
  repository: SqliteRepository,
  input: Parameters<SqliteRepository["updateAiBootScoreDecision"]>[0]
): AiBootScoreEventRecord | undefined {
  if (!repository.getAiBootScoreEvent(input.id)) {
    return undefined;
  }
  repository.updateAiBootScoreDecision(input);
  return repository.getAiBootScoreEvent(input.id);
}

export function registerV3AiBootAdminRoutes(
  app: FastifyInstance,
  deps: V3AiBootAdminRouteDeps
): void {
  app.get(
    "/api/v3/ai-boot/review-queue",
    { onRequest: deps.requireAdmin },
    async (request, reply) => {
      const query = request.query as {
        campId?: string;
        limit?: string;
        offset?: string;
      };
      const campId = query.campId?.trim()
        || deps.repository.getDefaultCampId()
        || "default";
      const limit = Math.min(parseNonNegativeInteger(query.limit, 100), 200);
      const offset = parseNonNegativeInteger(query.offset, 0);

      const rows = deps.repository.listAiBootReviewQueue({
        campId,
        limit,
        offset,
      });
      return reply.send({ ok: true, rows });
    }
  );

  app.post(
    "/api/v3/ai-boot/score-events/:id/approve",
    { onRequest: deps.requireAdmin },
    async (request, reply) => {
      const params = request.params as { id: string };
      const parsed = parseStrict(optionalNoteSchema, request.body, reply);
      if (!parsed) return;

      const scoreEvent = updateDecision(deps.repository, {
        id: params.id,
        status: "approved",
        reviewedByOpId: request.currentAdmin!.id,
        reviewNote: reviewNoteOrDefault(parsed.reviewNote, "approved"),
      });
      if (!scoreEvent) {
        return reply.code(404).send({ ok: false, code: "not_found" });
      }
      return reply.send({ ok: true, scoreEvent });
    }
  );

  app.post(
    "/api/v3/ai-boot/score-events/:id/reject",
    { onRequest: deps.requireAdmin },
    async (request, reply) => {
      const params = request.params as { id: string };
      const parsed = parseStrict(optionalNoteSchema, request.body, reply);
      if (!parsed) return;

      const scoreEvent = updateDecision(deps.repository, {
        id: params.id,
        status: "rejected",
        reviewedByOpId: request.currentAdmin!.id,
        reviewNote: reviewNoteOrDefault(parsed.reviewNote, "rejected"),
        scoreDelta: 0,
      });
      if (!scoreEvent) {
        return reply.code(404).send({ ok: false, code: "not_found" });
      }
      return reply.send({ ok: true, scoreEvent });
    }
  );

  app.post(
    "/api/v3/ai-boot/score-events/:id/correct",
    { onRequest: deps.requireAdmin },
    async (request, reply) => {
      const params = request.params as { id: string };
      const parsed = parseStrict(correctSchema, request.body, reply);
      if (!parsed) return;

      const scoreEvent = updateDecision(deps.repository, {
        id: params.id,
        status: "approved",
        reviewedByOpId: request.currentAdmin!.id,
        reviewNote: parsed.reviewNote,
        category: parsed.category as AiBootScoreCategory,
        scoreDelta: parsed.scoreDelta,
        reason: parsed.reason,
      });
      if (!scoreEvent) {
        return reply.code(404).send({ ok: false, code: "not_found" });
      }
      return reply.send({ ok: true, scoreEvent });
    }
  );
}
