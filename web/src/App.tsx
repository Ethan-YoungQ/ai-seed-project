import { useDeferredValue, useEffect, useState } from "react";

import { AnnouncementPanel } from "./components/announcement-panel";
import { MemberRoster } from "./components/member-roster";
import { OperatorSubmissions } from "./components/operator-submissions";
import { RankingTable } from "./components/ranking-table";
import { SnapshotTimeline } from "./components/snapshot-timeline";
import { StatsCard } from "./components/stats-card";
import { TopNav } from "./components/top-nav";
import { WarningsPanel } from "./components/warnings-panel";
import {
  fetchMembers,
  fetchOperatorSubmissions,
  fetchPublicBoard,
  fetchSnapshots,
  fetchWarnings,
  seedDemo
} from "./lib/api";
import type {
  MemberEntry,
  OperatorSubmissionEntry,
  RankingResponse,
  SnapshotEntry,
  WarningEntry
} from "./types";

const publicMode = window.location.pathname !== "/operator";

export function App() {
  const [board, setBoard] = useState<RankingResponse | null>(null);
  const [members, setMembers] = useState<MemberEntry[]>([]);
  const [submissions, setSubmissions] = useState<OperatorSubmissionEntry[]>([]);
  const [warnings, setWarnings] = useState<WarningEntry[]>([]);
  const [snapshots, setSnapshots] = useState<SnapshotEntry[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | "visible" | "excluded">("all");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const deferredSearch = useDeferredValue(search);

  async function loadAll() {
    setLoading(true);
    setError(null);

    try {
      const [boardData, membersData, submissionsData, warningsData, snapshotsData] = await Promise.all([
        fetchPublicBoard(),
        fetchMembers(),
        fetchOperatorSubmissions(),
        fetchWarnings(),
        fetchSnapshots()
      ]);

      setBoard(boardData);
      setMembers(membersData.entries);
      setSubmissions(submissionsData.entries);
      setWarnings(warningsData.entries);
      setSnapshots(snapshotsData.entries);
    } catch (loadError) {
      setError(loadError instanceof Error ? "当前榜单暂时无法加载，请稍后重试。" : "当前榜单暂时无法加载，请稍后重试。");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAll();
  }, []);

  const filteredMembers = members.filter((member) => {
    const matchesText =
      deferredSearch.length === 0 ||
      member.name.toLowerCase().includes(deferredSearch.toLowerCase()) ||
      member.department.toLowerCase().includes(deferredSearch.toLowerCase());

    const matchesStatus =
      status === "all" ||
      (status === "visible" && !member.isExcludedFromBoard) ||
      (status === "excluded" && member.isExcludedFromBoard);

    return matchesText && matchesStatus;
  });

  async function loadDemoBoard() {
    await seedDemo();
    await loadAll();
  }

  if (loading) {
    return <div className="shell shell--state">正在装载训练营评估系统…</div>;
  }

  if (error || !board) {
    return (
      <div className="shell shell--state">
        <div className="empty-state">
          <p className="empty-state__eyebrow">看板暂不可用</p>
          <h1>当前还没有评估数据</h1>
          <p>{error ?? "请先初始化演示数据。"}</p>
          <button className="solid-button" onClick={() => void loadDemoBoard()} type="button">
            加载演示数据
          </button>
        </div>
      </div>
    );
  }

  const excludedCount = members.filter((member) => member.isExcludedFromBoard).length;

  return (
    <main className="shell">
      <TopNav mode={publicMode ? "public" : "operator"} />

      <section className="hero">
        <div className="hero__copy">
          <p className="hero__eyebrow">{publicMode ? "公开只读看板" : "运营面板"}</p>
          <h1>{publicMode ? "训练营实时榜单" : "训练营运营面板"}</h1>
          <p className="hero__lead">
            {publicMode
              ? "面向社群实时开放的双周评估看板，展示当前上榜成员、长期积分和历史榜单快照。"
              : "面向运营的复核与播报控制台，集中处理成员权限、评分兜底、预警状态和公告发送。"}
          </p>
        </div>
        <div className="hero__stats">
          <StatsCard
            eyebrow="成员数"
            title="当前上榜成员"
            value={`${board.overview.participantCount}`}
            detail="仅统计白名单参训成员"
            accent={<span>01</span>}
          />
          <StatsCard
            eyebrow="领跑者"
            title="当前领跑者"
            value={board.overview.leader?.memberName ?? "暂无"}
            detail={board.overview.leader ? `累计 ${board.overview.leader.totalScore} 分` : "等待首条有效提交"}
            accent={<span>02</span>}
          />
          <StatsCard
            eyebrow="平均分"
            title="平均积分"
            value={`${board.overview.averageScore}`}
            detail="按当前可见成员计算"
            accent={<span>03</span>}
          />
          <StatsCard
            eyebrow="已排除"
            title="已排除成员"
            value={`${excludedCount}`}
            detail="不会进入公开榜单与摘要播报"
            accent={<span>04</span>}
          />
        </div>
      </section>

      {publicMode ? (
        <div className="dashboard-grid dashboard-grid--public">
          <RankingTable entries={board.entries} title="公开双周榜单" hint="所有社群成员都可以通过链接实时访问" />
          <SnapshotTimeline entries={snapshots} />
        </div>
      ) : (
        <>
          <section className="toolbar">
            <div className="toolbar__search">
              <label htmlFor="member-search">筛选成员</label>
              <input
                id="member-search"
                onChange={(event) => setSearch(event.target.value)}
                placeholder="搜索姓名或部门"
                value={search}
              />
            </div>
            <div className="toolbar__chips">
              {[
                ["all", "全部"],
                ["visible", "当前上榜"],
                ["excluded", "已排除"]
              ].map(([value, label]) => (
                <button
                  key={value}
                  className={status === value ? "chip chip--active" : "chip"}
                  onClick={() => setStatus(value as typeof status)}
                  type="button"
                >
                  {label}
                </button>
              ))}
            </div>
          </section>

          <div className="dashboard-grid dashboard-grid--operator">
            <RankingTable entries={board.entries} title="运营视角榜单" hint="和公开榜单共用同一数据口径" />
            <WarningsPanel entries={warnings} />
            <OperatorSubmissions entries={submissions} onUpdated={loadAll} />
            <MemberRoster entries={filteredMembers} onUpdated={loadAll} />
            <AnnouncementPanel onUpdated={loadAll} />
            <SnapshotTimeline entries={snapshots} />
          </div>
        </>
      )}
    </main>
  );
}
