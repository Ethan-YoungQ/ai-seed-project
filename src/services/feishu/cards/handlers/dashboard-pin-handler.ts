/**
 * Handler for "dashboard_pin_refresh" card action.
 *
 * When a user clicks the 🔄 刷新 button on the pinned dashboard card,
 * this handler fetches fresh ranking data and returns a new card JSON
 * that the Feishu platform uses to replace the existing card in-place.
 */

import type {
  CardActionContext,
  CardActionResult,
  CardHandler,
  CardHandlerDeps,
} from "../types.js";
import {
  buildDashboardPinCard,
  DASHBOARD_PIN_TEMPLATE_ID,
  type DashboardPinState,
} from "../templates/dashboard-pin-v1.js";
import { registerTemplate } from "../renderer.js";

// 确保模板在模块加载时注册
registerTemplate(DASHBOARD_PIN_TEMPLATE_ID, buildDashboardPinCard);

/** 注入的排行数据读取器 */
export interface DashboardPinDepsExtension {
  readDashboardPinState: (chatId: string) => Promise<DashboardPinState | null>;
}

export const DASHBOARD_PIN_READER_KEY = "readDashboardPinState";

/**
 * 刷新按钮处理器 — 读取最新排行数据并返回更新后的卡片
 */
export const dashboardPinRefreshHandler: CardHandler = async (
  ctx: CardActionContext,
  deps: CardHandlerDeps,
): Promise<CardActionResult> => {
  const reader = (deps as unknown as DashboardPinDepsExtension)[
    DASHBOARD_PIN_READER_KEY
  ];

  if (typeof reader !== "function") {
    return {
      toast: { type: "error", content: "看板数据读取器未配置" },
    };
  }

  const state = await reader(ctx.chatId);
  if (!state) {
    return {
      toast: { type: "error", content: "暂无看板数据" },
    };
  }

  const newCardJson = buildDashboardPinCard(state);
  return { newCardJson };
};
