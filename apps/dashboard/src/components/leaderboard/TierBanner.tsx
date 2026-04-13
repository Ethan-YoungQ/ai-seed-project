import { CSSProperties } from "react";
import { getLevelConfig } from "../../lib/levels";

interface TierBannerProps {
  level: number;
  count: number;
}

export function TierBanner({ level, count }: TierBannerProps) {
  const config = getLevelConfig(level);

  const containerStyle: CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    padding: "8px 12px",
    borderLeft: `4px solid ${config.color}`,
    background: "var(--bg-elevated)",
    borderRadius: "0 4px 4px 0",
    marginBottom: "12px",
  };

  const nameStyle: CSSProperties = {
    fontFamily: "var(--font-display)",
    fontSize: "14px",
    color: config.color,
    flex: 1,
  };

  const countStyle: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "2px 8px",
    background: config.color,
    color: "#000",
    borderRadius: "10px",
    fontSize: "13px",
    fontFamily: "var(--font-mono)",
    fontWeight: "bold",
  };

  return (
    <div style={containerStyle}>
      <span style={{ fontSize: "20px" }}>{config.emoji}</span>
      <span style={nameStyle}>{config.name}</span>
      <span style={countStyle}>{count}</span>
    </div>
  );
}
