interface Waiter {
  cost: number;
  resolve: () => void;
}

export class TokenBucket {
  private readonly ratePerSec: number;
  private readonly capacity: number;
  private tokens: number;
  private lastRefillAtMs: number;
  private readonly queue: Waiter[] = [];
  private scheduledAtMs: number | null = null;

  constructor(ratePerSec: number, capacity?: number) {
    if (ratePerSec <= 0) {
      throw new Error("ratePerSec must be > 0");
    }
    this.ratePerSec = ratePerSec;
    this.capacity = capacity ?? ratePerSec;
    this.tokens = this.capacity;
    this.lastRefillAtMs = Date.now();
  }

  acquire(n: number = 1): Promise<void> {
    if (n <= 0) {
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      this.queue.push({ cost: n, resolve });
      this.drain();
    });
  }

  private refill(): void {
    const nowMs = Date.now();
    const elapsedSec = (nowMs - this.lastRefillAtMs) / 1000;
    if (elapsedSec > 0) {
      this.tokens = Math.min(
        this.capacity,
        this.tokens + elapsedSec * this.ratePerSec,
      );
      this.lastRefillAtMs = nowMs;
    }
  }

  private drain(): void {
    this.refill();
    while (this.queue.length > 0) {
      const head = this.queue[0];
      if (this.tokens >= head.cost) {
        this.tokens -= head.cost;
        this.queue.shift();
        head.resolve();
      } else {
        this.schedule(head.cost);
        return;
      }
    }
  }

  private schedule(cost: number): void {
    const deficit = cost - this.tokens;
    const waitMs = Math.max(1, Math.ceil((deficit / this.ratePerSec) * 1000));
    const targetAt = Date.now() + waitMs;
    if (this.scheduledAtMs !== null && this.scheduledAtMs <= targetAt) {
      return;
    }
    this.scheduledAtMs = targetAt;
    setTimeout(() => {
      this.scheduledAtMs = null;
      this.drain();
    }, waitMs);
  }
}
