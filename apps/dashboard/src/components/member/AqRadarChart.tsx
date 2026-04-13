import { CSSProperties } from "react";
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  Radar,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { NeonCard } from "../ui/NeonCard";
import type { DimensionKey } from "../../lib/colors";
import { getDimensionColor, DIMENSION_LABELS } from "../../lib/colors";

interface AqRadarChartProps {
  dimensions: Record<DimensionKey, number>;
}

const DIMENSION_KEYS: DimensionKey[] = ["K", "H", "C", "S", "G"];

const NEON_ACCENT = "#00ff88";

function CustomAngleAxisTick(props: {
  x?: number;
  y?: number;
  payload?: { value: string };
  cx?: number;
  cy?: number;
}) {
  const { x = 0, y = 0, payload, cx = 0, cy = 0 } = props;
  if (!payload) return null;

  const key = payload.value as DimensionKey;
  const color = getDimensionColor(key);
  const label = DIMENSION_LABELS[key];

  const dx = x - cx;
  const dy = y - cy;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const nx = dist > 0 ? dx / dist : 0;
  const ny = dist > 0 ? dy / dist : 0;
  const offset = 14;

  return (
    <text
      x={x + nx * offset}
      y={y + ny * offset}
      textAnchor="middle"
      dominantBaseline="central"
      fill={color}
      fontSize={12}
      fontFamily="var(--font-display)"
    >
      {label}
    </text>
  );
}

export function AqRadarChart({ dimensions }: AqRadarChartProps) {
  const chartData = DIMENSION_KEYS.map((key) => ({
    subject: key,
    value: dimensions[key] ?? 0,
    fullMark: 100,
  }));

  const titleStyle: CSSProperties = {
    fontFamily: "var(--font-display)",
    fontSize: "13px",
    color: "var(--text-secondary)",
    letterSpacing: "0.08em",
    marginBottom: "12px",
  };

  return (
    <NeonCard glowColor={NEON_ACCENT + "55"}>
      <p style={titleStyle}>AQ 雷达图</p>
      <ResponsiveContainer width="100%" height={240}>
        <RadarChart data={chartData} margin={{ top: 20, right: 30, bottom: 20, left: 30 }}>
          <PolarGrid stroke="#2a2a5a" strokeWidth={1} />
          <PolarAngleAxis
            dataKey="subject"
            tick={(props) => <CustomAngleAxisTick {...props} />}
          />
          <Radar
            name="AQ"
            dataKey="value"
            stroke={NEON_ACCENT}
            strokeWidth={2}
            fill={NEON_ACCENT}
            fillOpacity={0.18}
          />
          <Tooltip
            contentStyle={{
              background: "var(--bg-elevated)",
              border: "1px solid var(--border-glow)",
              borderRadius: "4px",
              fontFamily: "var(--font-mono)",
              fontSize: "13px",
              color: "var(--text-primary)",
            }}
            formatter={(value: number, _name: string, entry: { payload?: { subject?: string } }) => {
              const key = entry.payload?.subject as DimensionKey | undefined;
              const label = key ? DIMENSION_LABELS[key] : "";
              return [value.toFixed(1), label];
            }}
          />
        </RadarChart>
      </ResponsiveContainer>
    </NeonCard>
  );
}
