import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Walks the lines of .env.example and returns
 * { key, comment } when the key appears on its own line
 * with a comment line immediately above it (skipping blanks
 * and section-header comment lines that start with "# ---").
 */
function findKeyWithComment(
  lines: string[],
  key: string
): { key: string; comment: string } | null {
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed.startsWith(`${key}=`) && trimmed !== key) continue;

    // Walk backwards to find the nearest comment, skipping blanks
    let commentLine: string | null = null;
    for (let j = i - 1; j >= 0; j--) {
      const prev = lines[j].trim();
      if (prev === "") continue;
      if (prev.startsWith("#")) {
        commentLine = prev;
        break;
      }
      break;
    }

    if (commentLine) {
      return { key, comment: commentLine };
    }
    return null;
  }
  return null;
}

describe(".env.example shape", () => {
  const envExamplePath = resolve(
    import.meta.dirname ?? ".",
    "../../.env.example"
  );
  const content = readFileSync(envExamplePath, "utf-8");
  const lines = content.split("\n");

  const requiredKeys = [
    "LLM_CONCURRENCY",
    "LLM_RATE_LIMIT_PER_SEC",
    "LLM_POLL_INTERVAL_MS",
    "LLM_TASK_TIMEOUT_MS",
    "LLM_MAX_ATTEMPTS",
    "BOOTSTRAP_OPERATOR_OPEN_IDS",
  ];

  for (const key of requiredKeys) {
    it(`contains ${key} with a comment above it`, () => {
      const found = findKeyWithComment(lines, key);
      expect(found).not.toBeNull();
      expect(found!.key).toBe(key);
      expect(found!.comment.startsWith("#")).toBe(true);
    });
  }

  it("uses the correct case for all keys", () => {
    for (const key of requiredKeys) {
      const hasCorrectCase = lines.some(
        (line) =>
          line.trim().startsWith(`${key}=`) || line.trim() === key
      );
      expect(hasCorrectCase, `expected ${key} in correct case`).toBe(true);
    }
  });
});
