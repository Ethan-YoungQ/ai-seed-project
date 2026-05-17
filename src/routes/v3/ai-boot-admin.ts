import type { FastifyInstance, FastifyReply } from "fastify";
import { z, type ZodError, type ZodType } from "zod";

import type { requireAdmin } from "../../app.js";
import type {
  AiBootScoreCategory,
  AiBootScoreEventRecord,
} from "../../domain/v3/ai-boot-types.js";
import { parseScoringDecision } from "../../domain/v3/scoring-decision.js";
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

function reviewNoteOrDefault(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : fallback;
}

function parseQueryInteger(input: {
  value: unknown;
  fallback: number;
  min: number;
  max?: number;
}): number | null {
  if (input.value === undefined) {
    return input.fallback;
  }
  if (typeof input.value !== "string" || !/^\d+$/.test(input.value.trim())) {
    return null;
  }
  const parsed = Number(input.value);
  if (!Number.isSafeInteger(parsed) || parsed < input.min) {
    return null;
  }
  if (input.max !== undefined && parsed > input.max) {
    return null;
  }
  return parsed;
}

function conflict(reply: FastifyReply) {
  return reply.code(409).send({ ok: false, code: "decision_conflict" });
}

function updateDecision(
  repository: SqliteRepository,
  input: Parameters<SqliteRepository["updateAiBootScoreDecision"]>[0]
): "not_found" | "conflict" | AiBootScoreEventRecord {
  if (!repository.getAiBootScoreEvent(input.id)) {
    return "not_found";
  }
  if (!repository.updateAiBootScoreDecision(input)) {
    return "conflict";
  }
  return repository.getAiBootScoreEvent(input.id)!;
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
      if (Object.prototype.hasOwnProperty.call(query, "campId") && query.campId?.trim() === "") {
        return reply.code(400).send({ ok: false, code: "invalid_query" });
      }
      const campId = query.campId?.trim()
        ?? deps.repository.getDefaultCampId()
        ?? "default";
      const limit = parseQueryInteger({
        value: query.limit,
        fallback: 100,
        min: 1,
        max: 200,
      });
      const offset = parseQueryInteger({
        value: query.offset,
        fallback: 0,
        min: 0,
      });
      if (limit === null || offset === null) {
        return reply.code(400).send({ ok: false, code: "invalid_query" });
      }

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
      if (scoreEvent === "not_found") {
        return reply.code(404).send({ ok: false, code: "not_found" });
      }
      if (scoreEvent === "conflict") return conflict(reply);
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
      if (scoreEvent === "not_found") {
        return reply.code(404).send({ ok: false, code: "not_found" });
      }
      if (scoreEvent === "conflict") return conflict(reply);
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
      const existing = deps.repository.getAiBootScoreEvent(params.id);
      if (!existing) {
        return reply.code(404).send({ ok: false, code: "not_found" });
      }
      const decision = parseScoringDecision({
        status: "approved",
        category: parsed.category,
        scoreDelta: parsed.scoreDelta,
        confidence: existing.confidence,
        notifyPolicy: existing.notifyPolicy,
        reason: parsed.reason,
        evidence: existing.evidence,
        badges: [],
      });

      const scoreEvent = updateDecision(deps.repository, {
        id: params.id,
        status: "approved",
        reviewedByOpId: request.currentAdmin!.id,
        reviewNote: parsed.reviewNote,
        category: decision.category as AiBootScoreCategory,
        scoreDelta: decision.scoreDelta,
        reason: decision.reason,
      });
      if (scoreEvent === "conflict") return conflict(reply);
      return reply.send({ ok: true, scoreEvent });
    }
  );
}
