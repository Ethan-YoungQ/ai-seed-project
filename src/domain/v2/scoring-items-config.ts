export type ScoringDimension = "K" | "H" | "C" | "S" | "G";

export type ScoringItemCode =
  | "K1" | "K2" | "K3" | "K4"
  | "H1" | "H2" | "H3"
  | "C1" | "C2" | "C3"
  | "S1" | "S2"
  | "G1" | "G2" | "G3";

export type ScoringSourceType =
  | "card_interaction"
  | "quiz_result"
  | "emoji_reaction"
  | "raw_event_aggregation"
  | "operator_manual"
  | "growth_bonus";

export interface ScoringItemConfig {
  code: ScoringItemCode;
  dimension: ScoringDimension;
  defaultScoreDelta: number;
  perPeriodCap: number;
  needsLlm: boolean;
  sourceType: ScoringSourceType;
}

export const SCORING_ITEMS: Record<ScoringItemCode, ScoringItemConfig> = {
  K1: { code: "K1", dimension: "K", defaultScoreDelta: 3,  perPeriodCap: 3,  needsLlm: false, sourceType: "card_interaction" },
  K2: { code: "K2", dimension: "K", defaultScoreDelta: 10, perPeriodCap: 10, needsLlm: false, sourceType: "quiz_result" },
  K3: { code: "K3", dimension: "K", defaultScoreDelta: 3,  perPeriodCap: 3,  needsLlm: true,  sourceType: "card_interaction" },
  K4: { code: "K4", dimension: "K", defaultScoreDelta: 4,  perPeriodCap: 4,  needsLlm: true,  sourceType: "card_interaction" },
  H1: { code: "H1", dimension: "H", defaultScoreDelta: 5,  perPeriodCap: 5,  needsLlm: false, sourceType: "card_interaction" },
  H2: { code: "H2", dimension: "H", defaultScoreDelta: 3,  perPeriodCap: 3,  needsLlm: true,  sourceType: "card_interaction" },
  H3: { code: "H3", dimension: "H", defaultScoreDelta: 2,  perPeriodCap: 2,  needsLlm: false, sourceType: "card_interaction" },
  C1: { code: "C1", dimension: "C", defaultScoreDelta: 4,  perPeriodCap: 8,  needsLlm: true,  sourceType: "card_interaction" },
  C2: { code: "C2", dimension: "C", defaultScoreDelta: 1,  perPeriodCap: 4,  needsLlm: false, sourceType: "emoji_reaction" },
  C3: { code: "C3", dimension: "C", defaultScoreDelta: 5,  perPeriodCap: 5,  needsLlm: true,  sourceType: "card_interaction" },
  S1: { code: "S1", dimension: "S", defaultScoreDelta: 3,  perPeriodCap: 6,  needsLlm: false, sourceType: "card_interaction" },
  S2: { code: "S2", dimension: "S", defaultScoreDelta: 2,  perPeriodCap: 2,  needsLlm: false, sourceType: "card_interaction" },
  G1: { code: "G1", dimension: "G", defaultScoreDelta: 5,  perPeriodCap: 5,  needsLlm: false, sourceType: "card_interaction" },
  G2: { code: "G2", dimension: "G", defaultScoreDelta: 3,  perPeriodCap: 6,  needsLlm: true,  sourceType: "card_interaction" },
  G3: { code: "G3", dimension: "G", defaultScoreDelta: 4,  perPeriodCap: 4,  needsLlm: false, sourceType: "raw_event_aggregation" }
};

export function getScoringItemConfig(code: ScoringItemCode): ScoringItemConfig {
  const cfg = SCORING_ITEMS[code];
  if (!cfg) {
    throw new Error(`unknown scoring item code: ${code}`);
  }
  return cfg;
}
