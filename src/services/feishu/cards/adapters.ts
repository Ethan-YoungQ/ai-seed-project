import type { CardHandlerDeps, CardType } from "./types.js";

// ---------------------------------------------------------------------------
// Stub adapters — methods throw only when CALLED, never at construction time.
// This satisfies the constraint that buildApp() must not throw during startup.
// TODO(Phase C+): wire real implementations once handlers exist.
// ---------------------------------------------------------------------------

export function cardRepoAdapter(_repo: unknown): CardHandlerDeps["repo"] {
  const notImpl = (): never => {
    throw new Error("cardRepoAdapter not yet implemented");
  };
  return {
    insertCardInteraction: notImpl,
    findLiveCard: notImpl,
    updateLiveCardState: notImpl,
    insertLiveCard: notImpl,
    closeLiveCard: notImpl,
    findEventById: notImpl,
    listReviewRequiredEvents: notImpl,
    countReviewRequiredEvents: notImpl,
    findMemberByOpenId: notImpl,
    listPriorQuizSelections: notImpl,
    insertPeerReviewVote: notImpl,
    insertReactionTrackedMessage: notImpl
  };
}

export function ingestorAdapter(_repo: unknown): CardHandlerDeps["ingestor"] {
  return {
    ingest: () => {
      throw new Error("ingestorAdapter not yet implemented");
    }
  };
}

export function aggregatorAdapter(_repo: unknown): CardHandlerDeps["aggregator"] {
  return {
    applyDecision: () => {
      throw new Error("aggregatorAdapter not yet implemented");
    }
  };
}

export function feishuClientAdapter(_client: unknown): CardHandlerDeps["feishuClient"] {
  return {
    patchCard: async () => {
      throw new Error("feishuClientAdapter not yet implemented");
    },
    sendCard: async () => {
      throw new Error("feishuClientAdapter not yet implemented");
    }
  };
}

export function currentVersionFor(_cardType: CardType): string {
  return "v1";
}
