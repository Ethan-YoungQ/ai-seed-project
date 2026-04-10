import { describe, test, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { PromotionHistory } from "../../src/components/member/PromotionHistory";
import { PromotionCard } from "../../src/components/member/PromotionCard";
import { PromotionHero } from "../../src/components/promotion/PromotionHero";
import { ConditionChecklist } from "../../src/components/promotion/ConditionChecklist";

const samplePromotion = {
  fromLevel: 2,
  toLevel: 3,
  windowId: "W5",
  promotedAt: "2024-03-01T10:00:00Z",
  reason: "Completed all weekly tasks with high scores.",
};

const demotionPromotion = {
  fromLevel: 3,
  toLevel: 2,
  windowId: "W6",
  promotedAt: "2024-04-01T10:00:00Z",
  reason: "Below threshold for 2 consecutive windows.",
};

// ── PromotionHistory ─────────────────────────────────────────────────────────

describe("PromotionHistory component", () => {
  test("renders section title", () => {
    render(
      <MemoryRouter>
        <PromotionHistory promotions={[samplePromotion]} memberId="m1" />
      </MemoryRouter>
    );
    expect(screen.getByText("段位变动记录")).toBeTruthy();
  });

  test("renders empty state when no promotions", () => {
    render(
      <MemoryRouter>
        <PromotionHistory promotions={[]} memberId="m1" />
      </MemoryRouter>
    );
    expect(screen.getByText("暂无段位变动记录")).toBeTruthy();
  });

  test("renders one card per promotion", () => {
    const { container } = render(
      <MemoryRouter>
        <PromotionHistory
          promotions={[samplePromotion, demotionPromotion]}
          memberId="m1"
        />
      </MemoryRouter>
    );
    expect(container.textContent).toContain("W5");
    expect(container.textContent).toContain("W6");
  });
});

// ── PromotionCard ─────────────────────────────────────────────────────────────

describe("PromotionCard component", () => {
  function renderCard(promo = samplePromotion) {
    return render(
      <MemoryRouter>
        <PromotionCard promotion={promo} memberId="m1" />
      </MemoryRouter>
    );
  }

  test("renders window ID", () => {
    const { container } = renderCard();
    expect(container.textContent).toContain("W5");
  });

  test("renders '晋级' direction label for promotion", () => {
    renderCard(samplePromotion);
    expect(screen.getByText("晋级")).toBeTruthy();
  });

  test("renders '降级' direction label for demotion", () => {
    renderCard(demotionPromotion);
    expect(screen.getByText("降级")).toBeTruthy();
  });

  test("renders reason excerpt", () => {
    renderCard();
    expect(screen.getByText(/Completed all weekly tasks/)).toBeTruthy();
  });

  test("renders '查看详情' link text", () => {
    renderCard();
    expect(screen.getByText(/查看详情/)).toBeTruthy();
  });

  test("truncates long reasons to 60 chars + ellipsis", () => {
    const longReason = "A".repeat(100);
    renderCard({ ...samplePromotion, reason: longReason });
    const text = screen.getByText(/A+…/);
    expect(text.textContent?.length).toBeLessThanOrEqual(62);
  });
});

// ── PromotionHero ─────────────────────────────────────────────────────────────

describe("PromotionHero component", () => {
  function renderHero(from = 2, to = 3) {
    return render(
      <PromotionHero
        fromLevel={from}
        toLevel={to}
        windowId="W5"
        promotedAt="2024-03-01T10:00:00Z"
        memberName="李四"
      />
    );
  }

  test("renders member name", () => {
    renderHero();
    expect(screen.getByText("李四")).toBeTruthy();
  });

  test("renders section title '段位变动回放'", () => {
    renderHero();
    expect(screen.getByText("段位变动回放")).toBeTruthy();
  });

  test("renders '晋级' label for promotion", () => {
    renderHero(2, 3);
    expect(screen.getByText("晋级")).toBeTruthy();
  });

  test("renders '降级' label for demotion", () => {
    renderHero(4, 3);
    expect(screen.getByText("降级")).toBeTruthy();
  });

  test("renders window ID", () => {
    const { container } = renderHero();
    expect(container.textContent).toContain("W5");
  });

  test("renders both level names", () => {
    renderHero(2, 3);
    expect(screen.getByText(/AI 行动派/)).toBeTruthy();
    expect(screen.getByText(/AI 探索者/)).toBeTruthy();
  });
});

// ── ConditionChecklist ────────────────────────────────────────────────────────

describe("ConditionChecklist component", () => {
  test("renders checklist items from valid JSON", () => {
    const jsonReason = JSON.stringify([
      { label: "完成周任务", met: true },
      { label: "AQ分数达标", met: false },
    ]);
    render(<ConditionChecklist reason={jsonReason} />);
    expect(screen.getByText("完成周任务")).toBeTruthy();
    expect(screen.getByText("AQ分数达标")).toBeTruthy();
  });

  test("renders detail text when provided in JSON", () => {
    const jsonReason = JSON.stringify([
      { label: "任务完成率", met: true, detail: "完成率 90%" },
    ]);
    render(<ConditionChecklist reason={jsonReason} />);
    expect(screen.getByText("完成率 90%")).toBeTruthy();
  });

  test("falls back to plain text for non-JSON reason", () => {
    const plainReason = "This is a plain text reason for the promotion.";
    render(<ConditionChecklist reason={plainReason} />);
    expect(screen.getByText(plainReason)).toBeTruthy();
  });

  test("falls back to plain text for invalid JSON structure", () => {
    const invalidJson = '{"key": "value"}';
    render(<ConditionChecklist reason={invalidJson} />);
    expect(screen.getByText(invalidJson)).toBeTruthy();
  });

  test("renders section title '变动条件'", () => {
    render(<ConditionChecklist reason="some reason" />);
    expect(screen.getByText("变动条件")).toBeTruthy();
  });
});
