/**
 * POST /api/v2/periods/open — trainer-initiated period opening.
 * POST /api/v2/periods/close — admin-only manual period close.
 *
 * The open endpoint is not admin-gated because the broader /开期
 * slash-command flow in sub-project 2 already gates it inside Feishu.
 * Sub-project 3 may add requireAdmin if exposed to the admin console.
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { parseStrict, mapDomainErrorToHttp, adminGuard } from "./common.js";
import type { V2Runtime } from "../../app.js";

const openSchema = z
  .object({
    number: z.number().int().min(1).max(12),
  })
  .strict();

export function registerV2PeriodsOpenRoute(
  app: FastifyInstance,
  deps: V2Runtime
): void {
  app.post("/api/v2/periods/open", async (request, reply) => {
    const parsed = parseStrict(openSchema, request.body, reply);
    if (!parsed) return;

    try {
      const lifecycle = deps.periodLifecycle as {
        openNewPeriod(n: number): Promise<{
          periodId: string;
          assignedWindowId: string;
          shouldSettleWindowId: string | null;
        }>;
      };
      const result = await lifecycle.openNewPeriod(parsed.number);
      return reply.code(201).send({
        ok: true,
        periodId: result.periodId,
        assignedWindowId: result.assignedWindowId,
        shouldSettleWindowId: result.shouldSettleWindowId,
      });
    } catch (err) {
      return mapDomainErrorToHttp(err, reply);
    }
  });
}

const closeSchema = z
  .object({
    periodId: z.string().min(1),
    reason: z.string().min(1),
  })
  .strict();

export function registerV2PeriodsCloseRoute(
  app: FastifyInstance,
  deps: V2Runtime
): void {
  app.post(
    "/api/v2/periods/close",
    { onRequest: adminGuard(deps.repository) },
    async (request, reply) => {
      const parsed = parseStrict(closeSchema, request.body, reply);
      if (!parsed) return;

      try {
        const repo = deps.repository as {
          closePeriod(periodId: string, reason: string, opId: string): void;
        };
        const admin = request.currentAdmin!;
        const opId = (admin as unknown as { sourceFeishuOpenId?: string }).sourceFeishuOpenId
          ?? admin.id;
        repo.closePeriod(parsed.periodId, parsed.reason, opId);
        return reply.code(200).send({ ok: true });
      } catch (err) {
        return mapDomainErrorToHttp(err, reply);
      }
    }
  );
}
