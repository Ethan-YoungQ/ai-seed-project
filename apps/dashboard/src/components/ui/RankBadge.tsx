import { CSSProperties } from "react";

interface RankBadgeProps {
  rank: number;
}

const MEDAL_MAP: Record<number, string> = {
  1: "🥇",
  2: "🥈",
  3: "🥉",
};

export function RankBadge({ rank }: RankBadgeProps) {
  const medal = MEDAL_MAP[rank];

  if (medal) {
    const style: CSSProperties = {
      fontSize: "24px",
      lineHeight: "1",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      width: "36px",
      height: "36px",
    };
    return <span style={style}>{medal}</span>;
  }

  const style: CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "36px",
    height: "36px",
    fontSize: "14px",
    fontFamily: "var(--font-display)",
    color: "var(--text-secondary)",
  };

  return <span style={style}>#{rank}</span>;
}
