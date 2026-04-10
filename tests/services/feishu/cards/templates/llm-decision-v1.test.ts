import { beforeEach, describe, expect, test } from "vitest";

import {
  buildLlmDecisionCard,
  LLM_DECISION_TEMPLATE_ID,
  type LlmDecisionCardState
} from "../../../../../src/services/feishu/cards/templates/llm-decision-v1.js";
import {
  registerTemplate,
  clearTemplateRegistry
} from "../../../../../src/services/feishu/cards/renderer.js";
import type { CardActionContext } from "../../../../../src/services/feishu/cards/types.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fakeCtx(): CardActionContext {
  return {
    operatorOpenId: "system",
    triggerId: "patch-worker",
    actionName: "server_patch",
    actionPayload: {},
    messageId: "om-1",
    chatId: "oc-dm",
    receivedAt: "2026-04-10T12:00:00.000Z",
    currentVersion: LLM_DECISION_TEMPLATE_ID
  };
}

function approvedState(): LlmDecisionCardState {
  return {
    eventId: "evt-1",
    memberId: "m-alice",
    memberName: "Alice",
    itemCode: "K3",
    decision: "approved",
    score: 3,
    reason: "Great summary of the topic.",
    decidedAt: "2026-04-10T12:00:00.000Z"
  };
}

function rejectedState(): LlmDecisionCardState {
  return {
    eventId: "evt-2",
    memberId: "m-bob",
    memberName: "Bob",
    itemCode: "K4",
    decision: "rejected",
    score: 0,
    reason: "Submission too short.",
    decidedAt: "2026-04-10T12:00:00.000Z"
  };
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  clearTemplateRegistry();
  registerTemplate(LLM_DECISION_TEMPLATE_ID, buildLlmDecisionCard);
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("buildLlmDecisionCard", () => {
  test("approved state uses green header template", () => {
    const card = buildLlmDecisionCard(approvedState(), fakeCtx());
    expect(card.schema).toBe("2.0");
    const header = card.header as Record<string, unknown>;
    expect(header.template).toBe("green");
  });

  test("approved state header title contains +score and 通过", () => {
    const card = buildLlmDecisionCard(approvedState(), fakeCtx());
    const header = card.header as Record<string, unknown>;
    const title = header.title as Record<string, unknown>;
    expect(String(title.content)).toContain("+3");
    expect(String(title.content)).toContain("通过");
  });

  test("rejected state uses red header template", () => {
    const card = buildLlmDecisionCard(rejectedState(), fakeCtx());
    const header = card.header as Record<string, unknown>;
    expect(header.template).toBe("red");
  });

  test("rejected state header title contains 未通过", () => {
    const card = buildLlmDecisionCard(rejectedState(), fakeCtx());
    const header = card.header as Record<string, unknown>;
    const title = header.title as Record<string, unknown>;
    expect(String(title.content)).toContain("未通过");
  });

  test("rejected state body includes appeal button with correct payload", () => {
    const state = rejectedState();
    const card = buildLlmDecisionCard(state, fakeCtx());
    const elements = card.body.elements;
    const cardStr = JSON.stringify(elements);
    expect(cardStr).toContain("llm_decision_appeal");
    expect(cardStr).toContain(state.eventId);
    expect(cardStr).toContain("我要申诉");
  });

  test("approved state body does NOT include appeal button", () => {
    const card = buildLlmDecisionCard(approvedState(), fakeCtx());
    const elements = card.body.elements;
    const cardStr = JSON.stringify(elements);
    expect(cardStr).not.toContain("llm_decision_appeal");
    expect(cardStr).not.toContain("我要申诉");
  });

  test("body includes member name and item code", () => {
    const state = approvedState();
    const card = buildLlmDecisionCard(state, fakeCtx());
    const bodyStr = JSON.stringify(card.body);
    expect(bodyStr).toContain(state.memberName);
    expect(bodyStr).toContain(state.itemCode);
  });

  test("body includes the reason text", () => {
    const state = rejectedState();
    const card = buildLlmDecisionCard(state, fakeCtx());
    const bodyStr = JSON.stringify(card.body);
    expect(bodyStr).toContain(state.reason);
  });
});
