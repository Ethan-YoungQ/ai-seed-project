/**
 * Handler for the Admin Control Panel card.
 *
 * Actions:
 *   admin_panel_open_period  — open a new scoring period (1-12)
 *   admin_panel_open_window  — open a scoring window (W1-W5 / FINAL)
 *   admin_panel_graduation   — trigger graduation settlement
 *   admin_panel_refresh      — reload current status and rebuild the card
 *
 * Requires operator or trainer role.
 */

import type {
  AdminPanelState,
} from "../templates/admin-panel-v1.js";
import type {
  CardActionContext,
  CardActionResult,
  CardHandler,
  CardHandlerDeps,
} from "../types.js";

// ============================================================================
// Extended deps — period/window lifecycle injected separately
// ============================================================================

/**
 * Lifecycle functions that the admin panel handler needs.
 * These are injected at registration time via a closure.
 */
export interface AdminPanelLifecycleDeps {
  openNewPeriod(
    number: number
  ): Promise<{
    periodId: string;
    assignedWindowId: string | null;
    shouldSettleWindowId: string | null;
  }>;
  openWindow(
    code: string
  ): Promise<{ windowId: string; created: boolean }>;
  closeGraduation(): Promise<{
    ok: boolean;
    reason?: string;
    shouldSettleWindowId?: string;
  }>;
  getActivePeriod(): Promise<{
    number: number;
    startedAt: string;
  } | null>;
  getActiveWindow(): Promise<{
    code: string;
    settlementState: "open" | "settling" | "settled";
  } | null>;
  countMembers(): Promise<{ total: number; activeStudents: number }>;
}

// ============================================================================
// Helpers
// ============================================================================

function requireAdmin(
  deps: CardHandlerDeps,
  openId: string
): CardActionResult | null {
  const member = deps.repo.findMemberByOpenId(openId);
  if (!member) {
    return {
      toast: { type: "error", content: "未找到对应成员，请联系管理员" },
    };
  }
  if (member.roleType !== "operator" && member.roleType !== "trainer") {
    return {
      toast: { type: "error", content: "仅运营人员或培训师可执行此操作" },
    };
  }
  return null;
}

async function buildCurrentState(
  lifecycle: AdminPanelLifecycleDeps,
  deps: CardHandlerDeps,
  overrides?: Partial<AdminPanelState>
): Promise<AdminPanelState> {
  const [activePeriod, activeWindow, memberCounts, pendingReviewCount] =
    await Promise.all([
      lifecycle.getActivePeriod(),
      lifecycle.getActiveWindow(),
      lifecycle.countMembers(),
      deps.repo.countReviewRequiredEvents(),
    ]);

  return {
    activePeriod,
    activeWindow,
    stats: {
      totalMembers: memberCounts.total,
      activeStudents: memberCounts.activeStudents,
      pendingReviewCount,
    },
    ...overrides,
  };
}

// ============================================================================
// Handler factory — creates all handlers with lifecycle deps bound
// ============================================================================

export interface AdminPanelHandlers {
  openPeriod: CardHandler;
  openWindow: CardHandler;
  graduation: CardHandler;
  refresh: CardHandler;
}

export function createAdminPanelHandlers(
  lifecycle: AdminPanelLifecycleDeps
): AdminPanelHandlers {
  // ---------- Open Period ----------
  const openPeriod: CardHandler = async (
    ctx: CardActionContext,
    deps: CardHandlerDeps
  ): Promise<CardActionResult> => {
    const denied = requireAdmin(deps, ctx.operatorOpenId);
    if (denied) return denied;

    const periodNumber = extractSelectedValue(ctx, "admin_panel_select_period");
    if (periodNumber === null) {
      return {
        toast: { type: "error", content: "请先在下拉菜单中选择周期编号" },
      };
    }

    const num = Number(periodNumber);
    if (!Number.isInteger(num) || num < 1 || num > 12) {
      return {
        toast: { type: "error", content: "周期编号必须是 1-12 之间的整数" },
      };
    }

    try {
      const result = await lifecycle.openNewPeriod(num);
      const settleMsg = result.shouldSettleWindowId
        ? `，触发窗口结算（${result.shouldSettleWindowId}）`
        : "";

      // WS long connection: card update responses cause 200672.
      // Return toast instead. User can send "管理" to see updated state.
      return {
        toast: { type: "success", content: `✅ 第 ${num} 期已开启${settleMsg}` },
      };
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "开期失败，请联系技术支持";
      return {
        toast: { type: "error", content: msg },
      };
    }
  };

  // ---------- Open Window ----------
  const openWindow: CardHandler = async (
    ctx: CardActionContext,
    deps: CardHandlerDeps
  ): Promise<CardActionResult> => {
    const denied = requireAdmin(deps, ctx.operatorOpenId);
    if (denied) return denied;

    const windowCode = extractSelectedValue(ctx, "admin_panel_select_window");
    if (!windowCode) {
      return {
        toast: { type: "error", content: "请先在下拉菜单中选择窗口编号" },
      };
    }

    const validCodes = ["W1", "W2", "W3", "W4", "W5", "FINAL"];
    if (!validCodes.includes(windowCode)) {
      return {
        toast: { type: "error", content: `无效的窗口代码: ${windowCode}` },
      };
    }

    try {
      const result = await lifecycle.openWindow(windowCode);
      const verb = result.created ? "已创建" : "已存在";

      return {
        toast: { type: "success", content: `✅ 窗口 ${windowCode} ${verb}` },
      };
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "开窗失败，请联系技术支持";
      return {
        toast: { type: "error", content: msg },
      };
    }
  };

  // ---------- Graduation ----------
  const graduation: CardHandler = async (
    ctx: CardActionContext,
    deps: CardHandlerDeps
  ): Promise<CardActionResult> => {
    const denied = requireAdmin(deps, ctx.operatorOpenId);
    if (denied) return denied;

    try {
      const result = await lifecycle.closeGraduation();
      if (!result.ok) {
        return {
          toast: { type: "error", content: `毕业结算失败：${result.reason ?? "未知原因"}` },
        };
      }

      const settleMsg = result.shouldSettleWindowId
        ? `，FINAL 窗口（${result.shouldSettleWindowId}）进入结算`
        : "";

      return {
        toast: { type: "success", content: `✅ 毕业结算已触发${settleMsg}` },
      };
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : "毕业结算失败，请联系技术支持";
      return {
        toast: { type: "error", content: msg },
      };
    }
  };

  // ---------- Refresh ----------
  const refresh: CardHandler = async (
    ctx: CardActionContext,
    deps: CardHandlerDeps
  ): Promise<CardActionResult> => {
    const denied = requireAdmin(deps, ctx.operatorOpenId);
    if (denied) return denied;

    const state = await buildCurrentState(lifecycle, deps);
    const periodText = state.activePeriod
      ? `第${state.activePeriod.number}期`
      : "无";
    const windowText = state.activeWindow?.code ?? "无";

    return {
      toast: {
        type: "info",
        content: `周期:${periodText} | 窗口:${windowText} | 学员:${state.stats.activeStudents}/${state.stats.totalMembers} | 待审:${state.stats.pendingReviewCount}`,
      },
    };
  };

  return { openPeriod, openWindow, graduation, refresh };
}

// ============================================================================
// Utility: extract value from Feishu form_value or action payload
// ============================================================================

/**
 * Feishu cards send select_static values via `form_value` when inside
 * an action group, or as part of `actionPayload` when triggered by
 * the button's embedded value object. This helper checks both paths.
 */
function extractSelectedValue(
  ctx: CardActionContext,
  selectActionKey: string
): string | null {
  // Path 1: form_value from the Feishu card callback
  const formValue = ctx.actionPayload["form_value"] as
    | Record<string, unknown>
    | undefined;
  if (formValue && typeof formValue[selectActionKey] === "string") {
    return formValue[selectActionKey] as string;
  }

  // Path 2: directly in actionPayload (when button embeds all values)
  if (typeof ctx.actionPayload[selectActionKey] === "string") {
    return ctx.actionPayload[selectActionKey] as string;
  }

  // Path 3: nested in value object within actionPayload
  const valueObj = ctx.actionPayload["value"] as
    | Record<string, unknown>
    | undefined;
  if (valueObj && typeof valueObj[selectActionKey] === "string") {
    return valueObj[selectActionKey] as string;
  }

  return null;
}
