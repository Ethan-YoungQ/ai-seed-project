import type { WarningLevel, WarningRecord } from "./types";

export function resolveWarningLevel(index: number): WarningLevel {
  if (index >= 3) {
    return "elimination";
  }

  if (index === 2) {
    return "warning";
  }

  return "reminder";
}

export function nextMemberStatusFromWarnings(records: WarningRecord[]) {
  const last = records.at(-1);
  if (!last) {
    return "active" as const;
  }

  return last.level === "elimination" ? ("eliminated" as const) : ("warned" as const);
}
