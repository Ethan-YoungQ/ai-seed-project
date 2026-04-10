import { describe, expect, test } from "vitest";

import {
  buildReviewQueueCard,
  REVIEW_QUEUE_TEMPLATE_ID
} from "../../../../../src/services/feishu/cards/templates/review-queue-v1.js";
import {
  assertCardSize,
  CARD_SIZE_BUDGET_BYTES
} from "../../../../../src/services/feishu/cards/renderer.js";
import type {
  ReviewQueueState,
  ReviewQueueEventRow
} from "../../../../../src/services/feishu/cards/types.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeEvent(i: number): ReviewQueueEventRow {
  return {
    eventId: `evt-${i}`,
    memberId: `m-${i}`,
    memberName: `学员${i}`,
    itemCode: "K3",
    scoreDelta: 3,
    textExcerpt: `这是第 ${i} 条提交内容摘要`,
    llmReason: `理由 ${i}: 内容不够详细`,
    createdAt: "2026-04-10T12:00:00.000Z"
  };
}

function makeState(
  events: ReviewQueueEventRow[],
  page = 1,
  totalPages = 1,
  totalEvents = events.length
): ReviewQueueState {
  return { currentPage: page, totalPages, totalEvents, events };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("review-queue-v1 template", () => {
  test("REVIEW_QUEUE_TEMPLATE_ID is 'review-queue-v1'", () => {
    expect(REVIEW_QUEUE_TEMPLATE_ID).toBe("review-queue-v1");
  });

  test("header shows orange template and 复核队列 title", () => {
    const state = makeState([makeEvent(1)]);
    const card = buildReviewQueueCard(state);
    const json = JSON.stringify(card);
    expect(json).toContain("🔍 复核队列");
    expect(json).toContain("orange");
  });

  test("event rows show memberName, itemCode, scoreDelta, approve and reject buttons", () => {
    const event = makeEvent(1);
    const state = makeState([event]);
    const card = buildReviewQueueCard(state);
    const json = JSON.stringify(card);

    expect(json).toContain(event.memberName);
    expect(json).toContain(event.itemCode);
    expect(json).toContain("review_approve");
    expect(json).toContain("review_reject");
    expect(json).toContain(event.eventId);
  });

  test("approve button payload has action=review_approve with correct eventId", () => {
    const event = makeEvent(42);
    const state = makeState([event]);
    const card = buildReviewQueueCard(state);

    const elements = card.body.elements;
    const actionBlock = elements.find(
      (el) =>
        el.tag === "action" &&
        Array.isArray(el.actions) &&
        (el.actions as Array<Record<string, unknown>>).some(
          (a) =>
            typeof a.value === "object" &&
            a.value !== null &&
            (a.value as Record<string, unknown>).action === "review_approve"
        )
    );
    expect(actionBlock).toBeDefined();
    const approveBtn = (actionBlock!.actions as Array<Record<string, unknown>>).find(
      (a) =>
        typeof a.value === "object" &&
        (a.value as Record<string, unknown>).action === "review_approve"
    );
    expect((approveBtn!.value as Record<string, unknown>).eventId).toBe(event.eventId);
  });

  test("pagination prev/next buttons appear when totalPages > 1", () => {
    const events = [makeEvent(1)];
    const state = makeState(events, 2, 3, 25);
    const card = buildReviewQueueCard(state);
    const json = JSON.stringify(card);

    expect(json).toContain("review_page");
    expect(json).toContain("上一页");
    expect(json).toContain("下一页");
  });

  test("empty queue shows 暂无待审核事件 message without action buttons", () => {
    const state = makeState([], 1, 1, 0);
    const card = buildReviewQueueCard(state);
    const json = JSON.stringify(card);

    expect(json).toContain("暂无待审核事件");
    expect(json).not.toContain("review_approve");
    expect(json).not.toContain("review_reject");
  });

  test("10-event full page stays under CARD_SIZE_BUDGET_BYTES", () => {
    const events = Array.from({ length: 10 }, (_, i) => ({
      eventId: `evt-${i}`,
      memberId: `m-${i}`,
      memberName: `学员${i + 1}号选手`,
      itemCode: "K3",
      scoreDelta: 3,
      textExcerpt: "这是一段足够长的提交摘要内容用于测试卡片大小限制是否合理",
      llmReason: "内容不够详细,缺乏具体案例说明和分析思路",
      createdAt: "2026-04-10T12:00:00.000Z"
    }));
    const state = makeState(events, 1, 3, 28);
    const card = buildReviewQueueCard(state);

    expect(() => assertCardSize(card)).not.toThrow();
    const size = Buffer.byteLength(JSON.stringify(card), "utf8");
    expect(size).toBeLessThan(CARD_SIZE_BUDGET_BYTES);
  });
});
