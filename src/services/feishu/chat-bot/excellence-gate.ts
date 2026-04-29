/**
 * Excellence Gate — determines whether a student's contribution
 * is worthy of proactive praise from the bot.
 *
 * Design goals:
 * - Only praise truly excellent contributions (not everything)
 * - Rate-limit per student per day and per chat per hour
 * - Avoid being annoying — the bot should add warmth, not noise
 */

import type { SemanticScoreItem } from "../semantic-classifier.js";

// ============================================================================
// Public types
// ============================================================================

export type PraiseLevel = "none" | "nice" | "great" | "outstanding";

export interface ExcellenceDecision {
  shouldPraise: boolean;
  level: PraiseLevel;
  /** Which dimensions scored — used for personalized praise */
  highlights: string[];
  /** Total score across all scored items */
  totalScore: number;
}

// ============================================================================
// Thresholds — tuned for the 9-item LLM scoring system
// ============================================================================

/**
 * Score thresholds for each praise level.
 * - "nice"    (3+):  a solid contribution, worth a quick 👍
 * - "great"   (6+):  clearly above average, deserves recognition
 * - "outstanding" (10+): exceptional, must celebrate
 */
const PRAISE_THRESHOLDS: Record<Exclude<PraiseLevel, "none">, number> = {
  nice: 3,
  great: 6,
  outstanding: 10,
};

// ============================================================================
// Public functions
// ============================================================================

/**
 * Evaluate whether scored items warrant a proactive praise response.
 */
export function evaluateExcellence(items: SemanticScoreItem[]): ExcellenceDecision {
  const totalScore = items.reduce((sum, i) => sum + i.score, 0);
  const highlights = [...new Set(items.map((i) => i.code))];

  if (totalScore >= PRAISE_THRESHOLDS.outstanding) {
    return { shouldPraise: true, level: "outstanding", highlights, totalScore };
  }
  if (totalScore >= PRAISE_THRESHOLDS.great) {
    return { shouldPraise: true, level: "great", highlights, totalScore };
  }
  if (totalScore >= PRAISE_THRESHOLDS.nice) {
    return { shouldPraise: true, level: "nice", highlights, totalScore };
  }

  return { shouldPraise: false, level: "none", highlights, totalScore };
}

// ============================================================================
// Rate limiting — prevent bot from being annoying
// ============================================================================

export interface PraiseRateLimits {
  perStudentPerDay: number;
  perChatPerHour: number;
  /** Minimum seconds between any two praise messages */
  cooldownSeconds: number;
}

export const DEFAULT_PRAISE_RATE_LIMITS: PraiseRateLimits = {
  perStudentPerDay: 3,
  perChatPerHour: 5,
  cooldownSeconds: 120,
};

export interface PraiseRateState {
  /** studentId → count of praises today */
  studentCounts: Map<string, number>;
  /** timestamp of the last praise sent */
  lastPraiseAt: number;
  /** count of praises sent in the current hour window */
  hourCount: number;
  /** start of the current hour window */
  hourWindowStart: number;
}

export function createPraiseRateState(): PraiseRateState {
  return {
    studentCounts: new Map(),
    lastPraiseAt: 0,
    hourCount: 0,
    hourWindowStart: Date.now(),
  };
}

export interface RateCheckResult {
  allowed: boolean;
  reason?: "student_daily_cap" | "chat_hourly_cap" | "cooldown";
  retryAfterSeconds?: number;
}

/**
 * Check if a praise message is within rate limits.
 * Mutates `state` on success.
 */
export function checkPraiseRateLimit(
  state: PraiseRateState,
  studentId: string,
  limits: PraiseRateLimits = DEFAULT_PRAISE_RATE_LIMITS,
): RateCheckResult {
  const now = Date.now();

  // Reset hour window if needed
  if (now - state.hourWindowStart > 3_600_000) {
    state.hourCount = 0;
    state.hourWindowStart = now;
  }

  // Cooldown check
  if (state.lastPraiseAt > 0 && now - state.lastPraiseAt < limits.cooldownSeconds * 1000) {
    const retryAfter = Math.ceil(
      (limits.cooldownSeconds * 1000 - (now - state.lastPraiseAt)) / 1000,
    );
    return { allowed: false, reason: "cooldown", retryAfterSeconds: retryAfter };
  }

  // Chat hourly cap
  if (state.hourCount >= limits.perChatPerHour) {
    return { allowed: false, reason: "chat_hourly_cap" };
  }

  // Student daily cap
  const studentCount = state.studentCounts.get(studentId) ?? 0;
  if (studentCount >= limits.perStudentPerDay) {
    return { allowed: false, reason: "student_daily_cap" };
  }

  // All checks passed — record
  state.lastPraiseAt = now;
  state.hourCount += 1;
  state.studentCounts.set(studentId, studentCount + 1);

  return { allowed: true };
}
