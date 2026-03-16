import type { FlowController, FlowControllerProvider } from '@max/core'
import type { Limit, LimitStrategy } from '@max/core'
import { SemaphoreFlowController } from './semaphore-flow-controller.js'
import { ErrLimitStrategyConflict } from './errors.js'

/**
 * Local (in-process) FlowControllerProvider.
 *
 * Creates FlowController instances lazily, cached by limit name.
 * Throws if the same name is requested with a different strategy
 * (fail-fast on misconfiguration).
 */
export class LocalFlowControllerProvider implements FlowControllerProvider {
  private controllers = new Map<string, FlowController>()
  private strategies = new Map<string, LimitStrategy>()

  get(limit: Limit): FlowController {
    const existing = this.controllers.get(limit.name)
    if (existing) {
      this.assertConsistentStrategy(limit)
      return existing
    }

    const fc = this.create(limit.strategy)
    this.controllers.set(limit.name, fc)
    this.strategies.set(limit.name, limit.strategy)
    return fc
  }

  private create(strategy: LimitStrategy): FlowController {
    switch (strategy.kind) {
      case 'concurrency':
        return new SemaphoreFlowController(strategy.max)
    }
  }

  private assertConsistentStrategy(limit: Limit): void {
    const prev = this.strategies.get(limit.name)
    if (!prev) return

    const prevDesc = this.describeStrategy(prev)
    const reqDesc = this.describeStrategy(limit.strategy)

    if (prevDesc !== reqDesc) {
      throw ErrLimitStrategyConflict.create({ limitName: limit.name, existing: prevDesc, requested: reqDesc })
    }
  }

  private describeStrategy(s: LimitStrategy): string {
    switch (s.kind) {
      case 'concurrency':
        return `concurrency(${s.max})`
    }
  }
}
