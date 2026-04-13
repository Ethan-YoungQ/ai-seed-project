import { CSSProperties } from "react";
import { NeonCard } from "../ui/NeonCard";
import { TimelineNode } from "./TimelineNode";

interface WindowSnapshot {
  windowId: string;
  aq: number;
  settledAt: string;
}

interface WindowTimelineProps {
  snapshots: WindowSnapshot[];
}

export function WindowTimeline({ snapshots }: WindowTimelineProps) {
  if (snapshots.length === 0) {
    const emptyStyle: CSSProperties = {
      color: "var(--text-secondary)",
      fontFamily: "var(--font-mono)",
      fontSize: "13px",
      textAlign: "center",
      padding: "16px 0",
    };
    return (
      <NeonCard>
        <p style={emptyStyle}>暂无窗口数据</p>
      </NeonCard>
    );
  }

  const maxAq = Math.max(...snapshots.map((s) => s.aq));
  const activeIndex = snapshots.reduce(
    (bestIdx, snap, idx) => (snap.aq >= snapshots[bestIdx].aq ? idx : bestIdx),
    0
  );

  const titleStyle: CSSProperties = {
    fontFamily: "var(--font-display)",
    fontSize: "13px",
    color: "var(--text-secondary)",
    letterSpacing: "0.08em",
    marginBottom: "20px",
  };

  const timelineStyle: CSSProperties = {
    display: "flex",
    alignItems: "center",
    overflowX: "auto",
    paddingBottom: "8px",
    minHeight: "80px",
  };

  return (
    <NeonCard>
      <p style={titleStyle}>窗口时间线</p>
      <div style={timelineStyle}>
        {snapshots.map((snap, idx) => (
          <TimelineNode
            key={snap.windowId}
            windowId={snap.windowId}
            aq={snap.aq}
            isActive={idx === activeIndex}
            isFirst={idx === 0}
            isLast={idx === snapshots.length - 1}
          />
        ))}
      </div>
      <div style={{ display: "none" }}>{maxAq}</div>
    </NeonCard>
  );
}
