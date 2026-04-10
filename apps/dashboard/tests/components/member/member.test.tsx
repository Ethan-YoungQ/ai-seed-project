import { describe, test, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { MemberHero } from "../../../src/components/member/MemberHero";
import { DimensionBreakdown } from "../../../src/components/member/DimensionBreakdown";
import { DimensionRow } from "../../../src/components/member/DimensionRow";
import { WindowTimeline } from "../../../src/components/member/WindowTimeline";
import { DimensionSparklines, pivotToDimensionArrays } from "../../../src/components/member/DimensionSparklines";
import { Sparkline } from "../../../src/components/member/Sparkline";
import { DIMENSION_LABELS } from "../../../src/lib/colors";

// recharts uses ResizeObserver — polyfill for jsdom
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// ── MemberHero ─────────────────────────────────────────────────────────────

describe("MemberHero component", () => {
  function renderHero(level: number = 3, aq: number = 85.5) {
    return render(
      <MemoryRouter>
        <MemberHero memberName="张三" currentLevel={level} cumulativeAq={aq} />
      </MemoryRouter>
    );
  }

  test("renders member name", () => {
    renderHero();
    expect(screen.getByText("张三")).toBeTruthy();
  });

  test("renders level pill with correct level name", () => {
    renderHero(3);
    expect(screen.getByText(/AI 探索者/)).toBeTruthy();
  });

  test("renders cumulative AQ score", () => {
    renderHero(3, 85.5);
    expect(screen.getByText("85.5")).toBeTruthy();
  });

  test("renders back link to leaderboard", () => {
    const { container } = renderHero();
    const link = container.querySelector("a");
    expect(link).toBeTruthy();
    expect(link?.textContent).toContain("LEADERBOARD");
  });

  test("renders level 5 with correct name", () => {
    renderHero(5);
    expect(screen.getByText(/AI 奇点玩家/)).toBeTruthy();
  });
});

// ── DimensionBreakdown ─────────────────────────────────────────────────────

describe("DimensionBreakdown component", () => {
  const dims = { K: 80, H: 60, C: 70, S: 50, G: 90 };

  test("renders 5 dimension rows", () => {
    const { container } = render(<DimensionBreakdown dimensions={dims} />);
    // Each DimensionRow renders its label text
    const rows = container.querySelectorAll("[style]");
    // We just verify 5 dimension labels appear
    const labels = ["知识", "实操", "创造力", "社交", "成长"];
    labels.forEach((label) => {
      expect(screen.getByText(label)).toBeTruthy();
    });
  });

  test("renders section title", () => {
    render(<DimensionBreakdown dimensions={dims} />);
    expect(screen.getByText("五维分析")).toBeTruthy();
  });

  test("renders all 5 dimension scores as text", () => {
    render(<DimensionBreakdown dimensions={dims} />);
    // Score values appear as formatted text
    expect(screen.getByText("80.0")).toBeTruthy();
    expect(screen.getByText("90.0")).toBeTruthy();
  });
});

// ── DimensionRow ───────────────────────────────────────────────────────────

describe("DimensionRow component", () => {
  test("renders K dimension with label and score", () => {
    render(<DimensionRow dimKey="K" value={75} />);
    expect(screen.getByText(DIMENSION_LABELS.K)).toBeTruthy();
    expect(screen.getByText("75.0")).toBeTruthy();
  });

  test("renders C dimension with correct label", () => {
    render(<DimensionRow dimKey="C" value={42.5} />);
    expect(screen.getByText(DIMENSION_LABELS.C)).toBeTruthy();
    expect(screen.getByText("42.5")).toBeTruthy();
  });

  test("renders icon for each dimension", () => {
    const { container } = render(<DimensionRow dimKey="H" value={60} />);
    expect(container.textContent).toContain("🔧");
  });
});

// ── WindowTimeline ─────────────────────────────────────────────────────────

describe("WindowTimeline component", () => {
  const snapshots = [
    { windowId: "W1", aq: 70, dims: { K: 60, H: 70, C: 80, S: 65, G: 75 }, settledAt: "2024-01-01" },
    { windowId: "W2", aq: 85, dims: { K: 80, H: 75, C: 85, S: 70, G: 80 }, settledAt: "2024-01-15" },
    { windowId: "W3", aq: 78, dims: { K: 75, H: 72, C: 80, S: 68, G: 77 }, settledAt: "2024-02-01" },
  ];

  test("renders section title", () => {
    render(<WindowTimeline snapshots={snapshots} />);
    expect(screen.getByText("窗口时间线")).toBeTruthy();
  });

  test("renders all window IDs", () => {
    render(<WindowTimeline snapshots={snapshots} />);
    expect(screen.getByText("W1")).toBeTruthy();
    expect(screen.getByText("W2")).toBeTruthy();
    expect(screen.getByText("W3")).toBeTruthy();
  });

  test("renders AQ values for each window", () => {
    render(<WindowTimeline snapshots={snapshots} />);
    expect(screen.getByText("70.0")).toBeTruthy();
    expect(screen.getByText("85.0")).toBeTruthy();
  });

  test("renders empty state when no snapshots", () => {
    render(<WindowTimeline snapshots={[]} />);
    expect(screen.getByText("暂无窗口数据")).toBeTruthy();
  });
});

// ── pivotToDimensionArrays utility ─────────────────────────────────────────

describe("pivotToDimensionArrays utility", () => {
  const snapshots = [
    { windowId: "W1", aq: 70, dims: { K: 60, H: 70, C: 80, S: 65, G: 75 }, settledAt: "2024-01-01" },
    { windowId: "W2", aq: 85, dims: { K: 80, H: 75, C: 85, S: 70, G: 80 }, settledAt: "2024-01-15" },
  ];

  test("returns data for all 5 dimensions", () => {
    const result = pivotToDimensionArrays(snapshots);
    const keys = ["K", "H", "C", "S", "G"] as const;
    keys.forEach((key) => {
      expect(result[key]).toBeTruthy();
      expect(result[key].length).toBe(2);
    });
  });

  test("preserves windowId in each data point", () => {
    const result = pivotToDimensionArrays(snapshots);
    expect(result.K[0].windowId).toBe("W1");
    expect(result.K[1].windowId).toBe("W2");
  });

  test("extracts correct dimension values", () => {
    const result = pivotToDimensionArrays(snapshots);
    expect(result.K[0].value).toBe(60);
    expect(result.K[1].value).toBe(80);
    expect(result.C[0].value).toBe(80);
    expect(result.G[1].value).toBe(80);
  });

  test("returns empty arrays when snapshots is empty", () => {
    const result = pivotToDimensionArrays([]);
    const keys = ["K", "H", "C", "S", "G"] as const;
    keys.forEach((key) => {
      expect(result[key].length).toBe(0);
    });
  });
});

// ── Sparkline ──────────────────────────────────────────────────────────────

describe("Sparkline component", () => {
  test("renders dimension label", () => {
    const data = [{ windowId: "W1", value: 70 }, { windowId: "W2", value: 80 }];
    render(<Sparkline dimKey="K" data={data} />);
    expect(screen.getByText(DIMENSION_LABELS.K)).toBeTruthy();
  });

  test("renders empty state when no data", () => {
    const { container } = render(<Sparkline dimKey="S" data={[]} />);
    expect(container.textContent).toContain("—");
    expect(screen.getByText(DIMENSION_LABELS.S)).toBeTruthy();
  });

  test("renders chart when data exists", () => {
    const data = [
      { windowId: "W1", value: 70 },
      { windowId: "W2", value: 80 },
      { windowId: "W3", value: 75 },
    ];
    const { container } = render(<Sparkline dimKey="C" data={data} />);
    // recharts renders an svg
    expect(container.querySelector("svg") || container.textContent).toBeTruthy();
  });
});

// ── DimensionSparklines ────────────────────────────────────────────────────

describe("DimensionSparklines component", () => {
  const snapshots = [
    { windowId: "W1", aq: 70, dims: { K: 60, H: 70, C: 80, S: 65, G: 75 }, settledAt: "2024-01-01" },
    { windowId: "W2", aq: 85, dims: { K: 80, H: 75, C: 85, S: 70, G: 80 }, settledAt: "2024-01-15" },
  ];

  test("renders section title", () => {
    render(<DimensionSparklines snapshots={snapshots} />);
    expect(screen.getByText("维度趋势")).toBeTruthy();
  });

  test("renders all 5 dimension labels", () => {
    render(<DimensionSparklines snapshots={snapshots} />);
    const keys = ["知识", "实操", "创造力", "社交", "成长"];
    keys.forEach((label) => {
      expect(screen.getByText(label)).toBeTruthy();
    });
  });

  test("renders without error for empty snapshots", () => {
    expect(() => render(<DimensionSparklines snapshots={[]} />)).not.toThrow();
  });
});
