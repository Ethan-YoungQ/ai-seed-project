import {
  DomainError,
  DuplicateEventError,
  IceBreakerPeriodError,
  InvalidDecisionStateError,
  InvalidLevelTransitionError,
  NoActivePeriodError,
  NoActiveWindowError,
  NotEligibleError,
  PerPeriodCapExceededError,
  WindowAlreadySettledError
} from "../../../domain/v2/errors.js";

import type {
  CardActionContext,
  CardActionResult,
  CardHandler,
  CardHandlerDeps,
  CardType
} from "./types.js";

export interface DispatchInput {
  cardType: CardType;
  actionName: string;
  payload: Record<string, unknown>;
  operatorOpenId: string;
  triggerId: string;
  messageId: string;
  chatId: string;
  receivedAt: string;
  currentVersion: string;
}

function keyOf(cardType: CardType, actionName: string): string {
  return `${cardType}::${actionName}`;
}

export class CardActionDispatcher {
  private readonly handlers = new Map<string, CardHandler>();

  constructor(private readonly deps: CardHandlerDeps) {}

  register(cardType: CardType, actionName: string, handler: CardHandler): void {
    this.handlers.set(keyOf(cardType, actionName), handler);
  }

  async dispatch(input: DispatchInput): Promise<CardActionResult> {
    const handler = this.handlers.get(keyOf(input.cardType, input.actionName));
    if (!handler) {
      return {
        toast: { type: "error", content: "unknown_action 未知操作,请刷新卡片" }
      };
    }

    const ctx: CardActionContext = {
      operatorOpenId: input.operatorOpenId,
      triggerId: input.triggerId,
      actionName: input.actionName,
      actionPayload: input.payload,
      messageId: input.messageId,
      chatId: input.chatId,
      receivedAt: input.receivedAt,
      currentVersion: input.currentVersion
    };

    try {
      const result = await handler(ctx, this.deps);
      if (!result.newCardJson && !result.toast) {
        return {
          toast: { type: "error", content: "handler 未返回响应,请联系运营" }
        };
      }
      return result;
    } catch (err) {
      return this.mapErrorToResult(err);
    }
  }

  private mapErrorToResult(err: unknown): CardActionResult {
    if (err instanceof NotEligibleError) {
      return { toast: { type: "error", content: "你不在本营学员名单" } };
    }
    if (err instanceof PerPeriodCapExceededError) {
      return { toast: { type: "info", content: "此项本期已满额,可继续提交但不计分" } };
    }
    if (err instanceof DuplicateEventError) {
      return { toast: { type: "info", content: "已记录" } };
    }
    if (err instanceof NoActivePeriodError) {
      return { toast: { type: "error", content: "期未开,请等讲师执行 /开期" } };
    }
    if (err instanceof NoActiveWindowError) {
      return { toast: { type: "error", content: "窗未开,请等讲师执行 /开窗" } };
    }
    if (err instanceof IceBreakerPeriodError) {
      return { toast: { type: "info", content: "破冰期提交保留,不计入 AQ" } };
    }
    if (err instanceof WindowAlreadySettledError) {
      return { toast: { type: "error", content: "本窗已结算,无法再次提交" } };
    }
    if (err instanceof InvalidLevelTransitionError) {
      return { toast: { type: "error", content: "段位变更非法,请联系运营" } };
    }
    if (err instanceof InvalidDecisionStateError) {
      return { toast: { type: "error", content: "此条已被其他运营处理,请刷新队列" } };
    }
    if (err instanceof DomainError) {
      return { toast: { type: "error", content: `domain_error: ${err.code}` } };
    }
    return { toast: { type: "error", content: "未知错误,请刷新卡片或联系运营" } };
  }
}
