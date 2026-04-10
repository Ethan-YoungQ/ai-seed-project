/**
 * Shared helpers for v2 end-to-end integration tests.
 *
 * Provides fixture seeding, operator header construction, and
 * reusable assertion helpers.
 */
import { SqliteRepository } from "../../../src/storage/sqlite-repository.js";

export function makeOperatorHeader(openId = "ou-operator"): Record<string, string> {
  return { "x-feishu-open-id": openId };
}

/**
 * Seed N student members with Feishu open IDs into the given camp.
 * Returns the member IDs.
 */
export function seedStudents(
  repository: SqliteRepository,
  campId: string,
  count: number
): string[] {
  const ids: string[] = [];
  for (let i = 1; i <= count; i++) {
    const memberId = `m-${i}`;
    repository.ensureMember(memberId, campId);
    // Upgrade to student participant
    repository.patchMemberForAdmin(memberId, {
      roleType: "student",
      isParticipant: true,
      isExcludedFromBoard: false,
    });
    repository.setMemberFeishuOpenId(memberId, `ou-student-${i}`);
    ids.push(memberId);
  }
  return ids;
}

/**
 * Seed an operator member with a Feishu open ID.
 * Returns the member ID.
 */
export function seedOperator(
  repository: SqliteRepository,
  campId: string,
  openId = "ou-operator",
  memberId = "op-1"
): string {
  repository.ensureMember(memberId, campId);
  repository.patchMemberForAdmin(memberId, {
    roleType: "operator",
    hiddenFromBoard: true,
  });
  repository.setMemberFeishuOpenId(memberId, openId);
  return memberId;
}
