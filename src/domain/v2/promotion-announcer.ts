/**
 * promotion-announcer.ts
 *
 * After a window settlement, detects which promotions are "announceable"
 * (1st, 2nd, 3rd person ever to reach each level Lv2-Lv5) and returns
 * the announcement data. Ordinals are written to the DB immediately
 * so the same promotion is never announced twice.
 */

export interface AnnouncementItem {
  ordinal: 1 | 2 | 3;
  memberName: string;
  memberId: string;
  targetLevel: 2 | 3 | 4 | 5;
}

export interface PromotionLite {
  memberId: string;
  fromLevel: number;
  toLevel: number;
  promoted: boolean;
}

export interface AnnouncerDeps {
  getPromotions(windowId: string): PromotionLite[];
  getOrdinals(): Array<{ level: number; ordinal: number }>;
  insertOrdinal(input: {
    level: number;
    ordinal: number;
    memberId: string;
    memberName: string;
    windowId: string;
    announcedAt: string;
  }): void;
  getMemberName(memberId: string): string | null;
  now(): string;
}

/**
 * Detect announceable promotions for a given settlement window.
 *
 * Only promotions where `promoted === true && toLevel > fromLevel` and
 * `toLevel >= 2` are candidates. For each candidate, checks how many
 * people have already been announced for that level (across all past
 * windows). If < 3, assigns the next ordinal, writes it to the DB,
 * and includes it in the result.
 *
 * The iteration order follows the window's member processing order
 * (sorted by member ID), which determines who gets 1st vs 2nd vs 3rd
 * within a single settlement window.
 */
export function detectAnnounceablePromotions(
  windowId: string,
  deps: AnnouncerDeps
): AnnouncementItem[] {
  const promotions = deps.getPromotions(windowId);
  const existingOrdinals = deps.getOrdinals();

  // Build a map: level -> max ordinal (0 if none)
  const ordinalByLevel: Record<number, number> = { 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const entry of existingOrdinals) {
    ordinalByLevel[entry.level] = entry.ordinal;
  }

  const result: AnnouncementItem[] = [];

  for (const prom of promotions) {
    if (!prom.promoted) continue;
    if (prom.toLevel <= prom.fromLevel) continue;
    if (prom.toLevel < 2 || prom.toLevel > 5) continue;

    const level = prom.toLevel as 2 | 3 | 4 | 5;
    const currentCount = ordinalByLevel[level];
    if (currentCount >= 3) continue;

    const ordinal = (currentCount + 1) as 1 | 2 | 3;
    ordinalByLevel[level] = ordinal;

    const memberName = deps.getMemberName(prom.memberId) ?? "未知";
    deps.insertOrdinal({
      level,
      ordinal,
      memberId: prom.memberId,
      memberName,
      windowId,
      announcedAt: deps.now(),
    });

    result.push({ ordinal, memberName, memberId: prom.memberId, targetLevel: level });
  }

  return result;
}
