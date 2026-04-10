/**
 * Centralised domain-error → HTTP mapping for all v2 routes.
 *
 * Mapping table (spec section 6.4):
 *
 * | DomainError subclass         | code                     | HTTP |
 * |------------------------------|--------------------------|------|
 * | NotEligibleError             | not_eligible             | 400  |
 * | PerPeriodCapExceededError     | cap_exceeded             | 400  |
 * | DuplicateEventError          | duplicate                | 400  |
 * | NoActivePeriodError          | no_active_period         | 409  |
 * | IceBreakerPeriodError        | ice_breaker_no_scoring   | 409  |
 * | NoActiveWindowError          | no_active_window         | 409  |
 * | WindowAlreadySettledError    | window_already_settled   | 409  |
 * | InvalidLevelTransitionError  | invalid_level_transition | 400  |
 * | InvalidDecisionStateError    | invalid_decision_state   | 409  |
 * | LlmRetryableError           | llm_retryable            | 503  |
 * | LlmNonRetryableError        | llm_non_retryable        | 502  |
 * | LlmExhaustedError           | llm_exhausted            | 502  |
 */

import type { FastifyReply } from "fastify";
import { DomainError } from "./domain/v2/errors.js";

const STATUS_MAP: Record<string, number> = {
  not_eligible: 400,
  cap_exceeded: 400,
  duplicate: 400,
  invalid_level_transition: 400,
  no_active_period: 409,
  ice_breaker_no_scoring: 409,
  no_active_window: 409,
  window_already_settled: 409,
  invalid_decision_state: 409,
  llm_retryable: 503,
  llm_non_retryable: 502,
  llm_exhausted: 502,
};

export function mapDomainErrorToHttp(
  err: unknown,
  reply: FastifyReply
): FastifyReply {
  if (err instanceof DomainError) {
    const status = STATUS_MAP[err.code] ?? 500;
    return reply
      .code(status)
      .send({ ok: false, code: err.code, message: err.message });
  }

  reply.request.log.error({ err }, "unhandled_error");
  return reply.code(500).send({ ok: false, code: "internal_error" });
}
