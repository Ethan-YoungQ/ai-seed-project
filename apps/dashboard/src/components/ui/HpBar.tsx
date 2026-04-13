import { CSSProperties } from "react";

interface HpBarProps {
  value: number;
  max: number;
  color?: string;
  label?: string;
}

export function HpBar({ value, max, color = "#00ff88", label }: HpBarProps) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));

  const containerStyle: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
  };

  const trackStyle: CSSProperties = {
    width: "100%",
    height: "12px",
    background: "var(--bg-elevated)",
    border: "1px solid var(--border-glow)",
    borderRadius: "2px",
    overflow: "hidden",
    position: "relative",
  };

  const fillStyle: CSSProperties = {
    width: `${pct}%`,
    height: "100%",
    backgroundImage: `repeating-linear-gradient(
      90deg,
      ${color} 0px,
      ${color} 8px,
      transparent 8px,
      transparent 10px
    )`,
    transition: "width 0.3s",
  };

  const labelStyle: CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    fontSize: "12px",
    fontFamily: "var(--font-mono)",
    color: "var(--text-secondary)",
  };

  return (
    <div style={containerStyle}>
      {label && (
        <div style={labelStyle}>
          <span>{label}</span>
          <span>{value}/{max}</span>
        </div>
      )}
      <div style={trackStyle}>
        <div style={fillStyle} />
      </div>
    </div>
  );
}
