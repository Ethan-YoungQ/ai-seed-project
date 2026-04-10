import { CSSProperties } from "react";
import { LineChart, Line, ResponsiveContainer, Tooltip } from "recharts";
import type { DimensionKey } from "../../lib/colors";
import { getDimensionColor, DIMENSION_LABELS } from "../../lib/colors";

interface SparklineDataPoint {
  windowId: string;
  value: number;
}

interface SparklineProps {
  dimKey: DimensionKey;
  data: SparklineDataPoint[];
}

export function Sparkline({ dimKey, data }: SparklineProps) {
  const color = getDimensionColor(dimKey);
  const label = DIMENSION_LABELS[dimKey];

  const wrapperStyle: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  };

  const labelStyle: CSSProperties = {
    fontFamily: "var(--font-mono)",
    fontSize: "9px",
    color,
    letterSpacing: "0.06em",
    textShadow: `0 0 6px ${color}88`,
  };

  const chartWrapStyle: CSSProperties = {
    height: "60px",
  };

  if (data.length === 0) {
    const emptyStyle: CSSProperties = {
      height: "60px",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      color: "var(--text-secondary)",
      fontFamily: "var(--font-mono)",
      fontSize: "9px",
    };
    return (
      <div style={wrapperStyle}>
        <span style={labelStyle}>{label}</span>
        <div style={emptyStyle}>—</div>
      </div>
    );
  }

  return (
    <div style={wrapperStyle}>
      <span style={labelStyle}>{label}</span>
      <div style={chartWrapStyle}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
            <Line
              type="monotone"
              dataKey="value"
              stroke={color}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 3, fill: color }}
            />
            <Tooltip
              contentStyle={{
                background: "var(--bg-elevated)",
                border: `1px solid ${color}`,
                borderRadius: "4px",
                fontFamily: "var(--font-mono)",
                fontSize: "10px",
                color: "var(--text-primary)",
                padding: "4px 8px",
              }}
              formatter={(value: number) => [value.toFixed(1), label]}
              labelFormatter={(label: string) => label}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
