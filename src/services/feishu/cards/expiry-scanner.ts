import type { LiveCardRepository } from "./live-card-repository.js";

export interface ExpiryScannerDeps {
  live: LiveCardRepository;
  clock: () => Date;
}

export interface ExpiryScanResult {
  scannedAt: string;
  closedCount: number;
  closedIds: string[];
}

/**
 * Scans for cards approaching Feishu's 14-day retention limit and closes them
 * proactively. Designed to be called hourly.
 */
export function scanAndCloseExpiring(deps: ExpiryScannerDeps): ExpiryScanResult {
  const now = deps.clock();
  const expiring = deps.live.listExpiringWithinDays(now, 2);
  const closedIds: string[] = [];

  for (const row of expiring) {
    deps.live.close(row.id, "expired");
    closedIds.push(row.id);
  }

  return {
    scannedAt: now.toISOString(),
    closedCount: closedIds.length,
    closedIds
  };
}
