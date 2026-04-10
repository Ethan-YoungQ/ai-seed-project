import { describe, test, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { getLevelConfig } from "../../src/lib/levels";
import { DIMENSION_COLORS } from "../../src/lib/colors";
import { RankBadge } from "../../src/components/ui/RankBadge";
import { LevelPill } from "../../src/components/ui/LevelPill";
import { DimensionMiniBar } from "../../src/components/ui/DimensionMiniBar";
import { HpBar } from "../../src/components/ui/HpBar";
import { NeonCard } from "../../src/components/ui/NeonCard";

// Test utility functions used by UI components
describe("getLevelConfig utility (used by LevelPill and TierBanner)", () => {
  test("returns correct config for level 1", () => {
    const config = getLevelConfig(1);
    expect(config.level).toBe(1);
    expect(config.name).toBe("AI 潜力股");
    expect(config.emoji).toBe("🌱");
    expect(config.color).toBe("#6b7280");
  });

  test("returns correct config for level 5 (top tier)", () => {
    const config = getLevelConfig(5);
    expect(config.level).toBe(5);
    expect(config.name).toBe("AI 奇点玩家");
    expect(config.emoji).toBe("💎");
    expect(config.color).toBe("#f59e0b");
  });

  test("level 3 has blue color", () => {
    const config = getLevelConfig(3);
    expect(config.color).toBe("#3b82f6");
  });
});

describe("DIMENSION_COLORS (used by DimensionMiniBar)", () => {
  test("all 5 dimension keys have colors", () => {
    const keys = ["K", "H", "C", "S", "G"] as const;
    keys.forEach((key) => {
      expect(DIMENSION_COLORS[key]).toBeTruthy();
      expect(DIMENSION_COLORS[key]).toMatch(/^#[0-9a-f]{6}$/i);
    });
  });

  test("K dimension has neon green color", () => {
    expect(DIMENSION_COLORS.K).toBe("#00ff88");
  });

  test("C dimension has purple color", () => {
    expect(DIMENSION_COLORS.C).toBe("#a855f7");
  });
});

// RankBadge rendering tests
describe("RankBadge component", () => {
  test("renders medal for rank 1", () => {
    const { container } = render(<RankBadge rank={1} />);
    expect(container.textContent).toContain("🥇");
  });

  test("renders medal for rank 2", () => {
    const { container } = render(<RankBadge rank={2} />);
    expect(container.textContent).toContain("🥈");
  });

  test("renders medal for rank 3", () => {
    const { container } = render(<RankBadge rank={3} />);
    expect(container.textContent).toContain("🥉");
  });

  test("renders plain number for rank > 3", () => {
    const { container } = render(<RankBadge rank={5} />);
    expect(container.textContent).toContain("#5");
  });

  test("renders plain number for rank 10", () => {
    const { container } = render(<RankBadge rank={10} />);
    expect(container.textContent).toContain("#10");
  });
});

// LevelPill rendering tests
describe("LevelPill component", () => {
  test("renders level name and emoji for level 1", () => {
    const { container } = render(<LevelPill level={1} />);
    expect(container.textContent).toContain("🌱");
    expect(container.textContent).toContain("AI 潜力股");
  });

  test("renders level name and emoji for level 5", () => {
    const { container } = render(<LevelPill level={5} />);
    expect(container.textContent).toContain("💎");
    expect(container.textContent).toContain("AI 奇点玩家");
  });
});

// DimensionMiniBar rendering tests
describe("DimensionMiniBar component", () => {
  test("renders 5 bars for 5 dimensions", () => {
    const dims = { K: 80, H: 60, C: 70, S: 50, G: 90 };
    const { container } = render(<DimensionMiniBar dimensions={dims} />);
    // Each dimension renders a div with a [title] attribute
    const bars = container.querySelectorAll("[title]");
    expect(bars.length).toBe(5);
  });

  test("bar titles contain dimension keys and values", () => {
    const dims = { K: 80, H: 60, C: 70, S: 50, G: 90 };
    const { container } = render(<DimensionMiniBar dimensions={dims} />);
    const bars = container.querySelectorAll("[title]");
    const titles = Array.from(bars).map((b) => b.getAttribute("title"));
    expect(titles).toContain("K: 80");
    expect(titles).toContain("G: 90");
  });
});

// HpBar rendering tests
describe("HpBar component", () => {
  test("renders label when provided", () => {
    render(<HpBar value={75} max={100} label="HP" />);
    expect(screen.getByText("HP")).toBeTruthy();
    expect(screen.getByText("75/100")).toBeTruthy();
  });

  test("renders without label — container has no text", () => {
    const { container } = render(<HpBar value={50} max={100} />);
    // Label divs should not be rendered
    expect(container.textContent).toBe("");
  });
});

// NeonCard rendering tests
describe("NeonCard component", () => {
  test("renders children", () => {
    render(<NeonCard><span>test content</span></NeonCard>);
    expect(screen.getByText("test content")).toBeTruthy();
  });

  test("calls onClick when clicked", () => {
    let clicked = false;
    const { container } = render(
      <NeonCard onClick={() => { clicked = true; }}>
        <span>clickable</span>
      </NeonCard>
    );
    const card = container.firstChild as HTMLElement;
    card.click();
    expect(clicked).toBe(true);
  });
});
