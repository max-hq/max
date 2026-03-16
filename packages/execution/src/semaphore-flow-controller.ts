import type { FlowController } from '@max/core'
import { Semaphore } from './semaphore.js'

/** Semaphore-backed concurrency gate. */
export class SemaphoreFlowController implements FlowController {
  private semaphore: Semaphore

  constructor(concurrency: number) {
    this.semaphore = new Semaphore(concurrency)
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.semaphore.acquire()
    try {
      return await fn()
    } finally {
      this.semaphore.release()
    }
  }
}
