/**
 * Card template for the operator review queue (#15).
 *
 * Renders a paginated list of review_required events with approve/reject
 * buttons per row. Orange header, up to 10 rows per page, prev/next
 * pagination controls.
 */

import type { FeishuCardJson, ReviewQueueState, ReviewQueueEventRow } from "../types.js";
import { buildHeader } from "./common/header.js";

// ============================================================================
// Public API
// ============================================================================

export const REVIEW_QUEUE_TEMPLATE_ID = "review-queue-v1" as const;

export { type ReviewQueueState };

// ============================================================================
// Internal helpers
// ============================================================================

function buildEventRow(event: ReviewQueueEventRow): Array<Record<string, unknown>> {
  const excerpt =
    event.textExcerpt.length > 40
      ? `${event.textExcerpt.slice(0, 40)}…`
      : event.textExcerpt;

  return [
    {
      tag: "markdown",
      content: [
        `**${event.memberName}** · ${event.itemCode} · ${event.scoreDelta > 0 ? "+" : ""}${event.scoreDelta}分`,
        `> ${excerpt}`,
        `LLM理由: ${event.llmReason}`
      ].join("\n")
    },
    {
      tag: "action",
      actions: [
        {
          tag: "button",
          text: { tag: "plain_text", content: "✅ 通过" },
          type: "primary",
          value: { action: "review_approve", eventId: event.eventId }
        },
        {
          tag: "button",
          text: { tag: "plain_text", content: "❌ 拒绝" },
          type: "danger",
          value: { action: "review_reject", eventId: event.eventId }
        }
      ]
    }
  ];
}

function buildPaginationRow(
  currentPage: number,
  totalPages: number
): Record<string, unknown> | null {
  if (totalPages <= 1) return null;

  const actions: Array<Record<string, unknown>> = [];

  if (currentPage > 1) {
    actions.push({
      tag: "button",
      text: { tag: "plain_text", content: "◀ 上一页" },
      type: "default",
      value: { action: "review_page", page: currentPage - 1 }
    });
  }

  actions.push({
    tag: "button",
    text: {
      tag: "plain_text",
      content: `第 ${currentPage} / ${totalPages} 页`
    },
    type: "default",
    value: { action: "review_page", page: currentPage }
  });

  if (currentPage < totalPages) {
    actions.push({
      tag: "button",
      text: { tag: "plain_text", content: "下一页 ▶" },
      type: "default",
      value: { action: "review_page", page: currentPage + 1 }
    });
  }

  return { tag: "action", actions };
}

// ============================================================================
// Card builder
// ============================================================================

export function buildReviewQueueCard(state: ReviewQueueState): FeishuCardJson {
  const header = buildHeader({
    title: "🔍 复核队列",
    subtitle: `共 ${state.totalEvents} 条待审核`,
    template: "orange"
  });

  const elements: Array<Record<string, unknown>> = [];

  if (state.events.length === 0) {
    elements.push({
      tag: "markdown",
      content: "✅ 暂无待审核事件"
    });
  } else {
    for (let i = 0; i < state.events.length; i++) {
      const rows = buildEventRow(state.events[i]);
      elements.push(...rows);
      if (i < state.events.length - 1) {
        elements.push({ tag: "hr" });
      }
    }
  }

  const pagination = buildPaginationRow(state.currentPage, state.totalPages);
  if (pagination) {
    elements.push({ tag: "hr" });
    elements.push(pagination);
  }

  return {
    schema: "2.0",
    header: header as unknown as Record<string, unknown>,
    body: { elements }
  };
}
