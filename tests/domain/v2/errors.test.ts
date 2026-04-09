import { describe, expect, test } from "vitest";

import {
  DomainError,
  DuplicateEventError,
  IceBreakerPeriodError,
  InvalidDecisionStateError,
  InvalidLevelTransitionError,
  LlmExhaustedError,
  LlmNonRetryableError,
  LlmRetryableError,
  NoActivePeriodError,
  NoActiveWindowError,
  NotEligibleError,
  PerPeriodCapExceededError,
  WindowAlreadySettledError
} from "../../../src/domain/v2/errors.js";

describe("DomainError hierarchy", () => {
  test("NotEligibleError carries code 'not_eligible'", () => {
    const err = new NotEligibleError("member-1");
    expect(err).toBeInstanceOf(DomainError);
    expect(err.code).toBe("not_eligible");
    expect(err.message).toContain("member-1");
    expect(err.name).toBe("NotEligibleError");
  });

  test("PerPeriodCapExceededError exposes memberId, itemCode, cap", () => {
    const err = new PerPeriodCapExceededError("member-1", "K3", 3);
    expect(err.code).toBe("cap_exceeded");
    expect(err.message).toContain("K3");
    expect(err.message).toContain("3");
  });

  test("DuplicateEventError carries source ref", () => {
    const err = new DuplicateEventError("src-abc");
    expect(err.code).toBe("duplicate");
    expect(err.message).toContain("src-abc");
  });

  test("all other error classes are DomainError subclasses with distinct codes", () => {
    const errors: DomainError[] = [
      new NoActivePeriodError(),
      new IceBreakerPeriodError(),
      new NoActiveWindowError(),
      new WindowAlreadySettledError("window-w1"),
      new InvalidLevelTransitionError(1, 3),
      new InvalidDecisionStateError("evt-xyz", "approved"),
      new LlmRetryableError("timeout"),
      new LlmNonRetryableError("json parse"),
      new LlmExhaustedError("3 attempts failed")
    ];
    const codes = errors.map((e) => e.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const err of errors) {
      expect(err).toBeInstanceOf(DomainError);
    }
  });
});
