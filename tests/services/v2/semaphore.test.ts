import { describe, expect, test } from "vitest";

import { Semaphore } from "../../../src/services/v2/semaphore.js";

describe("Semaphore", () => {
  test("acquires up to max without blocking", async () => {
    const sem = new Semaphore(3);
    await sem.acquire();
    await sem.acquire();
    await sem.acquire();
    expect(sem.inFlight).toBe(3);
    expect(sem.max).toBe(3);
  });

  test("next acquire blocks until release is called", async () => {
    const sem = new Semaphore(1);
    await sem.acquire();
    let resolved = false;
    const p = sem.acquire().then(() => {
      resolved = true;
    });
    await Promise.resolve();
    expect(resolved).toBe(false);
    sem.release();
    await p;
    expect(resolved).toBe(true);
  });

  test("waiters resolve FIFO", async () => {
    const sem = new Semaphore(1);
    await sem.acquire();
    const order: number[] = [];
    const a = sem.acquire().then(() => order.push(1));
    const b = sem.acquire().then(() => order.push(2));
    const c = sem.acquire().then(() => order.push(3));
    sem.release();
    await a;
    sem.release();
    await b;
    sem.release();
    await c;
    expect(order).toEqual([1, 2, 3]);
  });

  test("release with no in-flight holders throws", () => {
    const sem = new Semaphore(2);
    expect(() => sem.release()).toThrow(/release/i);
  });

  test("inFlight never exceeds max", async () => {
    const sem = new Semaphore(2);
    await sem.acquire();
    await sem.acquire();
    expect(sem.inFlight).toBe(2);
    const p = sem.acquire();
    expect(sem.inFlight).toBe(2);
    sem.release();
    await p;
    expect(sem.inFlight).toBe(2);
  });
});
