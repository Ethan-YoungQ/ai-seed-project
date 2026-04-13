import { CSSProperties, useCallback, useEffect, useState } from "react";
import { NeonCard } from "../components/ui/NeonCard";

interface LlmWorkerStatus {
  running: boolean;
  concurrency: number;
  activeTasks: number;
  queueDepth: number;
  lastHeartbeatAt: string | null;
}

interface StatusState {
  data: LlmWorkerStatus | null;
  loading: boolean;
  error: string | null;
  lastRefreshed: Date | null;
}

const REFRESH_INTERVAL_MS = 15_000;

async function fetchLlmStatus(): Promise<LlmWorkerStatus> {
  const res = await fetch("/api/v2/llm/worker/status");
  if (!res.ok) throw new Error(`Status fetch failed: ${res.status}`);
  const json = (await res.json()) as { ok: boolean; status: LlmWorkerStatus };
  if (!json.ok) throw new Error("Status response not ok");
  return json.status;
}

function StatusDot({ active }: { active: boolean }) {
  const dotStyle: CSSProperties = {
    width: "10px",
    height: "10px",
    borderRadius: "50%",
    background: active ? "#22c55e" : "#ff2d78",
    boxShadow: active ? "0 0 6px #22c55e" : "0 0 6px #ff2d78",
    display: "inline-block",
    flexShrink: 0,
  };

  return (
    <span
      style={dotStyle}
      role="img"
      aria-label={active ? "运行中" : "停止"}
    />
  );
}

function StatRow({ label, value }: { label: string; value: string | number }) {
  const rowStyle: CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "8px 0",
    borderBottom: "1px solid var(--border-glow)",
  };

  const labelStyle: CSSProperties = {
    fontSize: "14px",
    fontFamily: "var(--font-mono)",
    color: "var(--text-secondary)",
  };

  const valueStyle: CSSProperties = {
    fontSize: "15px",
    fontFamily: "var(--font-display)",
    color: "var(--text-primary)",
  };

  return (
    <div style={rowStyle}>
      <span style={labelStyle}>{label}</span>
      <span style={valueStyle}>{value}</span>
    </div>
  );
}

export function StatusPage() {
  const [state, setState] = useState<StatusState>({
    data: null,
    loading: true,
    error: null,
    lastRefreshed: null,
  });

  const refresh = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const data = await fetchLlmStatus();
      setState({ data, loading: false, error: null, lastRefreshed: new Date() });
    } catch (err) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err.message : "未知错误",
        lastRefreshed: new Date(),
      }));
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), REFRESH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  const pageStyle: CSSProperties = {
    padding: "16px 0",
  };

  const titleStyle: CSSProperties = {
    fontFamily: "var(--font-display)",
    fontSize: "15px",
    color: "var(--text-primary)",
    marginBottom: "20px",
    letterSpacing: "0.05em",
  };

  const headerRowStyle: CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    marginBottom: "16px",
  };

  const statusLabelStyle: CSSProperties = {
    fontFamily: "var(--font-display)",
    fontSize: "13px",
    color: "var(--text-primary)",
  };

  const metaStyle: CSSProperties = {
    fontSize: "12px",
    fontFamily: "var(--font-mono)",
    color: "var(--text-secondary)",
    marginBottom: "16px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  };

  const refreshBtnStyle: CSSProperties = {
    background: "transparent",
    border: "1px solid var(--border-glow)",
    borderRadius: "4px",
    padding: "4px 10px",
    fontFamily: "var(--font-display)",
    fontSize: "10px",
    color: "var(--text-secondary)",
    cursor: "pointer",
  };

  const errorStyle: CSSProperties = {
    color: "#ff2d78",
    fontFamily: "var(--font-mono)",
    fontSize: "14px",
    padding: "16px",
    background: "#ff2d7810",
    border: "1px solid #ff2d7840",
    borderRadius: "6px",
  };

  return (
    <div style={pageStyle}>
      <h1 style={titleStyle}>SYSTEM STATUS</h1>
      <div style={metaStyle}>
        <span>
          {state.lastRefreshed
            ? `上次刷新: ${state.lastRefreshed.toLocaleTimeString("zh-CN")}`
            : "加载中…"}
        </span>
        <button
          style={refreshBtnStyle}
          onClick={() => void refresh()}
          aria-label="手动刷新状态"
          disabled={state.loading}
        >
          {state.loading ? "刷新中…" : "刷新"}
        </button>
      </div>

      {state.error && (
        <div style={errorStyle} role="alert">
          加载失败: {state.error}
        </div>
      )}

      {!state.error && (
        <NeonCard glowColor={state.data?.running ? "#22c55e" : "#ff2d78"}>
          <div style={headerRowStyle}>
            <StatusDot active={state.data?.running ?? false} />
            <span style={statusLabelStyle}>
              LLM 评分 Worker — {state.data?.running ? "运行中" : "已停止"}
            </span>
          </div>
          {state.data && (
            <>
              <StatRow label="并发数" value={state.data.concurrency} />
              <StatRow label="活跃任务" value={state.data.activeTasks} />
              <StatRow label="队列深度" value={state.data.queueDepth} />
              <StatRow
                label="最后心跳"
                value={
                  state.data.lastHeartbeatAt
                    ? new Date(state.data.lastHeartbeatAt).toLocaleTimeString("zh-CN")
                    : "—"
                }
              />
            </>
          )}
          {state.loading && !state.data && (
            <div style={{ color: "var(--text-secondary)", fontFamily: "var(--font-mono)", fontSize: "14px", padding: "16px 0" }}>
              加载中…
            </div>
          )}
        </NeonCard>
      )}

      <div style={{ marginTop: "16px", fontSize: "11px", fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>
        每 {REFRESH_INTERVAL_MS / 1000} 秒自动刷新
      </div>
    </div>
  );
}
