/**
 * POST /api/v2/graduation/close — admin-only graduation ceremony close.
 *
 * Period 12 (the final period) has no "next /开期" call to trigger
 * settlement of the FINAL window. Spec §8.3 mandates a separate /结业
 * command that becomes this endpoint. This is the only way to finish
 * the camp cleanly and commit the final promotions.
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { parseStrict, mapDomainErrorToHttp, adminGuard } from "./common.js";
import type { V2Runtime } from "../../app.js";

const bodySchema = z.object({}).strict();

export function registerV2GraduationCloseRoute(
  app: FastifyInstance,
  deps: V2Runtime
): void {
  app.post(
    "/api/v2/graduation/close",
    { onRequest: adminGuard(deps.repository) },
    async (request, reply) => {
      const parsed = parseStrict(bodySchema, request.body, reply);
      if (!parsed) return;

      try {
        const lifecycle = deps.periodLifecycle as {
          closeGraduation(admin: unknown): Promise<{
            finalWindowId: string;
            settled: boolean;
          }>;
        };
        const result = await lifecycle.closeGraduation(request.currentAdmin!);
        return reply.code(200).send({
          ok: true,
          finalWindowId: result.finalWindowId,
          settled: result.settled,
        });
      } catch (err) {
        return mapDomainErrorToHttp(err, reply);
      }
    }
  );
}
