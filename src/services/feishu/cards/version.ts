import type { CardVersionDirective, LiveCardRow } from "./types.js";

const SEVEN_DAYS_MS = 7 * 86400 * 1000;

export function resolveCardVersion(
  instance: LiveCardRow,
  currentVersion: string,
  legacyVersion: string,
  clock: () => Date = () => new Date()
): CardVersionDirective {
  if (instance.cardVersion === currentVersion) {
    return "current";
  }
  if (instance.cardVersion === legacyVersion) {
    const age = clock().getTime() - Date.parse(instance.sentAt);
    return age < SEVEN_DAYS_MS ? "legacy" : "expired";
  }
  return "expired";
}
