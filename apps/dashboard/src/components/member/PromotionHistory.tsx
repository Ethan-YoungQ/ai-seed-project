import { CSSProperties } from "react";
import { PromotionCard } from "./PromotionCard";

interface PromotionEntry {
  fromLevel: number;
  toLevel: number;
  windowId: string;
  promotedAt: string;
  reason: string;
}

interface PromotionHistoryProps {
  promotions: PromotionEntry[];
  memberId: string;
}

export function PromotionHistory({ promotions, memberId }: PromotionHistoryProps) {
  const sectionStyle: CSSProperties = {
    marginTop: "0",
  };

  const titleStyle: CSSProperties = {
    fontSize: "13px",
    fontFamily: "var(--font-display)",
    color: "var(--text-secondary)",
    letterSpacing: "0.1em",
    marginBottom: "12px",
    textTransform: "uppercase",
  };

  const listStyle: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  };

  const emptyStyle: CSSProperties = {
    color: "var(--text-secondary)",
    fontFamily: "var(--font-mono)",
    fontSize: "14px",
    textAlign: "center",
    padding: "24px 0",
  };

  return (
    <section style={sectionStyle}>
      <p style={titleStyle}>段位变动记录</p>
      {promotions.length === 0 ? (
        <p style={emptyStyle}>暂无段位变动记录</p>
      ) : (
        <div style={listStyle}>
          {promotions.map((promo, idx) => (
            <PromotionCard
              key={`${promo.windowId}-${idx}`}
              promotion={promo}
              memberId={memberId}
            />
          ))}
        </div>
      )}
    </section>
  );
}
