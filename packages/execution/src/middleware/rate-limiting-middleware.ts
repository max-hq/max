import type { FlowControllerProvider } from '@max/core'
import type { OperationMiddleware } from '../operation-dispatcher.js'

export function rateLimitingMiddleware(provider: FlowControllerProvider): OperationMiddleware {
  return async (op, _input, next) => {
    const limit = op.limit
    if (!limit) return next()

    return provider.get(limit).run(next)
  }
}
