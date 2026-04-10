import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { TokenBucket } from "../../../src/services/v2/token-bucket.js";

describe("TokenBucket", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("first acquire resolves immediately when capacity allows", async () => {
    const bucket = new TokenBucket(5);
    const p = bucket.acquire();
    await vi.advanceTimersByTimeAsync(0);
    await expect(p).resolves.toBeUndefined();
  });

  test("acquiring more than capacity queues additional waiters", async () => {
    const bucket = new TokenBucket(2, 2);
    const order: number[] = [];
    const wait = (n: number) =>
      bucket.acquire().then(() => {
        order.push(n);
      });
    void wait(1);
    void wait(2);
    void wait(3);
    await vi.advanceTimersByTimeAsync(0);
    expect(order).toEqual([1, 2]);
    await vi.advanceTimersByTimeAsync(500);
    expect(order).toEqual([1, 2, 3]);
  });

  test("rate limit 1/sec serializes 3 acquires across ~2 seconds", async () => {
    const bucket = new TokenBucket(1, 1);
    const stamps: number[] = [];
    const wait = () =>
      bucket.acquire().then(() => {
        stamps.push(Date.now());
      });
    const p1 = wait();
    const p2 = wait();
    const p3 = wait();
    await vi.advanceTimersByTimeAsync(0);
    expect(stamps).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(stamps).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1000);
    expect(stamps).toHaveLength(3);
    await Promise.all([p1, p2, p3]);
  });

  test("acquire(n) consumes n tokens at once", async () => {
    const bucket = new TokenBucket(2, 4);
    await bucket.acquire(4);
    const p = bucket.acquire(1);
    let resolved = false;
    void p.then(() => {
      resolved = true;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(resolved).toBe(false);
    await vi.advanceTimersByTimeAsync(500);
    expect(resolved).toBe(true);
  });
});
