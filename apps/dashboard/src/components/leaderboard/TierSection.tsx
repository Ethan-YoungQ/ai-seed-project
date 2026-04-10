import { CSSProperties } from "react";
import type { RankingRow } from "../../types/api";
import { TierBanner } from "./TierBanner";
import { LeaderboardRow } from "./LeaderboardRow";

interface TierSectionProps {
  level: number;
  rows: RankingRow[];
}

export function TierSection({ level, rows }: TierSectionProps) {
  const containerStyle: CSSProperties = {
    marginBottom: "24px",
  };

  return (
    <div style={containerStyle}>
      <TierBanner level={level} count={rows.length} />
      {rows.map((row) => (
        <LeaderboardRow key={row.memberId} row={row} />
      ))}
    </div>
  );
}
