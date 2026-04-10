/**
 * Daily check-in card handlers for synchronous text submission paths.
 * Covers items K3, K4, C1, C3, G2 (H2 is deferred to Phase E — multimodal).
 *
 * Each handler follows a consistent pipeline:
 *   validate → write card_interaction → ingest → merge state → render card
 */

import {
  validateLlmSubmission,
  validateG2Submission
} from "../soft-validation.js";
import { renderCard } from "../renderer.js";
import {
  DAILY_CHECKIN_TEMPLATE_ID,
  type DailyCheckinItemCode,
  type DailyCheckinState
} from "../templates/daily-checkin-v1.js";
import type {
  CardActionContext,
  CardActionResult,
  CardHandler,
  CardHandlerDeps
} from "../types.js";

// ---------------------------------------------------------------------------
// Reason → toast content mapping
// ---------------------------------------------------------------------------

function reasonToastContent(reason: string): string {
  if (reason === "text_too_short") {
    return "描述至少 20 字,请补充内容";
  }
  if (reason === "missing_url") {
    return "请附上文章/视频的 http URL 链接";
  }
  return `提交被拒绝: ${reason}`;
}

// ---------------------------------------------------------------------------
// State merge helper (immutable)
// ---------------------------------------------------------------------------

function mergePendingMember(
  state: DailyCheckinState,
  itemCode: DailyCheckinItemCode,
  memberId: string
): DailyCheckinState {
  const item = state.items[itemCode];

  // Already in approved or pending — no change
  if (item.approved.includes(memberId) || item.pending.includes(memberId)) {
    return state;
  }

  return {
    ...state,
    items: {
      ...state.items,
      [itemCode]: {
        ...item,
        pending: [...item.pending, memberId]
      }
    }
  };
}

// ---------------------------------------------------------------------------
// Shared pipeline
// ---------------------------------------------------------------------------

async function runDailyCheckinPipeline(
  itemCode: DailyCheckinItemCode,
  actionName: string,
  ctx: CardActionContext,
  deps: CardHandlerDeps
): Promise<CardActionResult> {
  const { operatorOpenId } = ctx;

  // 1. Resolve memberId
  const member = deps.repo.findMemberByOpenId(operatorOpenId);
  if (!member) {
    return {
      toast: {
        type: "error",
        content: "未找到对应成员,请联系运营"
      }
    };
  }
  const memberId = member.id;

  // 2. Extract text from payload
  const text = String(ctx.actionPayload.text ?? "");

  // 3. Validate
  const validationResult =
    itemCode === "G2"
      ? validateG2Submission({ text })
      : validateLlmSubmission({ text });

  if (!validationResult.ok) {
    // Write rejected interaction then return error toast
    await deps.repo.insertCardInteraction({
      id: deps.uuid(),
      memberId,
      periodId: null,
      cardType: "daily_checkin",
      actionName,
      feishuMessageId: ctx.messageId,
      feishuCardVersion: ctx.currentVersion,
      payloadJson: ctx.actionPayload,
      receivedAt: ctx.receivedAt,
      triggerId: ctx.triggerId,
      operatorOpenId,
      rejectedReason: validationResult.reason
    });

    return {
      toast: {
        type: "error",
        content: reasonToastContent(validationResult.reason)
      }
    };
  }

  // 4. Write idempotent card_interaction
  await deps.repo.insertCardInteraction({
    id: deps.uuid(),
    memberId,
    periodId: null,
    cardType: "daily_checkin",
    actionName,
    feishuMessageId: ctx.messageId,
    feishuCardVersion: ctx.currentVersion,
    payloadJson: ctx.actionPayload,
    receivedAt: ctx.receivedAt,
    triggerId: ctx.triggerId,
    operatorOpenId,
    rejectedReason: null
  });

  // 5. Ingest
  await deps.ingestor.ingest({
    memberId,
    itemCode,
    sourceType: "card_interaction",
    sourceRef: deps.uuid(),
    payload: { text },
    requestedAt: ctx.receivedAt
  });

  // 6. Load active live card
  const liveRow = deps.repo.findLiveCard("daily_checkin", ctx.chatId);
  if (!liveRow) {
    return {
      toast: {
        type: "error",
        content: "未找到今日打卡卡片"
      }
    };
  }

  // 7. Merge memberId into pending (immutable update)
  const currentState = liveRow.stateJson as DailyCheckinState;
  const nextState = mergePendingMember(currentState, itemCode, memberId);

  // 8. Persist updated state
  deps.repo.updateLiveCardState(liveRow.id, nextState, ctx.receivedAt);

  // 9. Render updated card
  const newCardJson = renderCard(DAILY_CHECKIN_TEMPLATE_ID, nextState, ctx);

  return { newCardJson };
}

// ---------------------------------------------------------------------------
// Handler factory
// ---------------------------------------------------------------------------

function buildHandler(
  itemCode: DailyCheckinItemCode,
  actionName: string
): CardHandler {
  return (ctx, deps) => runDailyCheckinPipeline(itemCode, actionName, ctx, deps);
}

// ---------------------------------------------------------------------------
// Exported handlers
// ---------------------------------------------------------------------------

export const dailyCheckinK3Handler: CardHandler = buildHandler(
  "K3",
  "daily_checkin_k3_submit"
);

export const dailyCheckinK4Handler: CardHandler = buildHandler(
  "K4",
  "daily_checkin_k4_submit"
);

export const dailyCheckinC1Handler: CardHandler = buildHandler(
  "C1",
  "daily_checkin_c1_submit"
);

export const dailyCheckinC3Handler: CardHandler = buildHandler(
  "C3",
  "daily_checkin_c3_submit"
);

export const dailyCheckinG2Handler: CardHandler = buildHandler(
  "G2",
  "daily_checkin_g2_submit"
);
