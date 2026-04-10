import { CSSProperties } from "react";
import { HpBar } from "../ui/HpBar";
import type { DimensionKey } from "../../lib/colors";
import { getDimensionColor, DIMENSION_LABELS } from "../../lib/colors";

const DIMENSION_ICONS: Record<DimensionKey, string> = {
  K: "📚",
  H: "🔧",
  C: "✨",
  S: "🤝",
  G: "🌱",
};

interface DimensionRowProps {
  dimKey: DimensionKey;
  value: number;
  max?: number;
}

export function DimensionRow({ dimKey, value, max = 100 }: DimensionRowProps) {
  const color = getDimensionColor(dimKey);
  const label = DIMENSION_LABELS[dimKey];
  const icon = DIMENSION_ICONS[dimKey];

  const rowStyle: CSSProperties = {
    display: "grid",
    gridTemplateColumns: "80px 1fr 48px",
    alignItems: "center",
    gap: "12px",
  };

  const labelStyle: CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    fontFamily: "var(--font-mono)",
    fontSize: "11px",
    color,
    whiteSpace: "nowrap",
  };

  const iconStyle: CSSProperties = {
    fontSize: "14px",
  };

  const scoreStyle: CSSProperties = {
    fontFamily: "var(--font-mono)",
    fontSize: "12px",
    color,
    textAlign: "right",
    textShadow: `0 0 8px ${color}88`,
  };

  return (
    <div style={rowStyle}>
      <span style={labelStyle}>
        <span style={iconStyle}>{icon}</span>
        {label}
      </span>
      <HpBar value={value} max={max} color={color} />
      <span style={scoreStyle}>{value.toFixed(1)}</span>
    </div>
  );
}
