export type FactDimension = "K" | "H" | "C" | "S" | "G";

export interface ScoreFact {
  source: "v2" | "v3";
  categoryOrItem: string;
  dimension: FactDimension;
  scoreDelta: number;
  status: string;
  decidedAt: string;
  note: string;
}

export interface InteractionFact {
  type: "reaction" | "peer_help" | "peer_review" | "mention";
  actorName: string;
  targetName: string;
  scoreDelta: number;
  status: string;
  occurredAt: string;
  note: string;
}

export interface BotFactMember {
  id: string;
  displayName: string;
  roleType: string;
  isParticipant: boolean;
  isExcludedFromBoard: boolean;
  currentLevel: number;
}

export interface BotFactLevelStatus {
  memberName: string;
  rank: number | null;
  currentLevel: number;
  currentLevelName: string;
  nextLevel: number | null;
  nextLevelName: string | null;
  totalScore: number;
  dimensions: Record<FactDimension, number>;
}

export interface BotFactServiceRepo {
  findMemberByOpenId(openId: string): BotFactMember | null;
  getLevelStatus(memberId: string): BotFactLevelStatus | null;
  listRecentScoreFacts(memberId: string, limit: number): ScoreFact[];
  listInteractionFacts(memberId: string, limit: number): InteractionFact[];
}

export type OperationalFacts =
  | {
      kind: "missing_member";
      openId: string;
      question: string;
    }
  | {
      kind: "missing_status";
      openId: string;
      question: string;
      member: BotFactMember;
    }
  | {
      kind: "found";
      openId: string;
      question: string;
      member: BotFactMember;
      status: BotFactLevelStatus;
      scoreFacts: ScoreFact[];
      interactionFacts: InteractionFact[];
    };

export interface BotFactService {
  getOperationalFacts(input: {
    openId: string;
    question: string;
  }): Promise<OperationalFacts>;
}

export function createBotFactService(input: { repo: BotFactServiceRepo }): BotFactService {
  const { repo } = input;
  return {
    async getOperationalFacts(args): Promise<OperationalFacts> {
      const member = repo.findMemberByOpenId(args.openId);
      if (!member) {
        return {
          kind: "missing_member",
          openId: args.openId,
          question: args.question,
        };
      }

      const status = repo.getLevelStatus(member.id);
      if (!status) {
        return {
          kind: "missing_status",
          openId: args.openId,
          question: args.question,
          member,
        };
      }

      return {
        kind: "found",
        openId: args.openId,
        question: args.question,
        member,
        status,
        scoreFacts: repo.listRecentScoreFacts(member.id, 10),
        interactionFacts: repo.listInteractionFacts(member.id, 10),
      };
    },
  };
}
