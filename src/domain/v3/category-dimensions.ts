import type { AiBootScoreCategory } from "./ai-boot-types.js";

export type AiBootScoreDimension = "K" | "H" | "C" | "S" | "G";
export type AiBootScoreDimensions = Record<AiBootScoreDimension, number>;

export const ZERO_AI_BOOT_SCORE_DIMENSIONS: AiBootScoreDimensions = {
  K: 0,
  H: 0,
  C: 0,
  S: 0,
  G: 0,
};

export const AI_BOOT_V3_CATEGORY_DIMENSION: Record<AiBootScoreCategory, AiBootScoreDimension> = {
  daily_participation: "K",
  formal_task: "H",
  ai_artifact: "C",
  prompt_or_method: "C",
  peer_help: "S",
  ai_practice_reflection: "G",
  resource_recommendation: "G",
  operator_adjustment: "K",
};

export function resolveAiBootV3CategoryDimension(category: string): AiBootScoreDimension {
  return AI_BOOT_V3_CATEGORY_DIMENSION[category as AiBootScoreCategory] ?? "K";
}

export function emptyAiBootScoreDimensions(): AiBootScoreDimensions {
  return { ...ZERO_AI_BOOT_SCORE_DIMENSIONS };
}

export function parseAiBootScoreDimensions(json: string | null | undefined): AiBootScoreDimensions {
  if (!json) {
    return emptyAiBootScoreDimensions();
  }

  try {
    const parsed = JSON.parse(json) as Partial<Record<AiBootScoreDimension, unknown>>;
    return {
      K: Number(parsed.K ?? 0),
      H: Number(parsed.H ?? 0),
      C: Number(parsed.C ?? 0),
      S: Number(parsed.S ?? 0),
      G: Number(parsed.G ?? 0),
    };
  } catch {
    return emptyAiBootScoreDimensions();
  }
}

export function addAiBootScoreDimensions(
  left: AiBootScoreDimensions,
  right: AiBootScoreDimensions,
): AiBootScoreDimensions {
  return {
    K: left.K + right.K,
    H: left.H + right.H,
    C: left.C + right.C,
    S: left.S + right.S,
    G: left.G + right.G,
  };
}
