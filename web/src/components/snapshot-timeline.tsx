import type { SnapshotEntry } from "../types";

interface SnapshotTimelineProps {
  entries: SnapshotEntry[];
}

export function SnapshotTimeline({ entries }: SnapshotTimelineProps) {
  return (
    <section className="panel">
      <div className="panel__header">
        <div>
          <p className="panel__eyebrow">历史快照</p>
          <h2>历史快照</h2>
        </div>
        <p className="panel__hint">每次排行榜播报都会固化一份双周快照</p>
      </div>

      <div className="timeline">
        {entries.length === 0 ? (
          <p className="timeline__empty">当前还没有历史快照。</p>
        ) : (
          entries.map((entry) => (
            <article className="timeline__item" key={entry.id}>
              <div>
                <p className="timeline__date">
                  {new Date(entry.createdAt).toLocaleDateString("zh-CN")} · {entry.payload.overview.participantCount} 人上榜
                </p>
                <strong>{entry.payload.overview.leader?.memberName ?? "暂无领跑者"}</strong>
              </div>
              <span className="timeline__score">
                {entry.payload.overview.leader ? `${entry.payload.overview.leader.totalScore} 分` : "等待数据"}
              </span>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
