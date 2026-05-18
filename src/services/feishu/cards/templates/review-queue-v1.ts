/**
 * Card template for the operator review queue (#15).
 *
 * Renders a paginated list of review_required events with approve/reject
 * buttons per row. Orange header, up to 10 rows per page, prev/next
 * pagination controls.
 *
 * Schema 2.0 note: button rows use column_set, not the deprecated "action" tag.
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

function buttonColumn(button: Record<string, unknown>): Record<string, unknown> {
  return {
    tag: "column",
    width: "weighted",
    weight: 1,
    vertical_align: "center",
    elements: [button],
  };
}

function buttonRow(buttons: Array<Record<string, unknown>>): Record<string, unknown> {
  return {
    tag: "column_set",
    flex_mode: "none",
    background_style: "default",
    columns: buttons.map(buttonColumn),
  };
}

function actionName(base: string, sequence: string | number, suffix?: string | number): string {
  const safeSuffix = String(suffix)
    .replace(/[^A-Za-z0-9_]/g, "_")
    .slice(0, 64);
  return suffix === undefined
    ? `${base}_${sequence}`
    : `${base}_${sequence}_${safeSuffix}`;
}

function buildEventRow(event: ReviewQueueEventRow, rowIndex: number): Array<Record<string, unknown>> {
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
    buttonRow([
      {
        tag: "button",
        name: actionName("review_approve", rowIndex, event.eventId),
        text: { tag: "plain_text", content: "✅ 通过" },
        type: "primary",
        value: { action: "review_approve", eventId: event.eventId, engine: event.engine ?? "v2" }
      },
      {
        tag: "button",
        name: actionName("review_reject", rowIndex, event.eventId),
        text: { tag: "plain_text", content: "❌ 拒绝" },
        type: "danger",
        value: { action: "review_reject", eventId: event.eventId, engine: event.engine ?? "v2" }
      }
    ])
  ];
}

function buildPaginationRow(
  currentPage: number,
  totalPages: number
): Record<string, unknown> | null {
  if (totalPages <= 1) return null;

  const buttons: Array<Record<string, unknown>> = [];

  if (currentPage > 1) {
    buttons.push({
      tag: "button",
      name: actionName("review_page_prev", currentPage - 1),
      text: { tag: "plain_text", content: "◀ 上一页" },
      type: "default",
      value: { action: "review_page", page: currentPage - 1 }
    });
  }

  buttons.push({
    tag: "button",
    name: actionName("review_page_current", currentPage),
    text: {
      tag: "plain_text",
      content: `第 ${currentPage} / ${totalPages} 页`
    },
    type: "default",
    value: { action: "review_page", page: currentPage }
  });

  if (currentPage < totalPages) {
    buttons.push({
      tag: "button",
      name: actionName("review_page_next", currentPage + 1),
      text: { tag: "plain_text", content: "下一页 ▶" },
      type: "default",
      value: { action: "review_page", page: currentPage + 1 }
    });
  }

  return buttonRow(buttons);
}

// ============================================================================
// Card builder
// ============================================================================

export function buildReviewQueueCard(state: ReviewQueueState): FeishuCardJson {
  const header = buildHeader({
    title: "🔍 复核队列",
    subtitle: `真实审核，点击生效 · 共 ${state.totalEvents} 条待审核`,
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
      const rows = buildEventRow(state.events[i], i);
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
