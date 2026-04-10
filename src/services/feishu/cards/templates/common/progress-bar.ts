import type { MarkdownElement } from "./member-badge.js";

export interface ProgressBarInput {
  dimension: "K" | "H" | "C" | "S" | "G";
  current: number;
  cap: number;
}

export function buildProgressBar(input: ProgressBarInput): MarkdownElement {
  const pct = Math.max(0, Math.min(1, input.current / input.cap));
  const filledBlocks = Math.round(pct * 10);
  const bar = "█".repeat(filledBlocks) + "░".repeat(10 - filledBlocks);
  return {
    tag: "markdown",
    content: `${input.dimension} ${bar} ${input.current}/${input.cap}`
  };
}
