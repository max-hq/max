export class Semaphore {
  private current = 0
  private queue: (() => void)[] = []

  constructor(private readonly max: number) {}

  async acquire(): Promise<void> {
    if (this.current < this.max) {
      this.current++
      return
    }
    return new Promise<void>(resolve => this.queue.push(resolve))
  }

  release(): void {
    const next = this.queue.shift()
    if (next) {
      next() // Transfer slot directly - current count stays the same
    } else {
      this.current--
    }
  }

  /** Number of active slots. */
  get active(): number {
    return this.current
  }

  /** Number of waiters in the queue. */
  get waiting(): number {
    return this.queue.length
  }
}
