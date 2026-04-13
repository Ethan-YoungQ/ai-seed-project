import { CSSProperties, useState } from "react";
import type { EarnedBadge } from "../../lib/badges";
import { getBadgeConfig } from "../../lib/badges";

interface BadgeIconProps {
  badge: EarnedBadge;
  /** 尺寸模式：small 用于排行榜行内，normal 用于勋章墙 */
  size?: "small" | "normal";
}

export function BadgeIcon({ badge, size = "small" }: BadgeIconProps) {
  const [hovered, setHovered] = useState(false);
  const config = getBadgeConfig(badge.badgeId);

  if (!config) return null;

  const isSmall = size === "small";

  const pillStyle: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: isSmall ? "15px" : "22px",
    lineHeight: 1,
    padding: isSmall ? "2px 4px" : "4px 8px",
    borderRadius: "6px",
    background: hovered ? "var(--bg-elevated)" : "transparent",
    border: hovered ? "1px solid var(--border-glow)" : "1px solid transparent",
    cursor: "default",
    position: "relative",
    transition: "all 0.2s ease",
    boxShadow: hovered ? "0 0 8px rgba(255, 45, 120, 0.3)" : "none",
  };

  const tooltipStyle: CSSProperties = {
    position: "absolute",
    bottom: "calc(100% + 6px)",
    left: "50%",
    transform: "translateX(-50%)",
    background: "var(--bg-elevated)",
    border: "1px solid var(--border-glow)",
    borderRadius: "6px",
    padding: "6px 10px",
    whiteSpace: "nowrap",
    fontSize: "13px",
    fontFamily: "var(--font-mono)",
    color: "var(--text-primary)",
    boxShadow: "0 4px 12px rgba(0, 0, 0, 0.4)",
    zIndex: 100,
    pointerEvents: "none",
  };

  const periodLabel = `P${badge.periodNumber}`;

  return (
    <span
      style={pillStyle}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      aria-label={`${config.name} - 第${badge.periodNumber}期`}
    >
      {config.emoji}
      {hovered && (
        <span style={tooltipStyle}>
          {config.name} · {periodLabel}
        </span>
      )}
    </span>
  );
}
