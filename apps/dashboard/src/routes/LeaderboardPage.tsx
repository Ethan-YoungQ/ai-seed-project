import { CSSProperties } from "react";
import { useRanking } from "../hooks/useRanking";
import type { RankingRow } from "../types/api";
import { TierSection } from "../components/leaderboard/TierSection";

const LEVELS_DESCENDING = [5, 4, 3, 2, 1];

function groupByLevel(rows: RankingRow[]): Map<number, RankingRow[]> {
  const map = new Map<number, RankingRow[]>();
  for (const row of rows) {
    const existing = map.get(row.currentLevel) ?? [];
    map.set(row.currentLevel, [...existing, row]);
  }
  return map;
}

function SkeletonCard() {
  const style: CSSProperties = {
    height: "80px",
    background: "var(--bg-surface)",
    border: "1px solid var(--border-glow)",
    borderRadius: "8px",
    marginBottom: "8px",
    animation: "pulse 1.5s ease-in-out infinite",
    opacity: 0.6,
  };
  return <div style={style} />;
}

function LoadingSkeleton() {
  const containerStyle: CSSProperties = {
    display: "flex",
    flexDirection: "column",
  };

  return (
    <div style={containerStyle}>
      {Array.from({ length: 6 }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}

interface ErrorCardProps {
  message: string;
  onRetry: () => void;
}

function ErrorCard({ message, onRetry }: ErrorCardProps) {
  const cardStyle: CSSProperties = {
    background: "var(--bg-surface)",
    border: "1px solid #ff2d78",
    borderRadius: "8px",
    padding: "24px",
    textAlign: "center",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    alignItems: "center",
  };

  const msgStyle: CSSProperties = {
    color: "#ff2d78",
    fontFamily: "var(--font-mono)",
    fontSize: "15px",
  };

  const btnStyle: CSSProperties = {
    background: "#ff2d78",
    color: "#fff",
    border: "none",
    borderRadius: "4px",
    padding: "8px 20px",
    fontFamily: "var(--font-display)",
    fontSize: "12px",
    cursor: "pointer",
  };

  return (
    <div style={cardStyle}>
      <span style={{ fontSize: "24px" }}>⚠️</span>
      <p style={msgStyle}>{message}</p>
      <button style={btnStyle} onClick={onRetry}>
        RETRY
      </button>
    </div>
  );
}

export function LeaderboardPage() {
  const { data, loading, error, refetch } = useRanking();

  const pageStyle: CSSProperties = {
    padding: "16px 0",
  };

  const titleStyle: CSSProperties = {
    fontFamily: "var(--font-display)",
    fontSize: "18px",
    color: "var(--text-primary)",
    marginBottom: "20px",
    letterSpacing: "0.05em",
  };

  if (loading) {
    return (
      <div style={pageStyle}>
        <h1 style={titleStyle}>LEADERBOARD</h1>
        <LoadingSkeleton />
      </div>
    );
  }

  if (error) {
    return (
      <div style={pageStyle}>
        <h1 style={titleStyle}>LEADERBOARD</h1>
        <ErrorCard message={error} onRetry={refetch} />
      </div>
    );
  }

  if (!data || data.rows.length === 0) {
    const emptyStyle: CSSProperties = {
      color: "var(--text-secondary)",
      fontFamily: "var(--font-mono)",
      fontSize: "15px",
      textAlign: "center",
      padding: "48px 0",
    };
    return (
      <div style={pageStyle}>
        <h1 style={titleStyle}>LEADERBOARD</h1>
        <p style={emptyStyle}>No ranking data available.</p>
      </div>
    );
  }

  const grouped = groupByLevel(data.rows);

  return (
    <div style={pageStyle}>
      <h1 style={titleStyle}>LEADERBOARD</h1>
      {LEVELS_DESCENDING.map((level) => {
        const rows = grouped.get(level);
        if (!rows || rows.length === 0) return null;
        return <TierSection key={level} level={level} rows={rows} />;
      })}
    </div>
  );
}
