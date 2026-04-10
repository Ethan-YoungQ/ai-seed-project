/**
 * POST /api/v2/windows/open — admin-only window opening.
 *
 * Windows W3, W4, W5, and FINAL are lazy-loaded by trainer command.
 * Opening an already-existing window is idempotent (returns 200 instead of 201).
 *
 * The window code regex accepts exactly W1-W5 and FINAL.
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { parseStrict, mapDomainErrorToHttp, adminGuard } from "./common.js";
import type { V2Runtime } from "../../app.js";

const openWindowSchema = z
  .object({
    code: z.string().regex(/^W[1-5]$|^FINAL$/),
  })
  .strict();

export function registerV2WindowsOpenRoute(
  app: FastifyInstance,
  deps: V2Runtime
): void {
  app.post(
    "/api/v2/windows/open",
    { onRequest: adminGuard(deps.repository) },
    async (request, reply) => {
      const parsed = parseStrict(openWindowSchema, request.body, reply);
      if (!parsed) return;

      try {
        const lifecycle = deps.periodLifecycle as {
          openWindow(code: string): Promise<{ windowId: string; created: boolean }>;
        };
        const result = await lifecycle.openWindow(parsed.code);
        const status = result.created ? 201 : 200;
        return reply.code(status).send({
          ok: true,
          windowId: result.windowId,
          created: result.created,
        });
      } catch (err) {
        return mapDomainErrorToHttp(err, reply);
      }
    }
  );
}
