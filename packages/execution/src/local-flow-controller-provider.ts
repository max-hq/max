import { NoOpFlowController, type FlowController, type FlowControllerProvider } from '@max/core'
import type { Limit } from '@max/core'
import { SemaphoreFlowController } from './semaphore-flow-controller.js'
import { TokenBucketFlowController } from './token-bucket-flow-controller.js'
import { CompositeFlowController } from './composite-flow-controller.js'
import { ErrLimitStrategyConflict } from './errors.js'

/**
 * Local (in-process) FlowControllerProvider.
 *
 * Creates FlowController instances lazily, cached by limit name.
 * Throws if the same name is requested with different configuration
 * (fail-fast on misconfiguration).
 */
export class LocalFlowControllerProvider implements FlowControllerProvider {
  private controllers = new Map<string, FlowController>()
  private configs = new Map<string, { concurrent?: number; rate?: number }>()

  get(limit: Limit): FlowController {
    const existing = this.controllers.get(limit.name)
    if (existing) {
      this.assertConsistent(limit)
      return existing
    }

    const fc = this.create(limit)
    this.controllers.set(limit.name, fc)
    this.configs.set(limit.name, { concurrent: limit.concurrent, rate: limit.rate })
    return fc
  }

  private create(limit: Limit): FlowController {
    const controllers: FlowController[] = []

    // Rate gate first — don't hold a concurrency slot while waiting for a token
    if (limit.rate) controllers.push(new TokenBucketFlowController(limit.rate))
    if (limit.concurrent) controllers.push(new SemaphoreFlowController(limit.concurrent))

    if (controllers.length === 0) return new NoOpFlowController()
    if (controllers.length === 1) return controllers[0]
    return new CompositeFlowController(controllers)
  }

  private assertConsistent(limit: Limit): void {
    const prev = this.configs.get(limit.name)
    if (!prev) return

    const prevDesc = this.describe(prev)
    const reqDesc = this.describe(limit)

    if (prevDesc !== reqDesc) {
      throw ErrLimitStrategyConflict.create({ limitName: limit.name, existing: prevDesc, requested: reqDesc })
    }
  }

  private describe(cfg: { concurrent?: number; rate?: number }): string {
    const parts: string[] = []
    if (cfg.concurrent) parts.push(`concurrent(${cfg.concurrent})`)
    if (cfg.rate) parts.push(`rate(${cfg.rate})`)
    return parts.join('+') || 'none'
  }
}
