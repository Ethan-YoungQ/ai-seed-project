/**
 * Card template for the Admin Control Panel.
 *
 * Renders a unified management interface for Trainer/Operator users:
 * - Current system status (active period, active window)
 * - Period management (open next period)
 * - Window management (open window)
 * - Graduation trigger
 *
 * Purple header "⚙️ 管理员面板".
 *
 * NOTE: Uses column_set instead of deprecated "action" tag for schema 2.0 compatibility.
 * Feishu card schema 2.0 does NOT support the "action" element type.
 */

import type { FeishuCardJson } from "../types.js";
import { buildHeader } from "./common/header.js";

// ============================================================================
// Public API
// ============================================================================

export const ADMIN_PANEL_TEMPLATE_ID = "admin-panel-v1" as const;

/** Window codes available for opening */
const WINDOW_CODES = ["W1", "W2", "W3", "W4", "W5", "FINAL"] as const;

/** Period numbers available (1-12) */
const PERIOD_NUMBERS = Array.from({ length: 12 }, (_, i) => i + 1);

export interface AdminPanelState {
  /** Currently active period info (null if none) */
  activePeriod: {
    number: number;
    startedAt: string;
  } | null;
  /** Currently active window info (null if none) */
  activeWindow: {
    code: string;
    settlementState: "open" | "settling" | "settled";
  } | null;
  /** Quick stats for the admin */
  stats: {
    totalMembers: number;
    activeStudents: number;
    pendingReviewCount: number;
  };
  /** Last action result message (shown after an operation) */
  lastActionMessage?: string;
  /** Last action success flag */
  lastActionSuccess?: boolean;
}

// ============================================================================
// Schema 2.0 helper: column_set row for select + button
// ============================================================================

function columnSetRow(
  selectElement: Record<string, unknown>,
  buttonElement: Record<string, unknown>
): Record<string, unknown> {
  return {
    tag: "column_set",
    flex_mode: "none",
    background_style: "default",
    columns: [
      {
        tag: "column",
        width: "weighted",
        weight: 3,
        vertical_align: "center",
        elements: [selectElement],
      },
      {
        tag: "column",
        width: "weighted",
        weight: 2,
        vertical_align: "center",
        elements: [buttonElement],
      },
    ],
  };
}

function columnSetSingleButton(
  buttonElement: Record<string, unknown>
): Record<string, unknown> {
  return {
    tag: "column_set",
    flex_mode: "none",
    background_style: "default",
    columns: [
      {
        tag: "column",
        width: "weighted",
        weight: 1,
        vertical_align: "center",
        elements: [buttonElement],
      },
    ],
  };
}

// ============================================================================
// Card builder
// ============================================================================

export function buildAdminPanelCard(state: AdminPanelState): FeishuCardJson {
  const header = buildHeader({
    title: "⚙️ 管理员面板",
    subtitle: "Trainer / Operator 专用",
    template: "purple",
  });

  const elements: Array<Record<string, unknown>> = [];

  // --- Last action feedback ---
  if (state.lastActionMessage) {
    const icon = state.lastActionSuccess ? "✅" : "❌";
    elements.push({
      tag: "markdown",
      content: `${icon} **${state.lastActionMessage}**`,
    });
    elements.push({ tag: "hr" });
  }

  // --- Current status section ---
  const periodText = state.activePeriod
    ? `第 ${state.activePeriod.number} 期${state.activePeriod.number === 1 ? "（破冰期）" : ""}`
    : "无活跃周期";

  const windowText = state.activeWindow
    ? `${state.activeWindow.code}（${formatSettlementState(state.activeWindow.settlementState)}）`
    : "无活跃窗口";

  elements.push({
    tag: "markdown",
    content: [
      "📊 **当前系统状态**",
      `> 活跃周期：${periodText}`,
      `> 活跃窗口：${windowText}`,
      `> 学员人数：${state.stats.activeStudents}/${state.stats.totalMembers}`,
      `> 待审核事件：${state.stats.pendingReviewCount} 条`,
    ].join("\n"),
  });

  elements.push({ tag: "hr" });

  // --- Period management section ---
  elements.push({
    tag: "markdown",
    content: "📅 **开启新周期**\n选择周期编号后点击按钮，系统将自动关闭上一周期。",
  });

  const periodOptions = PERIOD_NUMBERS.map((n) => ({
    text: {
      tag: "plain_text",
      content: n === 1 ? `第 ${n} 期（破冰期，不计分）` : `第 ${n} 期`,
    },
    value: String(n),
  }));

  // Use form container so button click includes the dropdown selection in form_value
  elements.push({
    tag: "form",
    name: "form_open_period",
    elements: [
      columnSetRow(
        {
          tag: "select_static",
          name: "admin_panel_select_period",
          placeholder: { tag: "plain_text", content: "选择周期编号" },
          options: periodOptions,
        },
        {
          tag: "button",
          name: "admin_panel_open_period",
          action_type: "form_submit",
          text: { tag: "plain_text", content: "🟢 开启此周期" },
          type: "primary",
        }
      ),
    ],
  });

  elements.push({ tag: "hr" });

  // --- Window management section ---
  elements.push({
    tag: "markdown",
    content: "📦 **开启评分窗口**\n每个窗口包含 2 个周期，填满后自动结算并更新段位。",
  });

  const windowOptions = WINDOW_CODES.map((code) => ({
    text: {
      tag: "plain_text",
      content:
        code === "FINAL" ? "FINAL（毕业窗口）" : `${code}`,
    },
    value: code,
  }));

  elements.push({
    tag: "form",
    name: "form_open_window",
    elements: [
      columnSetRow(
        {
          tag: "select_static",
          name: "admin_panel_select_window",
          placeholder: { tag: "plain_text", content: "选择窗口" },
          options: windowOptions,
        },
        {
          tag: "button",
          name: "admin_panel_open_window",
          action_type: "form_submit",
          text: { tag: "plain_text", content: "🟢 开启此窗口" },
          type: "primary",
        }
      ),
    ],
  });

  elements.push({ tag: "hr" });

  // --- Graduation section ---
  elements.push({
    tag: "markdown",
    content:
      "🎓 **毕业结算**\n结束最后一个周期并触发 FINAL 窗口结算。此操作不可撤销。",
  });

  elements.push(
    columnSetSingleButton({
      tag: "button",
      name: "admin_panel_graduation",
      text: { tag: "plain_text", content: "🔴 触发毕业结算" },
      type: "danger",
      value: { action: "admin_panel_graduation" },
    })
  );

  elements.push({ tag: "hr" });

  // --- Refresh button ---
  elements.push(
    columnSetSingleButton({
      tag: "button",
      name: "admin_panel_refresh",
      text: { tag: "plain_text", content: "🔄 刷新状态" },
      type: "default",
      value: { action: "admin_panel_refresh" },
    })
  );

  return {
    schema: "2.0",
    header: header as unknown as Record<string, unknown>,
    body: { elements },
  };
}

// ============================================================================
// Helpers
// ============================================================================

function formatSettlementState(
  state: "open" | "settling" | "settled"
): string {
  switch (state) {
    case "open":
      return "进行中";
    case "settling":
      return "结算中";
    case "settled":
      return "已结算";
  }
}
