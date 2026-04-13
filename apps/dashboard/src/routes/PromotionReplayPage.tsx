import { CSSProperties } from "react";
import { useParams, Link } from "react-router";
import { useMemberDetail } from "../hooks/useMemberDetail";
import { PromotionHero } from "../components/promotion/PromotionHero";
import { ConditionChecklist } from "../components/promotion/ConditionChecklist";

function NotFoundCard({ message }: { message: string }) {
  const style: CSSProperties = {
    background: "var(--bg-surface)",
    border: "1px solid var(--border-glow)",
    borderRadius: "8px",
    padding: "32px",
    textAlign: "center",
    color: "var(--text-secondary)",
    fontFamily: "var(--font-mono)",
    fontSize: "15px",
  };

  const backStyle: CSSProperties = {
    display: "inline-block",
    marginTop: "16px",
    fontSize: "11px",
    fontFamily: "var(--font-display)",
    color: "var(--accent)",
    textDecoration: "none",
  };

  return (
    <div style={style}>
      <p>{message}</p>
      <Link to="/" style={backStyle}>← 返回排行榜</Link>
    </div>
  );
}

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
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} style={skeletonStyle} />
      ))}
    </div>
  );
}

export function PromotionReplayPage() {
  const { memberId = "", windowCode = "" } = useParams<{
    memberId: string;
    windowCode: string;
  }>();
  const { data, loading, error } = useMemberDetail(memberId);

  const pageStyle: CSSProperties = {
    padding: "0",
  };

  const backStyle: CSSProperties = {
    display: "inline-block",
    marginBottom: "16px",
    fontSize: "11px",
    fontFamily: "var(--font-display)",
    color: "var(--text-secondary)",
    textDecoration: "none",
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
        <NotFoundCard message={`加载失败: ${error}`} />
      </div>
    );
  }

  if (!data || !data.ok) {
    return (
      <div style={pageStyle}>
        <NotFoundCard message="成员数据未找到" />
      </div>
    );
  }

  const { detail } = data;
  const promotion = detail.promotions.find((p) => p.windowId === windowCode);

  if (!promotion) {
    return (
      <div style={pageStyle}>
        <Link to={`/m/${memberId}`} style={backStyle}>← 返回成员详情</Link>
        <NotFoundCard message={`未找到窗口 ${windowCode} 的段位变动记录`} />
      </div>
    );
  }

  return (
    <div style={pageStyle}>
      <Link to={`/m/${memberId}`} style={backStyle}>← 返回成员详情</Link>
      <PromotionHero
        fromLevel={promotion.fromLevel}
        toLevel={promotion.toLevel}
        windowId={promotion.windowId}
        promotedAt={promotion.promotedAt}
        memberName={detail.memberName}
      />
      <ConditionChecklist reason={promotion.reason} />
    </div>
  );
}
