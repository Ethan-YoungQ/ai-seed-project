export interface LevelConfig {
  level: number;
  name: string;
  color: string;
  emoji: string;
}

export const LEVEL_CONFIGS: readonly LevelConfig[] = [
  { level: 1, name: "AI 潜力股", color: "#6b7280", emoji: "🌱" },
  { level: 2, name: "AI 研究员", color: "#22c55e", emoji: "🔬" },
  { level: 3, name: "AI 操盘手", color: "#3b82f6", emoji: "🎯" },
  { level: 4, name: "AI 智慧顾问", color: "#a855f7", emoji: "🧠" },
  { level: 5, name: "AI 奇点玩家", color: "#f59e0b", emoji: "⚡" },
] as const;

export function getLevelConfig(level: number): LevelConfig {
  return LEVEL_CONFIGS.find((c) => c.level === level) ?? LEVEL_CONFIGS[0];
}

export function getPromotionDirection(from: number, to: number): "promoted" | "demoted" | "held" {
  if (to > from) return "promoted";
  if (to < from) return "demoted";
  return "held";
}
// synced with rules doc v1.1
