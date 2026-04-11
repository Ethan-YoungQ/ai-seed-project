import { CSSProperties, useState } from "react";
import { useNavigate } from "react-router";
import type { RankingRow } from "../../types/api";
import { getLevelConfig } from "../../lib/levels";
import { NeonCard } from "../ui/NeonCard";
import { RankBadge } from "../ui/RankBadge";
import { LevelPill } from "../ui/LevelPill";
import { DimensionMiniBar } from "../ui/DimensionMiniBar";
import { BadgeIcon } from "../ui/BadgeIcon";

interface LeaderboardRowProps {
  row: RankingRow;
}

export function LeaderboardRow({ row }: LeaderboardRowProps) {
  const navigate = useNavigate();
  const config = getLevelConfig(row.currentLevel);
  const [avatarError, setAvatarError] = useState(false);

  const handleClick = () => {
    navigate(`/m/${row.memberId}`);
  };

  const innerStyle: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  };

  const topRowStyle: CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "12px",
  };

  const centerStyle: CSSProperties = {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    gap: "4px",
  };

  const nameRowStyle: CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "4px",
  };

  const nameStyle: CSSProperties = {
    fontFamily: "var(--font-mono)",
    fontSize: "14px",
    color: "var(--text-primary)",
    fontWeight: "bold",
  };

  const avatarSize = 32;
  const showImage = row.avatarUrl && !avatarError;

  const avatarContainerStyle: CSSProperties = {
    width: avatarSize,
    height: avatarSize,
    minWidth: avatarSize,
    borderRadius: "50%",
    border: `2px solid ${config.color}`,
    overflow: "hidden",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: showImage ? "transparent" : "var(--bg-elevated)",
    boxShadow: `0 0 6px ${config.color}44`,
  };

  const avatarImgStyle: CSSProperties = {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    display: "block",
  };

  const avatarFallbackStyle: CSSProperties = {
    fontFamily: "var(--font-mono)",
    fontSize: "13px",
    fontWeight: "bold",
    color: config.color,
    lineHeight: 1,
    userSelect: "none",
  };

  /** 最近 3 枚勋章（按期数倒序） */
  const recentBadges = [...(row.badges ?? [])]
    .sort((a, b) => b.periodNumber - a.periodNumber)
    .slice(0, 3);

  const aqStyle: CSSProperties = {
    fontFamily: "var(--font-display)",
    fontSize: "12px",
    color: config.color,
    textAlign: "right" as const,
    whiteSpace: "nowrap" as const,
  };

  const aqLabelStyle: CSSProperties = {
    fontSize: "9px",
    color: "var(--text-secondary)",
    fontFamily: "var(--font-mono)",
    textAlign: "right" as const,
  };

  const bottomRowStyle: CSSProperties = {
    display: "flex",
    justifyContent: "flex-end",
  };

  return (
    <NeonCard
      onClick={handleClick}
      glowColor={config.color}
      style={{ marginBottom: "8px" }}
      ariaLabel={`查看 ${row.memberName} 的详情，当前排名第 ${row.rank} 位`}
    >
      <div style={innerStyle}>
        <div style={topRowStyle}>
          <RankBadge rank={row.rank} />
          <div style={avatarContainerStyle}>
            {showImage ? (
              <img
                src={row.avatarUrl}
                alt={row.memberName}
                style={avatarImgStyle}
                onError={() => setAvatarError(true)}
              />
            ) : (
              <span style={avatarFallbackStyle}>
                {row.memberName.charAt(0)}
              </span>
            )}
          </div>
          <div style={centerStyle}>
            <div style={nameRowStyle}>
              <span style={nameStyle}>{row.memberName}</span>
              {recentBadges.map((b) => (
                <BadgeIcon key={`${b.badgeId}-${b.periodNumber}`} badge={b} size="small" />
              ))}
            </div>
            <LevelPill level={row.currentLevel} />
          </div>
          <div>
            <div style={aqStyle}>{row.cumulativeAq}</div>
            <div style={aqLabelStyle}>AQ</div>
          </div>
        </div>
        <div style={bottomRowStyle}>
          <DimensionMiniBar dimensions={row.dimensions} />
        </div>
      </div>
    </NeonCard>
  );
}
