import { CSSProperties } from "react";
import { NeonCard } from "../ui/NeonCard";
import { DimensionRow } from "./DimensionRow";
import type { DimensionKey } from "../../lib/colors";

const DIMENSION_KEYS: DimensionKey[] = ["K", "H", "C", "S", "G"];

interface DimensionBreakdownProps {
  dimensions: Record<DimensionKey, number>;
  max?: number;
}

export function DimensionBreakdown({ dimensions, max = 100 }: DimensionBreakdownProps) {
  const titleStyle: CSSProperties = {
    fontFamily: "var(--font-display)",
    fontSize: "10px",
    color: "var(--text-secondary)",
    letterSpacing: "0.08em",
    marginBottom: "16px",
  };

  const rowsStyle: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  };

  return (
    <NeonCard>
      <p style={titleStyle}>五维分析</p>
      <div style={rowsStyle}>
        {DIMENSION_KEYS.map((key) => (
          <DimensionRow
            key={key}
            dimKey={key}
            value={dimensions[key] ?? 0}
            max={max}
          />
        ))}
      </div>
    </NeonCard>
  );
}
