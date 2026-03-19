import type { FlowController } from '@max/core'

/**
 * Chains multiple FlowControllers. Each wraps the next.
 *
 * Order matters: controllers[0] gates first (outermost), controllers[n-1]
 * gates last (innermost, closest to the work). For rate + concurrency,
 * pass rate first so you don't hold a concurrency slot while waiting
 * for a rate token.
 */
export class CompositeFlowController implements FlowController {
  constructor(private controllers: FlowController[]) {}

  async run<T>(fn: () => Promise<T>): Promise<T> {
    const chain = this.controllers.reduceRight<() => Promise<T>>(
      (inner, fc) => () => fc.run(inner),
      fn,
    )
    return chain()
  }
}
