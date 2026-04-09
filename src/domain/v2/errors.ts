export class DomainError extends Error {
  constructor(
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class NotEligibleError extends DomainError {
  constructor(memberId: string) {
    super("not_eligible", `Member ${memberId} is not an eligible student`);
  }
}

export class PerPeriodCapExceededError extends DomainError {
  constructor(memberId: string, itemCode: string, cap: number) {
    super(
      "cap_exceeded",
      `${itemCode} per-period cap ${cap} reached for member ${memberId}`
    );
  }
}

export class DuplicateEventError extends DomainError {
  constructor(sourceRef: string) {
    super("duplicate", `Event with sourceRef=${sourceRef} already exists`);
  }
}

export class NoActivePeriodError extends DomainError {
  constructor() {
    super("no_active_period", "No active period currently open");
  }
}

export class IceBreakerPeriodError extends DomainError {
  constructor() {
    super("ice_breaker_no_scoring", "Ice-breaker period does not count toward AQ");
  }
}

export class NoActiveWindowError extends DomainError {
  constructor() {
    super(
      "no_active_window",
      "No open evaluation window available; please /开窗 <code> first"
    );
  }
}

export class WindowAlreadySettledError extends DomainError {
  constructor(windowId: string) {
    super("window_already_settled", `Window ${windowId} is already settled`);
  }
}

export class InvalidLevelTransitionError extends DomainError {
  constructor(from: number, to: number) {
    super(
      "invalid_level_transition",
      `Invalid level transition: ${from} -> ${to}`
    );
  }
}

/**
 * Thrown when an operator attempts to decide on a scoring event that is
 * not currently in `review_required` state (e.g. already `approved`/`rejected`).
 * Referenced by Phase G9 review-queue POST route — returns HTTP 409.
 */
export class InvalidDecisionStateError extends DomainError {
  constructor(eventId: string, currentStatus: string) {
    super(
      "invalid_decision_state",
      `Event ${eventId} is not in review_required state (current: ${currentStatus})`
    );
  }
}

export class LlmRetryableError extends DomainError {
  constructor(reason: string) {
    super("llm_retryable", reason);
  }
}

export class LlmNonRetryableError extends DomainError {
  constructor(reason: string) {
    super("llm_non_retryable", reason);
  }
}

export class LlmExhaustedError extends DomainError {
  constructor(reason: string) {
    super("llm_exhausted", reason);
  }
}
