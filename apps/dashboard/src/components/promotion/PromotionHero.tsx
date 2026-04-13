import { CSSProperties } from "react";
import { getLevelConfig, getPromotionDirection } from "../../lib/levels";

interface PromotionHeroProps {
  fromLevel: number;
  toLevel: number;
  windowId: string;
  promotedAt: string;
  memberName: string;
}

const DIRECTION_CONFIG = {
  promoted: { arrow: "↑", color: "#22c55e", label: "晋级" },
  demoted: { arrow: "↓", color: "#ff2d78", label: "降级" },
  held: { arrow: "→", color: "#8888aa", label: "保持" },
} as const;

function LargeLevelBadge({ level }: { level: number }) {
  const config = getLevelConfig(level);

  const badgeStyle: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "8px",
    padding: "16px 24px",
    border: `2px solid ${config.color}`,
    borderRadius: "8px",
    background: `${config.color}15`,
    boxShadow: `0 0 16px ${config.color}40`,
    minWidth: "120px",
  };

  const emojiStyle: CSSProperties = {
    fontSize: "36px",
    lineHeight: 1,
  };

  const nameStyle: CSSProperties = {
    fontSize: "13px",
    fontFamily: "var(--font-display)",
    color: config.color,
    textAlign: "center",
    lineHeight: 1.4,
  };

  const levelNumStyle: CSSProperties = {
    fontSize: "11px",
    fontFamily: "var(--font-mono)",
    color: "var(--text-secondary)",
  };

  return (
    <div style={badgeStyle}>
      <span style={emojiStyle}>{config.emoji}</span>
      <span style={nameStyle}>{config.name}</span>
      <span style={levelNumStyle}>LV.{level}</span>
    </div>
  );
}

export function PromotionHero({ fromLevel, toLevel, windowId, promotedAt, memberName }: PromotionHeroProps) {
  const direction = getPromotionDirection(fromLevel, toLevel);
  const dirConfig = DIRECTION_CONFIG[direction];

  const containerStyle: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "24px",
    padding: "32px 0",
    borderBottom: "1px solid var(--border-glow)",
    marginBottom: "24px",
  };

  const titleStyle: CSSProperties = {
    fontSize: "13px",
    fontFamily: "var(--font-display)",
    color: "var(--text-secondary)",
    letterSpacing: "0.1em",
  };

  const nameStyle: CSSProperties = {
    fontSize: "18px",
    fontFamily: "var(--font-display)",
    color: "var(--text-primary)",
  };

  const badgeRowStyle: CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "20px",
    flexWrap: "wrap",
    justifyContent: "center",
  };

  const arrowStyle: CSSProperties = {
    fontSize: "40px",
    fontWeight: "bold",
    color: dirConfig.color,
    textShadow: `0 0 12px ${dirConfig.color}`,
  };

  const dirLabelStyle: CSSProperties = {
    fontSize: "13px",
    fontFamily: "var(--font-display)",
    color: dirConfig.color,
    padding: "4px 12px",
    border: `1px solid ${dirConfig.color}`,
    borderRadius: "4px",
    background: `${dirConfig.color}15`,
  };

  const metaStyle: CSSProperties = {
    display: "flex",
    gap: "16px",
    fontSize: "13px",
    color: "var(--text-secondary)",
    fontFamily: "var(--font-mono)",
    flexWrap: "wrap",
    justifyContent: "center",
  };

  return (
    <div style={containerStyle}>
      <p style={titleStyle}>段位变动回放</p>
      <p style={nameStyle}>{memberName}</p>
      <span style={dirLabelStyle}>{dirConfig.label}</span>
      <div style={badgeRowStyle}>
        <LargeLevelBadge level={fromLevel} />
        <span style={arrowStyle}>{dirConfig.arrow}</span>
        <LargeLevelBadge level={toLevel} />
      </div>
      <div style={metaStyle}>
        <span>窗口: {windowId}</span>
        <span>{new Date(promotedAt).toLocaleDateString("zh-CN")}</span>
      </div>
    </div>
  );
}
