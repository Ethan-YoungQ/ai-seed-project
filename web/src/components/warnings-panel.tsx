import type { WarningEntry } from "../types";

interface WarningsPanelProps {
  entries: WarningEntry[];
}

export function WarningsPanel({ entries }: WarningsPanelProps) {
  return (
    <section className="panel">
      <div className="panel__header">
        <div>
          <p className="panel__eyebrow">State machine</p>
          <h2>提醒与淘汰</h2>
        </div>
        <p className="panel__hint">根据缺失有效作业的累计次数自动升级</p>
      </div>

      <div className="warning-stack">
        {entries.length === 0 ? (
          <p className="warning-stack__empty">当前没有触发中的预警记录。</p>
        ) : (
          entries.map((entry) => (
            <article className={`warning-pill warning-pill--${entry.level}`} key={entry.id}>
              <strong>{entry.memberId}</strong>
              <span>{entry.level}</span>
              <span>{entry.note}</span>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
