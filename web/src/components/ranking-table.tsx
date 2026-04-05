import type { BoardRankingEntry } from "../types";

interface RankingTableProps {
  entries: BoardRankingEntry[];
  title?: string;
  hint?: string;
}

export function RankingTable({
  entries,
  title = "成员长期排名",
  hint = "按累计积分排序，自动隐藏被排除成员"
}: RankingTableProps) {
  const leaderScore = entries[0]?.totalScore ?? 0;

  return (
    <section className="panel panel--ranking">
      <div className="panel__header">
        <div>
          <p className="panel__eyebrow">双周榜单</p>
          <h2>{title}</h2>
        </div>
        <p className="panel__hint">{hint}</p>
      </div>

      <div className="ranking-table">
        <div className="ranking-table__head">
          <span>名次</span>
          <span>成员</span>
          <span>部门</span>
          <span>积分</span>
          <span>差距</span>
          <span>计入课次</span>
        </div>
        {entries.map((entry) => {
          const gap = entry.rank === 1 ? "领跑" : `落后 ${leaderScore - entry.totalScore}`;
          return (
            <div key={entry.memberId} className="ranking-table__row">
              <span className="ranking-table__rank">#{entry.rank}</span>
              <span className="ranking-table__name">{entry.memberName}</span>
              <span>{entry.department}</span>
              <strong>{entry.totalScore}</strong>
              <span>{gap}</span>
              <span>{entry.sessionCount}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
