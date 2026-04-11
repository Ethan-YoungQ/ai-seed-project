import type { SqliteRepository } from "../../../storage/sqlite-repository.js";
import type { EventIngestor, IngestInput } from "../../../domain/v2/ingestor.js";
import type { ScoringAggregator } from "../../../domain/v2/aggregator.js";
import { SCORING_ITEMS, type ScoringItemCode } from "../../../domain/v2/scoring-items-config.js";
import type {
  CardHandlerDeps,
  CardType,
  IngestRequest,
  IngestResult
} from "./types.js";

// ---------------------------------------------------------------------------
// Adapters — bridge card-handler interfaces to v2 domain services.
// Methods throw only when CALLED if not yet implemented, never at construction
// time. This satisfies the constraint that buildApp() must not throw during startup.
// ---------------------------------------------------------------------------

export function cardRepoAdapter(repo: unknown): CardHandlerDeps["repo"] {
  const r = repo as SqliteRepository;
  const notImpl = (): never => {
    throw new Error("cardRepoAdapter: method not yet implemented");
  };

  return {
    findMemberByOpenId: (openId: string) => {
      try {
        const m = r.findMemberByFeishuOpenId(openId);
        if (!m) return null;
        return {
          id: m.id,
          displayName: m.displayName || m.name || "未知",
          roleType: m.roleType as "student" | "operator" | "trainer" | "observer",
          isParticipant: m.isParticipant,
          isExcludedFromBoard: m.isExcludedFromBoard,
          currentLevel: 1,
        };
      } catch {
        return null;
      }
    },

    countReviewRequiredEvents: async () => {
      try {
        const campId = r.getDefaultCampId() ?? "default";
        return r.countReviewRequiredEvents({ campId });
      } catch {
        return 0;
      }
    },

    insertCardInteraction: async (interaction) => {
      const id = interaction.id ?? crypto.randomUUID();
      const now = new Date().toISOString();
      r.insertCardInteraction({
        id,
        memberId: interaction.memberId ?? "",
        periodId: interaction.periodId ?? "",
        cardType: interaction.cardType ?? "daily_checkin",
        actionName: interaction.actionName ?? "",
        actionPayload: interaction.payloadJson
          ? JSON.stringify(interaction.payloadJson)
          : null,
        feishuMessageId: interaction.feishuMessageId ?? null,
        feishuCardVersion: interaction.feishuCardVersion ?? null,
        receivedAt: interaction.receivedAt ?? now,
      });
      return {
        id,
        memberId: interaction.memberId ?? null,
        periodId: interaction.periodId ?? null,
        cardType: (interaction.cardType ?? "daily_checkin") as CardType,
        actionName: interaction.actionName ?? "",
        feishuMessageId: interaction.feishuMessageId ?? null,
        feishuCardVersion: interaction.feishuCardVersion ?? "v1",
        payloadJson: interaction.payloadJson ?? null,
        receivedAt: interaction.receivedAt ?? now,
        triggerId: interaction.triggerId ?? "",
        operatorOpenId: interaction.operatorOpenId ?? "",
        rejectedReason: interaction.rejectedReason ?? null,
      };
    },

    findLiveCard: (cardType: CardType, chatId: string) => {
      const row = r.findLiveCardByTypeAndChat(cardType, chatId);
      if (!row) return null;
      return {
        ...row,
        cardType: row.cardType as CardType,
        closedReason: row.closedReason as "expired" | "period_closed" | "replaced_by_new" | null,
      };
    },

    updateLiveCardState: (id: string, stateJson: unknown, patchedAt: string) => {
      r.updateLiveCardState(id, stateJson, patchedAt);
    },

    // Remaining methods are stubs — wired as handlers are implemented
    insertLiveCard: notImpl,
    closeLiveCard: notImpl,
    findEventById: notImpl,
    listReviewRequiredEvents: notImpl,
    listPriorQuizSelections: notImpl,
    insertPeerReviewVote: notImpl,
    insertReactionTrackedMessage: notImpl,
  };
}

export function ingestorAdapter(ingestorRaw: unknown): CardHandlerDeps["ingestor"] {
  const ingestor = ingestorRaw as EventIngestor | null;
  return {
    async ingest(req: IngestRequest): Promise<IngestResult> {
      if (!ingestor) {
        throw new Error("ingestorAdapter: ingestor not wired");
      }

      const itemCode = req.itemCode as ScoringItemCode;
      const config = SCORING_ITEMS[itemCode];
      const scoreDelta = req.requestedDelta ?? config?.defaultScoreDelta ?? 0;

      const input: IngestInput = {
        memberId: req.memberId,
        itemCode,
        scoreDelta,
        sourceRef: req.sourceRef,
        sourceType: req.sourceType as IngestInput["sourceType"],
        payload: req.payload,
      };

      const result = ingestor.ingest(input);

      if (result.accepted) {
        const needsLlm = config?.needsLlm ?? false;
        return {
          eventId: result.eventId,
          effectiveDelta: result.effectiveDelta,
          status: needsLlm ? "pending" : "approved",
        };
      }

      return {
        eventId: "",
        effectiveDelta: 0,
        status: "rejected",
        reason: result.reason,
      };
    },
  };
}

export function aggregatorAdapter(aggregatorRaw: unknown): CardHandlerDeps["aggregator"] {
  const aggregator = aggregatorRaw as ScoringAggregator | null;
  return {
    async applyDecision(eventId: string, decision: "approved" | "rejected") {
      if (!aggregator) {
        throw new Error("aggregatorAdapter: aggregator not wired");
      }
      // Card handlers call with (eventId, decision) — bridge to domain
      // signature (eventId, {decision, note}, {id, openId}).
      // Use a system operator identity for LLM/card-driven decisions.
      return aggregator.applyDecision(
        eventId,
        { decision },
        { id: "system", openId: "system" }
      );
    },
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
