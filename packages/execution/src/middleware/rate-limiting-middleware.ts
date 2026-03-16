import type { OperationMiddleware } from '../operation-dispatcher.js'
import { Semaphore } from '../semaphore.js'

export function rateLimitingMiddleware(): OperationMiddleware {
  const semaphores = new Map<string, Semaphore>()

  return async (op, _input, next) => {
    const limit = op.limit
    if (!limit) return next()

    let sem = semaphores.get(limit.name)
    if (!sem) {
      sem = new Semaphore(limit.concurrent)
      semaphores.set(limit.name, sem)
    }

    await sem.acquire()
    try {
      return await next()
    } finally {
      sem.release()
    }
  }
}
