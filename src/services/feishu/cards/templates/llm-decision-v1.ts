/**
 * Card template for individual LLM decision DM notifications.
 *
 * Approved decisions: green header "+score 通过", no appeal button.
 * Rejected decisions: red header "未通过", body includes "我要申诉" button.
 */

import type { FeishuCardJson, CardActionContext } from "../types.js";
import { buildHeader } from "./common/header.js";

// ============================================================================
// Public API
// ============================================================================

export const LLM_DECISION_TEMPLATE_ID = "llm-decision-v1" as const;

export interface LlmDecisionCardState {
  eventId: string;
  memberId: string;
  memberName: string;
  itemCode: string;
  decision: "approved" | "rejected";
  score: number;
  reason: string;
  decidedAt: string;
}

// ============================================================================
// Card builder
// ============================================================================

export function buildLlmDecisionCard(
  state: LlmDecisionCardState,
  _ctx: CardActionContext
): FeishuCardJson {
  const isApproved = state.decision === "approved";

  const header = buildHeader({
    title: isApproved
      ? `+${state.score} 通过 · ${state.itemCode}`
      : `未通过 · ${state.itemCode}`,
    template: isApproved ? "green" : "red"
  });

  const elements: Array<Record<string, unknown>> = [
    {
      tag: "markdown",
      content: [
        `**成员：** ${state.memberName}`,
        `**项目：** ${state.itemCode}`,
        `**结果：** ${isApproved ? "✅ 通过" : "❌ 未通过"}`,
        isApproved ? `**得分：** +${state.score}` : null,
        `**理由：** ${state.reason}`
      ]
        .filter(Boolean)
        .join("\n")
    }
  ];

  if (!isApproved) {
    elements.push({
      tag: "action",
      actions: [
        {
          tag: "button",
          text: { tag: "plain_text", content: "我要申诉" },
          type: "danger",
          value: { action: "llm_decision_appeal", eventId: state.eventId }
        }
      ]
    });
  }

  return {
    schema: "2.0",
    header: header as unknown as Record<string, unknown>,
    body: { elements }
  };
}
