import { CSSProperties } from "react";
import { useNavigate } from "react-router";
import { getLevelConfig, getPromotionDirection } from "../../lib/levels";
import { LevelPill } from "../ui/LevelPill";
import { NeonCard } from "../ui/NeonCard";

interface PromotionEntry {
  fromLevel: number;
  toLevel: number;
  windowId: string;
  promotedAt: string;
  reason: string;
}

interface PromotionCardProps {
  promotion: PromotionEntry;
  memberId: string;
}

const DIRECTION_CONFIG = {
  promoted: { arrow: "↑", color: "#22c55e", label: "晋级" },
  demoted: { arrow: "↓", color: "#ff2d78", label: "降级" },
  held: { arrow: "→", color: "#8888aa", label: "保持" },
} as const;

function truncateReason(reason: string, maxLen: number = 60): string {
  if (reason.length <= maxLen) return reason;
  return reason.slice(0, maxLen) + "…";
}

export function PromotionCard({ promotion, memberId }: PromotionCardProps) {
  const navigate = useNavigate();
  const direction = getPromotionDirection(promotion.fromLevel, promotion.toLevel);
  const dirConfig = DIRECTION_CONFIG[direction];
  const fromConfig = getLevelConfig(promotion.fromLevel);
  const toConfig = getLevelConfig(promotion.toLevel);

  const reasonExcerpt = truncateReason(promotion.reason);

  const handleClick = () => {
    navigate(`/m/${memberId}/promotion/${promotion.windowId}`);
  };

  const headerStyle: CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    flexWrap: "wrap",
    marginBottom: "8px",
  };

  const arrowStyle: CSSProperties = {
    fontSize: "16px",
    fontWeight: "bold",
    color: dirConfig.color,
    fontFamily: "var(--font-display)",
  };

  const dirLabelStyle: CSSProperties = {
    fontSize: "9px",
    fontFamily: "var(--font-display)",
    color: dirConfig.color,
    padding: "2px 6px",
    border: `1px solid ${dirConfig.color}`,
    borderRadius: "4px",
  };

  const metaStyle: CSSProperties = {
    display: "flex",
    gap: "12px",
    fontSize: "11px",
    color: "var(--text-secondary)",
    fontFamily: "var(--font-mono)",
    marginBottom: "6px",
  };

  const reasonStyle: CSSProperties = {
    fontSize: "11px",
    color: "var(--text-secondary)",
    fontFamily: "var(--font-mono)",
    fontStyle: "italic",
    lineHeight: 1.5,
  };

  const viewMoreStyle: CSSProperties = {
    fontSize: "9px",
    color: "var(--accent)",
    fontFamily: "var(--font-display)",
    marginTop: "8px",
    textDecoration: "none",
  };

  return (
    <NeonCard
      glowColor={dirConfig.color}
      onClick={handleClick}
      style={{ cursor: "pointer" }}
    >
      <div style={headerStyle}>
        <LevelPill level={promotion.fromLevel} />
        <span style={arrowStyle}>{dirConfig.arrow}</span>
        <LevelPill level={promotion.toLevel} />
        <span style={dirLabelStyle}>{dirConfig.label}</span>
      </div>
      <div style={metaStyle}>
        <span>窗口: {promotion.windowId}</span>
        <span>{new Date(promotion.promotedAt).toLocaleDateString("zh-CN")}</span>
      </div>
      <div style={reasonStyle}>{reasonExcerpt}</div>
      <div style={viewMoreStyle}>查看详情 →</div>
    </NeonCard>
  );
}
