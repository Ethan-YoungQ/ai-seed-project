/**
 * GET  /api/v2/admin/review-queue — list events in review_required state.
 * POST /api/v2/admin/review-queue/:eventId — approve or reject an event.
 *
 * Both endpoints are admin-gated. The POST body carries both a decision
 * and a note (mandatory for audit compliance per spec §5.5 layer 2).
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { parseStrict, mapDomainErrorToHttp, adminGuard } from "./common.js";
import type { V2Runtime } from "../../app.js";

const decisionSchema = z
  .object({
    decision: z.enum(["approved", "rejected"]),
    note: z.string().min(1),
  })
  .strict();

export function registerV2AdminReviewRoutes(
  app: FastifyInstance,
  deps: V2Runtime
): void {
  // GET — list pending reviews
  app.get(
    "/api/v2/admin/review-queue",
    { onRequest: adminGuard(deps.repository) },
    async (request, reply) => {
      const query = request.query as { campId?: string; limit?: string; offset?: string };

      try {
        const rows = deps.repository.listReviewRequiredEvents({
          campId: query.campId,
          limit: query.limit ? Number(query.limit) : 100,
          offset: query.offset ? Number(query.offset) : 0,
        });
        return reply.send({ ok: true, rows });
      } catch (err) {
        return mapDomainErrorToHttp(err, reply);
      }
    }
  );

  // POST — decide on a review event
  app.post(
    "/api/v2/admin/review-queue/:eventId",
    { onRequest: adminGuard(deps.repository) },
    async (request, reply) => {
      const params = request.params as { eventId: string };
      const parsed = parseStrict(decisionSchema, request.body, reply);
      if (!parsed) return;

      try {
        const aggregator = deps.aggregator as {
          applyDecision(
            eventId: string,
            input: { decision: "approved" | "rejected"; note?: string },
            operator: { id: string; openId: string }
          ): unknown;
        };
        const admin = request.currentAdmin!;
        aggregator.applyDecision(
          params.eventId,
          { decision: parsed.decision, note: parsed.note },
          { id: admin.id, openId: admin.id }
        );
        return reply.code(200).send({ ok: true });
      } catch (err) {
        return mapDomainErrorToHttp(err, reply);
      }
    }
  );
}
