import { CSSProperties } from "react";
import { getLevelConfig } from "../../lib/levels";

interface LevelPillProps {
  level: number;
}

export function LevelPill({ level }: LevelPillProps) {
  const config = getLevelConfig(level);

  const style: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: "4px",
    padding: "2px 6px",
    border: `2px solid ${config.color}`,
    borderRadius: "4px",
    fontSize: "10px",
    fontFamily: "var(--font-display)",
    color: config.color,
    whiteSpace: "nowrap",
  };

  return (
    <span style={style}>
      {config.emoji} {config.name}
    </span>
  );
}
