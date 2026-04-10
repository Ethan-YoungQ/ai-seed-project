/**
 * Shared helpers for all v2 route files.
 *
 * Every route in this phase imports from this single module,
 * which keeps import blocks to one line per route file.
 */
import type { FastifyReply } from "fastify";
import type { ZodType, ZodError } from "zod";
import { mapDomainErrorToHttp } from "../../app-v2-errors.js";
import { requireAdmin } from "../../app.js";

export { mapDomainErrorToHttp };

/**
 * Thin alias over `requireAdmin` scoped to the v2 surface.
 */
export const adminGuard = requireAdmin;

/**
 * Strictly parse `body` against `schema`. On success returns the
 * parsed value; on failure sends a 400 reply and returns `null`.
 */
export function parseStrict<T>(
  schema: ZodType<T>,
  body: unknown,
  reply: FastifyReply
): T | null {
  const parsed = (schema as { safeParse(data: unknown): { success: boolean; data?: T; error?: ZodError } }).safeParse(body);
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
