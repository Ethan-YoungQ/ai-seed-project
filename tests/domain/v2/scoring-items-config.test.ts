import { describe, expect, test } from "vitest";

import {
  SCORING_ITEMS,
  getScoringItemConfig,
  type ScoringItemCode,
  type ScoringDimension
} from "../../../src/domain/v2/scoring-items-config.js";

describe("scoring-items-config", () => {
  test("exactly 15 items", () => {
    const codes = Object.keys(SCORING_ITEMS) as ScoringItemCode[];
    expect(codes).toHaveLength(15);
  });

  test("K dimension per-period cap sum = 20", () => {
    const kItems = Object.values(SCORING_ITEMS).filter((i) => i.dimension === "K");
    const sum = kItems.reduce((acc, i) => acc + i.perPeriodCap, 0);
    expect(sum).toBe(20);
  });

  test("H dimension per-period cap sum = 10", () => {
    const hItems = Object.values(SCORING_ITEMS).filter((i) => i.dimension === "H");
    const sum = hItems.reduce((acc, i) => acc + i.perPeriodCap, 0);
    expect(sum).toBe(10);
  });

  test("C dimension per-period cap sum = 17", () => {
    const cItems = Object.values(SCORING_ITEMS).filter((i) => i.dimension === "C");
    const sum = cItems.reduce((acc, i) => acc + i.perPeriodCap, 0);
    expect(sum).toBe(17);
  });

  test("S dimension per-period cap sum = 8", () => {
    const sItems = Object.values(SCORING_ITEMS).filter((i) => i.dimension === "S");
    const sum = sItems.reduce((acc, i) => acc + i.perPeriodCap, 0);
    expect(sum).toBe(8);
  });

  test("G dimension per-period cap sum = 15", () => {
    const gItems = Object.values(SCORING_ITEMS).filter((i) => i.dimension === "G");
    const sum = gItems.reduce((acc, i) => acc + i.perPeriodCap, 0);
    expect(sum).toBe(15);
  });

  test("five dimensions total sum = 70 (per-period max AQ)", () => {
    const sum = Object.values(SCORING_ITEMS).reduce(
      (acc, i) => acc + i.perPeriodCap,
      0
    );
    expect(sum).toBe(70);
  });

  test("K3 cap is 3 (divergence 8.1 from spec)", () => {
    expect(SCORING_ITEMS.K3.perPeriodCap).toBe(3);
  });

  test("6 items require LLM: K3, K4, C1, C3, H2, G2", () => {
    const llmItems = Object.entries(SCORING_ITEMS)
      .filter(([, cfg]) => cfg.needsLlm)
      .map(([code]) => code)
      .sort();
    expect(llmItems).toEqual(["C1", "C3", "G2", "H2", "K3", "K4"]);
  });

  test("getScoringItemConfig returns config for known codes", () => {
    const cfg = getScoringItemConfig("K3");
    expect(cfg.dimension).toBe("K");
    expect(cfg.perPeriodCap).toBe(3);
    expect(cfg.needsLlm).toBe(true);
  });

  test("getScoringItemConfig throws for unknown code", () => {
    expect(() =>
      getScoringItemConfig("ZZ" as ScoringItemCode)
    ).toThrow(/unknown/i);
  });

  test("ScoringDimension type is exactly K|H|C|S|G", () => {
    const dims: ScoringDimension[] = ["K", "H", "C", "S", "G"];
    expect(dims).toHaveLength(5);
  });
});
