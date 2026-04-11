/**
 * Badge system configuration and type definitions.
 * Defines period badges (B1-B3) and final badges (F1-F4).
 */
import type { DimensionKey } from "./colors";

export interface BadgeConfig {
  id: string;
  name: string;
  emoji: string;
  category: "period" | "final";
  /** 简短描述，用于 tooltip */
  description: string;
}

export interface EarnedBadge {
  badgeId: string;
  periodNumber: number;
}

/**
 * B3 维度轮换表：P2 起按 K->H->C->S->G 循环
 */
export const B3_ROTATION_ORDER: readonly DimensionKey[] = [
  "K", "H", "C", "S", "G",
] as const;

/**
 * 根据期数获取 B3 轮换维度。P2 起生效，P1/P12 不颁发。
 */
export function getB3DimensionForPeriod(period: number): DimensionKey | null {
  if (period < 2 || period > 11) return null;
  const idx = (period - 2) % B3_ROTATION_ORDER.length;
  return B3_ROTATION_ORDER[idx];
}

/**
 * B3 维度达人的名称映射
 */
const B3_DIMENSION_NAMES: Record<DimensionKey, { name: string; emoji: string }> = {
  K: { name: "知识达人", emoji: "\u{1F9E0}" },
  H: { name: "实操达人", emoji: "\u{1F527}" },
  C: { name: "创意达人", emoji: "\u{1F4A1}" },
  S: { name: "社交达人", emoji: "\u{1F91D}" },
  G: { name: "成长达人", emoji: "\u{1F331}" },
};

/**
 * 所有固定 badge 配置
 */
export const BADGE_CONFIGS: Record<string, BadgeConfig> = {
  "b1-mvp": {
    id: "b1-mvp",
    name: "本期MVP",
    emoji: "\u{1F3C5}",
    category: "period",
    description: "本期 AQ 总分最高",
  },
  "b2-breakthrough": {
    id: "b2-breakthrough",
    name: "突破之星",
    emoji: "\u{1F4C8}",
    category: "period",
    description: "本期 AQ 增长最大",
  },
  "b3-K": {
    id: "b3-K",
    name: "知识达人",
    emoji: "\u{1F9E0}",
    category: "period",
    description: "K 维度得分最高",
  },
  "b3-H": {
    id: "b3-H",
    name: "实操达人",
    emoji: "\u{1F527}",
    category: "period",
    description: "H 维度得分最高",
  },
  "b3-C": {
    id: "b3-C",
    name: "创意达人",
    emoji: "\u{1F4A1}",
    category: "period",
    description: "C 维度得分最高",
  },
  "b3-S": {
    id: "b3-S",
    name: "社交达人",
    emoji: "\u{1F91D}",
    category: "period",
    description: "S 维度得分最高",
  },
  "b3-G": {
    id: "b3-G",
    name: "成长达人",
    emoji: "\u{1F331}",
    category: "period",
    description: "G 维度得分最高",
  },
  "f1-king": {
    id: "f1-king",
    name: "全能王者",
    emoji: "\u{1F451}",
    category: "final",
    description: "累计 AQ 总分最高",
  },
  "f2-progress": {
    id: "f2-progress",
    name: "进步之星",
    emoji: "\u{1F680}",
    category: "final",
    description: "全程 AQ 增长幅度最大",
  },
  "f3-popular": {
    id: "f3-popular",
    name: "最佳人气",
    emoji: "\u{2764}\u{FE0F}",
    category: "final",
    description: "S 社交力累计最高",
  },
  "f4-innovation": {
    id: "f4-innovation",
    name: "创新先锋",
    emoji: "\u{1F48E}",
    category: "final",
    description: "C 创造力累计最高",
  },
};

/**
 * 根据 badgeId 获取 badge 配置
 */
export function getBadgeConfig(badgeId: string): BadgeConfig | null {
  if (BADGE_CONFIGS[badgeId]) return BADGE_CONFIGS[badgeId];
  // B3 动态兜底：从维度名称映射生成
  const b3Match = badgeId.match(/^b3-([KHCSG])$/);
  if (b3Match) {
    const dim = b3Match[1] as DimensionKey;
    const info = B3_DIMENSION_NAMES[dim];
    if (info) {
      return {
        id: badgeId,
        name: info.name,
        emoji: info.emoji,
        category: "period",
        description: `${dim} 维度得分最高`,
      };
    }
  }
  return null;
}
