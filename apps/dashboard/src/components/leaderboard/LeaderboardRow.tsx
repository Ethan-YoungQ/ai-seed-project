import { CSSProperties } from "react";
import { useNavigate } from "react-router";
import type { RankingRow } from "../../types/api";
import { getLevelConfig } from "../../lib/levels";
import { NeonCard } from "../ui/NeonCard";
import { RankBadge } from "../ui/RankBadge";
import { LevelPill } from "../ui/LevelPill";
import { DimensionMiniBar } from "../ui/DimensionMiniBar";

interface LeaderboardRowProps {
  row: RankingRow;
}

export function LeaderboardRow({ row }: LeaderboardRowProps) {
  const navigate = useNavigate();
  const config = getLevelConfig(row.currentLevel);

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

  const nameStyle: CSSProperties = {
    fontFamily: "var(--font-mono)",
    fontSize: "14px",
    color: "var(--text-primary)",
    fontWeight: "bold",
  };

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
    <NeonCard onClick={handleClick} glowColor={config.color} style={{ marginBottom: "8px" }}>
      <div style={innerStyle}>
        <div style={topRowStyle}>
          <RankBadge rank={row.rank} />
          <div style={centerStyle}>
            <span style={nameStyle}>{row.memberName}</span>
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
