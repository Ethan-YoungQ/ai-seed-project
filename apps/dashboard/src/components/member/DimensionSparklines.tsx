import { CSSProperties } from "react";
import { NeonCard } from "../ui/NeonCard";
import { Sparkline } from "./Sparkline";
import type { DimensionKey } from "../../lib/colors";

const DIMENSION_KEYS: DimensionKey[] = ["K", "H", "C", "S", "G"];

interface WindowSnapshot {
  windowId: string;
  aq: number;
  dims: Record<DimensionKey, number>;
  settledAt: string;
}

interface DimensionSparklinesProps {
  snapshots: WindowSnapshot[];
}

function pivotToDimensionArrays(
  snapshots: WindowSnapshot[]
): Record<DimensionKey, Array<{ windowId: string; value: number }>> {
  const result = {} as Record<DimensionKey, Array<{ windowId: string; value: number }>>;

  for (const key of DIMENSION_KEYS) {
    result[key] = snapshots.map((snap) => ({
      windowId: snap.windowId,
      value: snap.dims[key] ?? 0,
    }));
  }

  return result;
}

export function DimensionSparklines({ snapshots }: DimensionSparklinesProps) {
  const perDimension = pivotToDimensionArrays(snapshots);

  const titleStyle: CSSProperties = {
    fontFamily: "var(--font-display)",
    fontSize: "13px",
    color: "var(--text-secondary)",
    letterSpacing: "0.08em",
    marginBottom: "16px",
  };

  const gridStyle: CSSProperties = {
    display: "grid",
    gap: "16px",
  };

  return (
    <NeonCard>
      <p style={titleStyle}>维度趋势</p>
      <div style={gridStyle} className="sparklines-grid">
        {DIMENSION_KEYS.map((key) => (
          <Sparkline key={key} dimKey={key} data={perDimension[key]} />
        ))}
      </div>
    </NeonCard>
  );
}

export { pivotToDimensionArrays };
