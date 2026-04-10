/**
 * GET /api/v2/board/ranking — camp-wide leaderboard ranking.
 * GET /api/v2/board/member/:id — per-member detail panel.
 *
 * Both endpoints are public (not admin-gated). The eligibility gate
 * is enforced at the repository layer via ELIGIBLE_STUDENT_WHERE_CLAUSE
 * (spec §5.5 layer 4).
 */
import type { FastifyInstance } from "fastify";
import type { V2Runtime } from "../../app.js";

export function registerV2BoardRoutes(
  app: FastifyInstance,
  deps: V2Runtime
): void {
  app.get("/api/v2/board/ranking", async (request, reply) => {
    const query = request.query as { campId?: string };
    const campId = query.campId ?? deps.repository.getDefaultCampId();

    if (!campId) {
      return reply.code(404).send({ ok: false, code: "no_camp" });
    }

    try {
      const rows = deps.repository.fetchRankingByCamp(campId);
      return reply.send({ ok: true, campId, rows });
    } catch (err) {
      return reply.code(500).send({ ok: false, code: "internal_error" });
    }
  });

  app.get("/api/v2/board/member/:id", async (request, reply) => {
    const params = request.params as { id: string };

    try {
      const detail = deps.repository.fetchMemberBoardDetail(params.id);
      if (!detail) {
        return reply.code(404).send({ ok: false, code: "not_found" });
      }
      return reply.send({ ok: true, detail });
    } catch (err) {
      return reply.code(500).send({ ok: false, code: "internal_error" });
    }
  });
}
