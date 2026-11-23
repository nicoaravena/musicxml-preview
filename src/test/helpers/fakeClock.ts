import { Clock } from "../../preview/previewManager";

/** Manual clock: timers fire only when the test advances time. */
export class FakeClock implements Clock {
  private now = 0;
  private nextId = 1;
  private readonly timers = new Map<number, { at: number; callback: () => void }>();

  setTimeout(callback: () => void, ms: number): unknown {
    const id = this.nextId++;
    this.timers.set(id, { at: this.now + ms, callback });
    return id;
  }

  clearTimeout(handle: unknown): void {
    this.timers.delete(handle as number);
  }

  /** Move time forward, firing due timers in order. */
  advance(ms: number): void {
    const target = this.now + ms;
    for (;;) {
      const due = [...this.timers.entries()]
        .filter(([, timer]) => timer.at <= target)
        .sort(([, a], [, b]) => a.at - b.at)[0];
      if (!due) {
        break;
      }
      const [id, timer] = due;
      this.timers.delete(id);
      this.now = timer.at;
      timer.callback();
    }
    this.now = target;
  }
}
