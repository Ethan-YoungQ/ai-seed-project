import type { WarningLevel, WarningRecord } from "./types.js";

export function resolveWarningLevel(index: number): WarningLevel {
  if (index >= 3) {
    return "elimination";
  }

  if (index === 2) {
    return "warning";
  }

  return "reminder";
}

export function buildWarningKey(
  memberId: string,
  sessionId: string | undefined,
  violationType: WarningRecord["violationType"]
) {
  return [memberId, sessionId ?? "", violationType].join(":");
}

export function classifyWarningViolation(scoreReason: string) {
  const normalized = scoreReason.toLowerCase();

  if (normalized.includes("late_submission")) {
    return "late_submission" as const;
  }

  if (
    normalized.includes("missing_evidence") ||
    normalized.includes("missing_process") ||
    normalized.includes("missing_result") ||
    normalized.includes("manual_no_count") ||
    normalized.includes("manual_override")
  ) {
    return "invalid_submission" as const;
  }

  return null;
}

export function nextMemberStatusFromWarnings(records: WarningRecord[]) {
  const activeWarnings = records.filter((warning) => !warning.resolvedFlag);
  const last = activeWarnings.at(-1);

  if (!last) {
    return "active" as const;
  }

  return activeWarnings.some((warning) => warning.level === "elimination")
    ? ("eliminated" as const)
    : ("warned" as const);
}
