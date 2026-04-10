export type DimensionKey = "K" | "H" | "C" | "S" | "G";

export const DIMENSION_COLORS: Record<DimensionKey, string> = {
  K: "#00ff88", H: "#ff6b35", C: "#a855f7", S: "#06b6d4", G: "#fbbf24",
};

export const DIMENSION_LABELS: Record<DimensionKey, string> = {
  K: "知识", H: "实操", C: "创造力", S: "社交", G: "成长",
};

export function getDimensionColor(dim: DimensionKey): string {
  return DIMENSION_COLORS[dim];
}
