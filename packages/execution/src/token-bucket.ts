/**
 * TokenBucket - Rate-based throttle primitive.
 *
 * Tokens refill at a fixed rate. Each take() consumes one token.
 * If no tokens are available, take() blocks until one refills.
 *
 * Unlike Semaphore, there is no release(). Tokens are consumed,
 * not borrowed — the bucket refills on its own.
 */
export class TokenBucket {
  private tokens: number
  private lastRefill: number
  private queue: (() => void)[] = []
  private timer: ReturnType<typeof setTimeout> | null = null

  constructor(
    private readonly perSecond: number,
  ) {
    this.tokens = perSecond
    this.lastRefill = Date.now()
  }

  async take(): Promise<void> {
    this.refill()
    if (this.tokens >= 1) {
      this.tokens--
      return
    }
    return new Promise<void>(resolve => {
      this.queue.push(resolve)
      this.scheduleRefill()
    })
  }

  private refill(): void {
    const now = Date.now()
    const elapsed = (now - this.lastRefill) / 1000
    const newTokens = elapsed * this.perSecond
    if (newTokens >= 1) {
      const consumed = Math.floor(newTokens)
      this.tokens = Math.min(this.tokens + consumed, this.perSecond)
      this.lastRefill += (consumed / this.perSecond) * 1000
    }
  }

  private scheduleRefill(): void {
    if (this.timer) return
    // Time until next token: 1/perSecond seconds
    const intervalMs = Math.ceil(1000 / this.perSecond)
    this.timer = setTimeout(() => {
      this.timer = null
      this.refill()
      this.drainQueue()
    }, intervalMs)
  }

  private drainQueue(): void {
    while (this.queue.length > 0 && this.tokens >= 1) {
      this.tokens--
      const next = this.queue.shift()!
      next()
    }
    if (this.queue.length > 0) {
      this.scheduleRefill()
    }
  }
}
