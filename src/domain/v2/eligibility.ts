export type MemberRoleType = "student" | "operator" | "trainer" | "observer";

export interface EligibilityInput {
  roleType: MemberRoleType;
  isParticipant: boolean;
  isExcludedFromBoard: boolean;
}

export function isEligibleStudent(
  member: EligibilityInput | null | undefined
): boolean {
  if (!member) return false;
  if (member.roleType !== "student") return false;
  if (!member.isParticipant) return false;
  if (member.isExcludedFromBoard) return false;
  return true;
}

/**
 * SQL mirror of `isEligibleStudent` for use in repository-layer queries.
 * The spec (§5.6) calls `isEligibleStudent` the "唯一真相源" (single source
 * of truth) for eligibility. Any SQL caller that filters eligible students
 * (e.g. Phase G7 `fetchRankingByCamp`) MUST import this constant instead of
 * inlining the predicate, so the TS function and the SQL layer cannot drift.
 *
 * Intended usage: `WHERE ${ELIGIBLE_STUDENT_WHERE_CLAUSE}` against a `members`
 * row or alias (columns: `role_type`, `is_participant`, `is_excluded_from_board`).
 * If a new eligibility column is added, edit BOTH `isEligibleStudent` and this
 * constant in the same commit; the A5 test asserts they contain matching tokens.
 */
export const ELIGIBLE_STUDENT_WHERE_CLAUSE =
  "role_type = 'student' AND is_participant = 1 AND is_excluded_from_board = 0";
