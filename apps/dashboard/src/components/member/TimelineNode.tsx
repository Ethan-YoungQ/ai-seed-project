import { CSSProperties } from "react";

interface TimelineNodeProps {
  windowId: string;
  aq: number;
  isActive?: boolean;
  isFirst?: boolean;
  isLast?: boolean;
}

const NEON_COLOR = "#00ff88";
const INACTIVE_COLOR = "#2a2a5a";
const LINE_COLOR = "#2a2a5a";

export function TimelineNode({ windowId, aq, isActive = false, isFirst: _isFirst = false, isLast = false }: TimelineNodeProps) {
  const nodeColor = isActive ? NEON_COLOR : "#8888aa";

  const wrapperStyle: CSSProperties = {
    display: "flex",
    alignItems: "center",
    flex: isLast ? "0 0 auto" : "1 1 0",
    minWidth: 0,
  };

  const dotContainerStyle: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "6px",
    flexShrink: 0,
  };

  const dotStyle: CSSProperties = {
    width: isActive ? "16px" : "10px",
    height: isActive ? "16px" : "10px",
    borderRadius: "50%",
    background: isActive ? NEON_COLOR : INACTIVE_COLOR,
    border: `2px solid ${nodeColor}`,
    boxShadow: isActive ? `0 0 10px ${NEON_COLOR}, 0 0 20px ${NEON_COLOR}66` : "none",
    transition: "all 0.2s",
    flexShrink: 0,
  };

  const windowLabelStyle: CSSProperties = {
    fontFamily: "var(--font-mono)",
    fontSize: "10px",
    color: nodeColor,
    whiteSpace: "nowrap",
    textShadow: isActive ? `0 0 6px ${NEON_COLOR}` : "none",
  };

  const aqLabelStyle: CSSProperties = {
    fontFamily: "var(--font-mono)",
    fontSize: "11px",
    color: isActive ? NEON_COLOR : "var(--text-secondary)",
    whiteSpace: "nowrap",
    fontWeight: isActive ? "bold" : "normal",
    textShadow: isActive ? `0 0 6px ${NEON_COLOR}` : "none",
  };

  const lineStyle: CSSProperties = {
    flex: 1,
    height: "1px",
    background: LINE_COLOR,
    margin: "0 4px",
    marginTop: "-20px",
  };

  return (
    <div style={wrapperStyle}>
      <div style={dotContainerStyle}>
        <span style={windowLabelStyle}>{windowId}</span>
        <div style={dotStyle} />
        <span style={aqLabelStyle}>{aq.toFixed(1)}</span>
      </div>
      {!isLast && <div style={lineStyle} />}
    </div>
  );
}
