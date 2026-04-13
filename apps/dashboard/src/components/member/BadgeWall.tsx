import { CSSProperties, useState } from "react";
import type { EarnedBadge } from "../../lib/badges";
import { getBadgeConfig } from "../../lib/badges";
import { NeonCard } from "../ui/NeonCard";

interface BadgeWallProps {
  badges: EarnedBadge[];
}

function BadgeWallItem({ badge }: { badge: EarnedBadge }) {
  const config = getBadgeConfig(badge.badgeId);
  const [hovered, setHovered] = useState(false);
  if (!config) return null;

  const itemStyle: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "6px",
    padding: "12px 16px",
    background: "var(--bg-elevated)",
    border: "1px solid var(--border-glow)",
    borderRadius: "8px",
    minWidth: "100px",
    transition: "box-shadow 0.25s ease, transform 0.2s ease",
    boxShadow: hovered ? "0 0 16px rgba(255, 45, 120, 0.3)" : "none",
    transform: hovered ? "translateY(-2px)" : "translateY(0)",
  };

  const emojiStyle: CSSProperties = {
    fontSize: "34px",
    lineHeight: 1,
    filter: "drop-shadow(0 0 6px rgba(255, 45, 120, 0.4))",
  };

  const nameStyle: CSSProperties = {
    fontFamily: "var(--font-mono)",
    fontSize: "14px",
    color: "var(--text-primary)",
    fontWeight: "bold",
    textAlign: "center",
  };

  const periodStyle: CSSProperties = {
    fontFamily: "var(--font-mono)",
    fontSize: "12px",
    color: "var(--text-secondary)",
  };

  return (
    <div
      style={itemStyle}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <span style={emojiStyle}>{config.emoji}</span>
      <span style={nameStyle}>{config.name}</span>
      <span style={periodStyle}>第{badge.periodNumber}期</span>
    </div>
  );
}

export function BadgeWall({ badges }: BadgeWallProps) {
  if (badges.length === 0) return null;

  const headerStyle: CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    marginBottom: "16px",
  };

  const titleStyle: CSSProperties = {
    fontFamily: "var(--font-display)",
    fontSize: "15px",
    color: "var(--text-primary)",
    letterSpacing: "2px",
  };

  const gridStyle: CSSProperties = {
    display: "flex",
    flexWrap: "wrap",
    gap: "12px",
  };

  const countStyle: CSSProperties = {
    fontFamily: "var(--font-mono)",
    fontSize: "13px",
    color: "var(--text-secondary)",
    marginTop: "16px",
    textAlign: "right",
  };

  const sorted = [...badges].sort((a, b) => b.periodNumber - a.periodNumber);

  return (
    <NeonCard glowColor="#ff2d78">
      <div style={headerStyle}>
        <span style={{ fontSize: "22px" }}>{"🏆"}</span>
        <span style={titleStyle}>{"勋章墙"}</span>
      </div>
      <div style={gridStyle}>
        {sorted.map((badge) => (
          <BadgeWallItem
            key={`${badge.badgeId}-${badge.periodNumber}`}
            badge={badge}
          />
        ))}
      </div>
      <div style={countStyle}>
        {"共获勋章: "}{badges.length}{" 枚"}
      </div>
    </NeonCard>
  );
}
