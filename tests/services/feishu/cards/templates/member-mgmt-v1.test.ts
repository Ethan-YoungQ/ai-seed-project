import { describe, expect, test } from "vitest";

import {
  buildMemberMgmtCard,
  MEMBER_MGMT_TEMPLATE_ID
} from "../../../../../src/services/feishu/cards/templates/member-mgmt-v1.js";
import {
  assertCardSize,
  CARD_SIZE_BUDGET_BYTES
} from "../../../../../src/services/feishu/cards/renderer.js";
import type { MemberLite } from "../../../../../src/services/feishu/cards/types.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeMember(i: number, roleType: MemberLite["roleType"] = "student"): MemberLite {
  return {
    id: `m-${i}`,
    displayName: `成员${i}`,
    roleType,
    isParticipant: true,
    isExcludedFromBoard: i % 2 === 0,
    currentLevel: i
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("member-mgmt-v1 template", () => {
  test("MEMBER_MGMT_TEMPLATE_ID is 'member-mgmt-v1'", () => {
    expect(MEMBER_MGMT_TEMPLATE_ID).toBe("member-mgmt-v1");
  });

  test("header shows 👥 成员管理 with blue template", () => {
    const card = buildMemberMgmtCard({ members: [makeMember(1)] });
    const json = JSON.stringify(card);
    expect(json).toContain("👥 成员管理");
    expect(json).toContain("blue");
  });

  test("member rows display displayName, role, level, hidden status, and action buttons", () => {
    const member = makeMember(3, "operator");
    const card = buildMemberMgmtCard({ members: [member] });
    const json = JSON.stringify(card);

    expect(json).toContain(member.displayName);
    expect(json).toContain("member_toggle_hidden");
    expect(json).toContain("member_change_role");
    expect(json).toContain(member.id);
  });

  test("empty member list shows 暂无成员数据 without action buttons", () => {
    const card = buildMemberMgmtCard({ members: [] });
    const json = JSON.stringify(card);
    expect(json).toContain("暂无成员数据");
    expect(json).not.toContain("member_toggle_hidden");
  });

  test("20 members full card stays under CARD_SIZE_BUDGET_BYTES", () => {
    const members = Array.from({ length: 20 }, (_, i) => makeMember(i + 1));
    const card = buildMemberMgmtCard({ members });
    expect(() => assertCardSize(card)).not.toThrow();
    const size = Buffer.byteLength(JSON.stringify(card), "utf8");
    expect(size).toBeLessThan(CARD_SIZE_BUDGET_BYTES);
  });
});
