import { describe, expect, test, beforeEach } from "vitest";
import {
  buildDailyCheckinCard,
  DAILY_CHECKIN_TEMPLATE_ID,
  emptyDailyCheckinState,
  type DailyCheckinState,
  type DailyCheckinItemCode
} from "../../../../../src/services/feishu/cards/templates/daily-checkin-v1.js";
import {
  assertCardSize,
  registerTemplate,
  clearTemplateRegistry,
  renderCard,
  CARD_SIZE_BUDGET_BYTES
} from "../../../../../src/services/feishu/cards/renderer.js";
import type { CardActionContext } from "../../../../../src/services/feishu/cards/types.js";

const ITEM_CODES: DailyCheckinItemCode[] = ["K3", "K4", "H2", "C1", "C3", "G2"];

function fakeCtx(): CardActionContext {
  return {
    operatorOpenId: "ou-op",
    triggerId: "t-1",
    actionName: "unused",
    actionPayload: {},
    messageId: "om-1",
    chatId: "oc-1",
    receivedAt: "2026-04-10T09:00:00.000Z",
    currentVersion: "daily-checkin-v1"
  };
}

function fullyPopulatedState(): DailyCheckinState {
  const state = emptyDailyCheckinState({
    periodNumber: 3,
    postedAt: "2026-04-10T09:00:00.000Z",
    periodId: "p-1"
  });
  const memberIds = Array.from({ length: 14 }, (_, i) => `m-${i + 1}`);
  memberIds.forEach((id, i) => {
    state.memberDisplayNames[id] = `学员${i + 1}`;
  });
  for (const code of ITEM_CODES) {
    state.items[code].pending = memberIds.slice(0, 7);
    state.items[code].approved = memberIds.slice(7);
  }
  return state;
}

describe("daily-checkin-v1 template", () => {
  beforeEach(() => {
    clearTemplateRegistry();
  });

  test("DAILY_CHECKIN_TEMPLATE_ID is 'daily-checkin-v1'", () => {
    expect(DAILY_CHECKIN_TEMPLATE_ID).toBe("daily-checkin-v1");
  });

  test("header shows the period number", () => {
    const state = emptyDailyCheckinState({
      periodNumber: 3,
      postedAt: "2026-04-10T09:00:00.000Z",
      periodId: "p-1"
    });
    const card = buildDailyCheckinCard(state);
    const cardJson = JSON.stringify(card);
    expect(cardJson).toContain("今日打卡");
    expect(cardJson).toContain("第 3 期");
  });

  test("body contains 6 item columns", () => {
    const state = emptyDailyCheckinState({
      periodNumber: 1,
      postedAt: "2026-04-10T09:00:00.000Z",
      periodId: "p-1"
    });
    const card = buildDailyCheckinCard(state);
    const cardJson = JSON.stringify(card);
    for (const code of ITEM_CODES) {
      expect(cardJson).toContain(code);
    }
  });

  test("labels match the rules v1.1 emoji titles", () => {
    const state = emptyDailyCheckinState({
      periodNumber: 1,
      postedAt: "2026-04-10T09:00:00.000Z",
      periodId: "p-1"
    });
    const card = buildDailyCheckinCard(state);
    const cardJson = JSON.stringify(card);
    expect(cardJson).toContain("🧠 知识总结");
    expect(cardJson).toContain("🔍 AI纠错");
    expect(cardJson).toContain("🔧 实操分享");
    expect(cardJson).toContain("💡 创意用法");
    expect(cardJson).toContain("📐 提示词模板");
    expect(cardJson).toContain("🌱 课外好资源");
  });

  test("each button carries action name + itemCode", () => {
    const state = emptyDailyCheckinState({
      periodNumber: 1,
      postedAt: "2026-04-10T09:00:00.000Z",
      periodId: "p-1"
    });
    const card = buildDailyCheckinCard(state);
    const cardJson = JSON.stringify(card);
    expect(cardJson).toContain("daily_checkin_k3_submit");
    expect(cardJson).toContain("daily_checkin_k4_submit");
    expect(cardJson).toContain("daily_checkin_h2_submit");
    expect(cardJson).toContain("daily_checkin_c1_submit");
    expect(cardJson).toContain("daily_checkin_c3_submit");
    expect(cardJson).toContain("daily_checkin_g2_submit");
    // verify itemCode is also in the payload
    for (const code of ITEM_CODES) {
      expect(cardJson).toContain(`"itemCode":"${code}"`);
    }
  });

  test("approved members appear with ✓ marker", () => {
    const state = emptyDailyCheckinState({
      periodNumber: 1,
      postedAt: "2026-04-10T09:00:00.000Z",
      periodId: "p-1"
    });
    state.memberDisplayNames["ou-alice"] = "Alice";
    state.items.K3.approved = ["ou-alice"];
    const card = buildDailyCheckinCard(state);
    const cardJson = JSON.stringify(card);
    expect(cardJson).toContain("✓ Alice");
  });

  test("pending members appear with 审核中 marker", () => {
    const state = emptyDailyCheckinState({
      periodNumber: 1,
      postedAt: "2026-04-10T09:00:00.000Z",
      periodId: "p-1"
    });
    state.memberDisplayNames["ou-bob"] = "Bob";
    state.items.H2.pending = ["ou-bob"];
    const card = buildDailyCheckinCard(state);
    const cardJson = JSON.stringify(card);
    expect(cardJson).toContain("审核中 Bob");
  });

  test("14 members × 6 items full card stays under CARD_SIZE_BUDGET_BYTES", () => {
    const state = fullyPopulatedState();
    const card = buildDailyCheckinCard(state);
    const size = Buffer.byteLength(JSON.stringify(card), "utf8");
    expect(size).toBeLessThan(CARD_SIZE_BUDGET_BYTES);
    // also verify assertCardSize does not throw
    expect(() => assertCardSize(card)).not.toThrow();
  });

  test("emptyDailyCheckinState seeds all 6 item lists as empty", () => {
    const state = emptyDailyCheckinState({
      periodNumber: 5,
      postedAt: "2026-04-10T09:00:00.000Z",
      periodId: "p-5"
    });
    expect(state.periodNumber).toBe(5);
    expect(state.periodId).toBe("p-5");
    for (const code of ITEM_CODES) {
      expect(state.items[code].pending).toEqual([]);
      expect(state.items[code].approved).toEqual([]);
    }
    expect(state.memberDisplayNames).toEqual({});
  });

  test("renderCard registers and dispatches the daily-checkin template", () => {
    registerTemplate(DAILY_CHECKIN_TEMPLATE_ID, buildDailyCheckinCard);
    const state = emptyDailyCheckinState({
      periodNumber: 2,
      postedAt: "2026-04-10T09:00:00.000Z",
      periodId: "p-2"
    });
    const card = renderCard(DAILY_CHECKIN_TEMPLATE_ID, state, fakeCtx());
    expect(card.schema).toBe("2.0");
    const cardJson = JSON.stringify(card);
    expect(cardJson).toContain("今日打卡");
    expect(cardJson).toContain("第 2 期");
  });
});
