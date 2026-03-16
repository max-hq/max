/**
 * Operation - Named, typed API operation with its handler.
 *
 * Like a Loader, an Operation is both a declaration (name + phantom types)
 * and an implementation (handler). The handler is `(input, env) -> output`
 * where env is the platform-provided environment carrying the connector's context.
 *
 * At the type level, the operation token carries TInput, TOutput, and
 * TContext for type-safe dispatch via `env.ops.execute(GetUser, { id })`.
 *
 * @example
 * const GetUser = Operation.define({
 *   name: 'acme:user:get',
 *   context: AcmeAppContext,
 *   async handle(input: { id: string }, env) {
 *     return env.ctx.api.client.getUser(input.id)
 *   }
 * })
 */

import { StaticTypeCompanion } from './companion.js'
import { ClassOf } from './type-system-utils.js'
import type { OperationEnv } from './env.js'
import type { ContextDefAny } from './context-def.js'
import type { Limit } from './limit.js'

// ============================================================================
// Operation
// ============================================================================

export interface Operation<
  TName extends string = string,
  TInput = unknown,
  TOutput = unknown,
  TContext extends ContextDefAny = ContextDefAny,
> {
  readonly name: TName
  readonly handle: (input: TInput, env: OperationEnv<TContext>) => Promise<TOutput>
  readonly context: ClassOf<TContext>
  readonly limit?: Limit
  /** @internal - phantom, not present at runtime */
  readonly _input?: TInput
  /** @internal - phantom, not present at runtime */
  readonly _output?: TOutput
}

export type OperationAny = Operation<string, any, any, any>

// ============================================================================
// Type Helpers
// ============================================================================

export type OperationInputOf<T> = T extends Operation<any, infer I, any, any> ? I : never
export type OperationOutputOf<T> = T extends Operation<any, any, infer O, any> ? O : never

// ============================================================================
// Operation Companion
// ============================================================================

export const Operation = StaticTypeCompanion({
  define<TName extends string, TInput, TOutput, TContext extends ContextDefAny>(config: {
    name: TName
    context: ClassOf<TContext>
    limit?: Limit
    handle: (input: TInput, env: OperationEnv<TContext>) => Promise<TOutput>
  }): Operation<TName, TInput, TOutput, TContext> {
    return { name: config.name, context: config.context, limit: config.limit, handle: config.handle } as Operation<
      TName,
      TInput,
      TOutput,
      TContext
    >
  },
})
