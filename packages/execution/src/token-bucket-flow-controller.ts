import type { FlowController } from '@max/core'
import { TokenBucket } from './token-bucket.js'

/** Rate-based flow controller. Limits throughput to N operations per second. */
export class TokenBucketFlowController implements FlowController {
  private bucket: TokenBucket

  constructor(perSecond: number) {
    this.bucket = new TokenBucket(perSecond)
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.bucket.take()
    return fn()
  }
}
