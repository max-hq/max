export class Signal {
  private waiters: (() => void)[] = []
  private notified = false

  /** Block until notified. Returns immediately if a notification is pending. */
  async wait(): Promise<void> {
    if (this.notified) {
      this.notified = false
      return
    }
    return new Promise(resolve => this.waiters.push(resolve))
  }

  /** Wake all waiting workers. If none are waiting, the next wait() returns immediately. */
  notifyAll(): void {
    if (this.waiters.length === 0) {
      this.notified = true
      return
    }
    const waiters = this.waiters.splice(0)
    for (const w of waiters) w()
  }
}
