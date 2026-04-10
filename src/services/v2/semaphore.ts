type Waiter = () => void;

export class Semaphore {
  private readonly _max: number;
  private _inFlight: number = 0;
  private readonly queue: Waiter[] = [];

  constructor(max: number) {
    if (max <= 0) {
      throw new Error("max must be > 0");
    }
    this._max = max;
  }

  get max(): number {
    return this._max;
  }

  get inFlight(): number {
    return this._inFlight;
  }

  acquire(): Promise<void> {
    if (this._inFlight < this._max) {
      this._inFlight += 1;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      this.queue.push(resolve);
    });
  }

  release(): void {
    if (this._inFlight === 0) {
      throw new Error("semaphore release called with no in-flight holders");
    }
    const next = this.queue.shift();
    if (next) {
      next();
      return;
    }
    this._inFlight -= 1;
  }
}
