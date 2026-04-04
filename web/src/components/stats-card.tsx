import type { ReactNode } from "react";

interface StatsCardProps {
  eyebrow: string;
  title: string;
  value: string;
  detail: string;
  accent: ReactNode;
}

export function StatsCard({ eyebrow, title, value, detail, accent }: StatsCardProps) {
  return (
    <article className="stats-card">
      <div className="stats-card__header">
        <span>{eyebrow}</span>
        <div className="stats-card__glyph">{accent}</div>
      </div>
      <p className="stats-card__title">{title}</p>
      <strong className="stats-card__value">{value}</strong>
      <p className="stats-card__detail">{detail}</p>
    </article>
  );
}
