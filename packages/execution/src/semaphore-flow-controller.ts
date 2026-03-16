import type { FlowController, FlowToken } from '@max/core'
import { Semaphore } from './semaphore.js'

/** Semaphore-backed concurrency gate for task-level parallelism. */
export class SemaphoreFlowController implements FlowController {
  private semaphore: Semaphore

  constructor(concurrency: number) {
    this.semaphore = new Semaphore(concurrency)
  }

  async acquire(): Promise<FlowToken> {
    await this.semaphore.acquire()
    return {}
  }

  release(): void {
    this.semaphore.release()
  }
}
