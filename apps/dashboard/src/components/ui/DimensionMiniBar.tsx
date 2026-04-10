import { CSSProperties } from "react";
import type { DimensionKey } from "../../lib/colors";
import { DIMENSION_COLORS } from "../../lib/colors";

interface DimensionMiniBarProps {
  dimensions: Record<DimensionKey, number>;
  maxValue?: number;
}

const DIMENSION_KEYS: DimensionKey[] = ["K", "H", "C", "S", "G"];

export function DimensionMiniBar({ dimensions, maxValue = 100 }: DimensionMiniBarProps) {
  const containerStyle: CSSProperties = {
    display: "flex",
    gap: "4px",
    alignItems: "flex-end",
    height: "16px",
  };

  return (
    <div style={containerStyle}>
      {DIMENSION_KEYS.map((key) => {
        const value = dimensions[key] ?? 0;
        const heightPct = Math.min(100, (value / maxValue) * 100);
        const barStyle: CSSProperties = {
          width: "12px",
          height: `${Math.max(2, heightPct * 0.16)}px`,
          backgroundColor: DIMENSION_COLORS[key],
          borderRadius: "1px",
          flexShrink: 0,
        };
        return <div key={key} style={barStyle} title={`${key}: ${value}`} />;
      })}
    </div>
  );
}
