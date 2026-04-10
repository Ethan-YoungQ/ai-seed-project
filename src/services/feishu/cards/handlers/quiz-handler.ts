import type {
  CardActionContext,
  CardActionResult,
  CardHandler,
  CardHandlerDeps,
  QuizSelection
} from "../types.js";
import type { QuizQuestion } from "../templates/quiz-v1.js";

/** Sentinel DI key for the quiz-set resolver injected at runtime. */
export const QUIZ_SET_RESOLVER_KEY = "quizSetResolver";

/**
 * Resolved quiz set shape returned by the resolver.
 * The handler only needs the questions list to evaluate correctness.
 */
export interface ResolvedQuizSet {
  questions: QuizQuestion[];
}

/** Extension interface added to deps at runtime to carry the quiz resolver. */
export interface QuizDepsExtension {
  [QUIZ_SET_RESOLVER_KEY]: (setCode: string) => Promise<ResolvedQuizSet | null>;
}

// ---------------------------------------------------------------------------
// quiz_select handler
// ---------------------------------------------------------------------------

/**
 * Records the student's option selection as a card_interaction row.
 * Idempotent: if the same selection was already recorded, returns an info toast.
 */
export const quizSelectHandler: CardHandler = async (
  ctx: CardActionContext,
  deps: CardHandlerDeps
): Promise<CardActionResult> => {
  const { actionPayload, operatorOpenId, triggerId, messageId, receivedAt } = ctx;
  const setCode = actionPayload["setCode"] as string | undefined;
  const questionId = actionPayload["questionId"] as string | undefined;
  const optionId = actionPayload["optionId"] as string | undefined;

  if (!setCode || !questionId || !optionId) {
    return { toast: { type: "error", content: "无效的选项数据" } };
  }

  const member = await deps.repo.findMemberByOpenId(operatorOpenId);
  if (!member) {
    return { toast: { type: "error", content: "你不在本营学员名单" } };
  }

  // Idempotency: check if this (memberId, questionId) already has a selection
  const prior = await deps.repo.listPriorQuizSelections(member.id, questionId);
  if (prior.length > 0) {
    return { toast: { type: "info", content: "already_exists 已记录本题选项" } };
  }

  await deps.repo.insertCardInteraction({
    id: deps.uuid(),
    memberId: member.id,
    periodId: null,
    cardType: "quiz",
    actionName: "quiz_select",
    feishuMessageId: messageId,
    feishuCardVersion: ctx.currentVersion,
    payloadJson: { setCode, questionId, optionId },
    receivedAt,
    triggerId,
    operatorOpenId,
    rejectedReason: null
  });

  return { toast: { type: "info", content: `已选 ${optionId.toUpperCase()}` } };
};

// ---------------------------------------------------------------------------
// quiz_submit handler
// ---------------------------------------------------------------------------

/**
 * Aggregates all prior quiz_select interactions for the student, computes
 * K1 (submit bonus = 3) and K2 (correctness bonus = round(correctRate × 10)),
 * then fires two ingest calls.
 *
 * Returns a warning toast if the student has not selected any options.
 * Returns an error toast if the quiz set cannot be resolved.
 */
export const quizSubmitHandler: CardHandler = async (
  ctx: CardActionContext,
  deps: CardHandlerDeps
): Promise<CardActionResult> => {
  const { actionPayload, operatorOpenId, triggerId, messageId, receivedAt } = ctx;
  const setCode = actionPayload["setCode"] as string | undefined;

  if (!setCode) {
    return { toast: { type: "error", content: "无效的提交数据 (setCode missing)" } };
  }

  // Resolve the quiz set definition via the injected resolver
  const resolver = (deps as unknown as QuizDepsExtension)[QUIZ_SET_RESOLVER_KEY];
  if (typeof resolver !== "function") {
    return { toast: { type: "error", content: "quiz resolver 未注入,请联系运营" } };
  }

  const quizSet = await resolver(setCode);
  if (!quizSet) {
    return { toast: { type: "error", content: `未知测验 ${setCode},请联系运营` } };
  }

  const member = await deps.repo.findMemberByOpenId(operatorOpenId);
  if (!member) {
    return { toast: { type: "error", content: "你不在本营学员名单" } };
  }

  const memberId = member.id;

  // Gather all selections (one per question) by querying each question
  const selections: QuizSelection[] = [];
  for (const question of quizSet.questions) {
    const prior = await deps.repo.listPriorQuizSelections(memberId, question.id);
    if (prior.length > 0) {
      // Take the most recent selection for this question
      selections.push(prior[prior.length - 1]);
    }
  }

  if (selections.length === 0) {
    return {
      toast: { type: "info", content: "请先选择每道题的答案再提交" }
    };
  }

  // Compute correctness rate
  const totalQuestions = quizSet.questions.length;
  let correctCount = 0;

  for (const selection of selections) {
    const question = quizSet.questions.find((q) => q.id === selection.questionId);
    if (!question) continue;
    const selectedOption = question.options.find((o) => o.id === selection.optionId);
    if (selectedOption?.isCorrect) {
      correctCount++;
    }
  }

  const correctRate = totalQuestions > 0 ? correctCount / totalQuestions : 0;

  // K1 = submit bonus (always 3)
  const k1Delta = 3;
  // K2 = correctness bonus (round(correctRate * 10))
  const k2Delta = Math.round(correctRate * 10);

  const now = deps.clock().toISOString();
  const baseRef = `quiz:${setCode}:${memberId}`;

  // Fire ingest for K1
  await deps.ingestor.ingest({
    memberId,
    itemCode: "K1",
    sourceType: "quiz_submit",
    sourceRef: `${baseRef}:k1`,
    payload: { setCode, triggerId, messageId },
    requestedDelta: k1Delta,
    requestedAt: now
  });

  // Fire ingest for K2 (only if > 0)
  if (k2Delta > 0) {
    await deps.ingestor.ingest({
      memberId,
      itemCode: "K2",
      sourceType: "quiz_submit",
      sourceRef: `${baseRef}:k2`,
      payload: { setCode, triggerId, messageId, correctCount, totalQuestions },
      requestedDelta: k2Delta,
      requestedAt: now
    });
  }

  const correctPct = Math.round(correctRate * 100);
  return {
    toast: {
      type: "success",
      content: `答题完成！正确率 ${correctPct}%，+${k1Delta} K1，+${k2Delta} K2`
    }
  };
};
