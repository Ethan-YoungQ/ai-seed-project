/**
 * POST /api/v2/events — HTTP entrypoint for the EventIngestor.
 *
 * This route is the single entry point for manual event ingestion,
 * primarily called by sub-project 2's card-action handler.
 *
 * Not admin-gated: the ingestor itself gates via `isEligibleStudent`
 * (spec §5.6 — single source of truth for eligibility).
 *
 * References: spec §1.3 (API naming), §5.5 layer 1 (ingestor gate).
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { parseStrict, mapDomainErrorToHttp } from "./common.js";
import type { V2Runtime } from "../../app.js";

const bodySchema = z
  .object({
    memberId: z.string().min(1),
    itemCode: z.string().min(1),
    scoreDelta: z.number().int().optional(),
    sourceRef: z.string().min(1),
    payload: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

type PostEventBody = z.infer<typeof bodySchema>;

export function registerV2EventsRoute(
  app: FastifyInstance,
  deps: V2Runtime
): void {
  app.post<{ Body: PostEventBody }>("/api/v2/events", async (request, reply) => {
    const parsed = parseStrict(bodySchema, request.body, reply);
    if (!parsed) return;

    try {
      const ingestor = deps.ingestor as { ingest(data: PostEventBody): Promise<{ eventId: string }> };
      const result = await ingestor.ingest(parsed);
      return reply.code(202).send({ ok: true, eventId: result.eventId });
    } catch (err) {
      return mapDomainErrorToHttp(err, reply);
    }
  });
}
