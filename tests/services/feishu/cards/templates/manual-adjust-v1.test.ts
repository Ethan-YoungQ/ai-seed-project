import { describe, expect, test } from "vitest";

import {
  buildManualAdjustCard,
  MANUAL_ADJUST_TEMPLATE_ID
} from "../../../../../src/services/feishu/cards/templates/manual-adjust-v1.js";
import {
  assertCardSize,
  CARD_SIZE_BUDGET_BYTES
} from "../../../../../src/services/feishu/cards/renderer.js";
import type { MemberLite } from "../../../../../src/services/feishu/cards/types.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeMember(i: number): MemberLite {
  return {
    id: `m-${i}`,
    displayName: `学员${i}`,
    roleType: "student",
    isParticipant: true,
    isExcludedFromBoard: false,
    currentLevel: i
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("manual-adjust-v1 template", () => {
  test("MANUAL_ADJUST_TEMPLATE_ID is 'manual-adjust-v1'", () => {
    expect(MANUAL_ADJUST_TEMPLATE_ID).toBe("manual-adjust-v1");
  });

  test("header shows ⚙️ 手动调分 with grey template", () => {
    const card = buildManualAdjustCard({ members: [makeMember(1)] });
    const json = JSON.stringify(card);
    expect(json).toContain("⚙️ 手动调分");
    expect(json).toContain("grey");
  });

  test("confirm button payload contains action=manual_adjust_confirm with all fields", () => {
    const card = buildManualAdjustCard({
      members: [makeMember(1)],
      selectedMemberId: "m-1",
      selectedItemCode: "K3",
      delta: 5,
      note: "测试备注"
    });
    const json = JSON.stringify(card);

    expect(json).toContain("manual_adjust_confirm");
    expect(json).toContain('"memberId":"m-1"');
    expect(json).toContain('"itemCode":"K3"');
    expect(json).toContain('"delta":5');
    expect(json).toContain("测试备注");
  });

  test("member selector lists all provided members", () => {
    const members = [makeMember(1), makeMember(2), makeMember(3)];
    const card = buildManualAdjustCard({ members });
    const json = JSON.stringify(card);

    for (const m of members) {
      expect(json).toContain(m.id);
      expect(json).toContain(m.displayName);
    }
  });

  test("30 members full card stays under CARD_SIZE_BUDGET_BYTES", () => {
    const members = Array.from({ length: 30 }, (_, i) => makeMember(i + 1));
    const card = buildManualAdjustCard({ members });
    expect(() => assertCardSize(card)).not.toThrow();
    const size = Buffer.byteLength(JSON.stringify(card), "utf8");
    expect(size).toBeLessThan(CARD_SIZE_BUDGET_BYTES);
  });
});
