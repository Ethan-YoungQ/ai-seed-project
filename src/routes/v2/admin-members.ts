/**
 * GET   /api/v2/admin/members — list all members (admin sees everything).
 * PATCH /api/v2/admin/members/:id — partial update of member metadata.
 *
 * Both endpoints are admin-gated. The PATCH body uses Zod strict
 * validation with a refine that rejects empty patches.
 *
 * Column names in the UPDATE are hard-coded (whitelisted) in the
 * repository layer to prevent column-name injection (spec SQL injection
 * prevention requirement).
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { parseStrict, mapDomainErrorToHttp, adminGuard } from "./common.js";
import type { V2Runtime } from "../../app.js";

const patchSchema = z
  .object({
    roleType: z.enum(["student", "operator", "trainer", "observer"]).optional(),
    isParticipant: z.boolean().optional(),
    isExcludedFromBoard: z.boolean().optional(),
    hiddenFromBoard: z.boolean().optional(),
    displayName: z.string().min(1).optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: "empty_patch",
  });

export function registerV2AdminMembersRoutes(
  app: FastifyInstance,
  deps: V2Runtime
): void {
  // GET — list all members
  app.get(
    "/api/v2/admin/members",
    { onRequest: adminGuard(deps.repository) },
    async (request, reply) => {
      const query = request.query as { campId?: string };
      try {
        const rows = deps.repository.listMembersForAdmin(query.campId);
        return reply.send({ ok: true, rows });
      } catch (err) {
        return mapDomainErrorToHttp(err, reply);
      }
    }
  );

  // PATCH — partial update
  app.patch(
    "/api/v2/admin/members/:id",
    { onRequest: adminGuard(deps.repository) },
    async (request, reply) => {
      const params = request.params as { id: string };
      const parsed = parseStrict(patchSchema, request.body, reply);
      if (!parsed) return;

      try {
        const updated = deps.repository.patchMemberForAdmin(params.id, parsed);
        if (!updated) {
          return reply.code(404).send({ ok: false, code: "not_found" });
        }
        return reply.send({ ok: true, member: updated });
      } catch (err) {
        return mapDomainErrorToHttp(err, reply);
      }
    }
  );
}
