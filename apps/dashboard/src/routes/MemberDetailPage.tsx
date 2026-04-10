import { CSSProperties } from "react";
import { useParams } from "react-router";
import { useMemberDetail } from "../hooks/useMemberDetail";
import { MemberHero } from "../components/member/MemberHero";
import { AqRadarChart } from "../components/member/AqRadarChart";
import { DimensionBreakdown } from "../components/member/DimensionBreakdown";
import { WindowTimeline } from "../components/member/WindowTimeline";
import { DimensionSparklines } from "../components/member/DimensionSparklines";

function LoadingState() {
  const style: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: "16px",
    padding: "24px 0",
  };

  const skeletonStyle: CSSProperties = {
    height: "80px",
    background: "var(--bg-surface)",
    border: "1px solid var(--border-glow)",
    borderRadius: "8px",
    animation: "pulse 1.5s ease-in-out infinite",
    opacity: 0.6,
  };

  return (
    <div style={style}>
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} style={skeletonStyle} />
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
    fontSize: "13px",
  };

  const btnStyle: CSSProperties = {
    background: "#ff2d78",
    color: "#fff",
    border: "none",
    borderRadius: "4px",
    padding: "8px 20px",
    fontFamily: "var(--font-display)",
    fontSize: "10px",
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

export function MemberDetailPage() {
  const { memberId = "" } = useParams<{ memberId: string }>();
  const { data, loading, error, refetch } = useMemberDetail(memberId);

  const pageStyle: CSSProperties = {
    padding: "0",
  };

  const gridStyle: CSSProperties = {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "16px",
    marginTop: "16px",
  };

  const fullWidthStyle: CSSProperties = {
    gridColumn: "1 / -1",
  };

  if (loading) {
    return (
      <div style={pageStyle}>
        <LoadingState />
      </div>
    );
  }

  if (error) {
    return (
      <div style={pageStyle}>
        <ErrorCard message={error} onRetry={refetch} />
      </div>
    );
  }

  if (!data || !data.ok) {
    const emptyStyle: CSSProperties = {
      color: "var(--text-secondary)",
      fontFamily: "var(--font-mono)",
      fontSize: "13px",
      textAlign: "center",
      padding: "48px 0",
    };
    return (
      <div style={pageStyle}>
        <p style={emptyStyle}>Member not found.</p>
      </div>
    );
  }

  const { detail } = data;

  return (
    <div style={pageStyle}>
      <MemberHero
        memberName={detail.memberName}
        currentLevel={detail.currentLevel}
        cumulativeAq={detail.cumulativeAq}
      />
      <div style={gridStyle}>
        <div style={fullWidthStyle}>
          <WindowTimeline snapshots={detail.windowSnapshots} />
        </div>
        <AqRadarChart dimensions={detail.dimensions} />
        <DimensionBreakdown dimensions={detail.dimensions} />
        <div style={fullWidthStyle}>
          <DimensionSparklines snapshots={detail.windowSnapshots} />
        </div>
      </div>
    </div>
  );
}
