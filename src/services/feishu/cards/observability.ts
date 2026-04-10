/**
 * Simple in-memory counters for card protocol operations.
 * Use resetMetrics() in tests to ensure isolation.
 */

export interface CardMetrics {
  cardActionsReceived: number;
  cardActionsSucceeded: number;
  cardActionsFailed: number;
  patchesSent: number;
  patchesFailed: number;
  deadLettersCreated: number;
  expiryScansRun: number;
  cardsExpired: number;
}

const metrics: CardMetrics = {
  cardActionsReceived: 0,
  cardActionsSucceeded: 0,
  cardActionsFailed: 0,
  patchesSent: 0,
  patchesFailed: 0,
  deadLettersCreated: 0,
  expiryScansRun: 0,
  cardsExpired: 0
};

export function incrementMetric(key: keyof CardMetrics, delta = 1): void {
  metrics[key] += delta;
}

export function getMetrics(): Readonly<CardMetrics> {
  return Object.freeze({ ...metrics });
}

export function resetMetrics(): void {
  metrics.cardActionsReceived = 0;
  metrics.cardActionsSucceeded = 0;
  metrics.cardActionsFailed = 0;
  metrics.patchesSent = 0;
  metrics.patchesFailed = 0;
  metrics.deadLettersCreated = 0;
  metrics.expiryScansRun = 0;
  metrics.cardsExpired = 0;
}
