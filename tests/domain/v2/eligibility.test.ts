import { describe, expect, test } from "vitest";

import {
  ELIGIBLE_STUDENT_WHERE_CLAUSE,
  isEligibleStudent,
  type EligibilityInput
} from "../../../src/domain/v2/eligibility.js";

function base(): EligibilityInput {
  return {
    roleType: "student",
    isParticipant: true,
    isExcludedFromBoard: false
  };
}

describe("isEligibleStudent", () => {
  test("returns true for baseline student", () => {
    expect(isEligibleStudent(base())).toBe(true);
  });

  test("returns false when roleType is operator", () => {
    expect(isEligibleStudent({ ...base(), roleType: "operator" })).toBe(false);
  });

  test("returns false when roleType is trainer", () => {
    expect(isEligibleStudent({ ...base(), roleType: "trainer" })).toBe(false);
  });

  test("returns false when roleType is observer", () => {
    expect(isEligibleStudent({ ...base(), roleType: "observer" })).toBe(false);
  });

  test("returns false when isParticipant=false", () => {
    expect(isEligibleStudent({ ...base(), isParticipant: false })).toBe(false);
  });

  test("returns false when isExcludedFromBoard=true", () => {
    expect(isEligibleStudent({ ...base(), isExcludedFromBoard: true })).toBe(false);
  });

  test("returns false when input is null/undefined", () => {
    expect(isEligibleStudent(undefined)).toBe(false);
    expect(isEligibleStudent(null)).toBe(false);
  });

  test("ELIGIBLE_STUDENT_WHERE_CLAUSE mirrors the TS predicate for SQL callers", () => {
    // Phase G7 imports this constant instead of inlining the rule, so the
    // SQL layer and the domain layer stay in lockstep (spec §5.6).
    expect(ELIGIBLE_STUDENT_WHERE_CLAUSE).toContain("role_type = 'student'");
    expect(ELIGIBLE_STUDENT_WHERE_CLAUSE).toContain("is_participant = 1");
    expect(ELIGIBLE_STUDENT_WHERE_CLAUSE).toContain("is_excluded_from_board = 0");
  });
});
