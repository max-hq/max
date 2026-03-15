/**
 * Operation - Named, typed API operation with its handler.
 *
 * Like a Loader, an Operation is both a declaration (name + phantom types)
 * and an implementation (handler). The handler is `(input, ctx) -> output`
 * where ctx is the connector's context, typed by the handler author.
 *
 * At the type level, the operation token carries TInput, TOutput, and
 * TContext for type-safe dispatch via `env.ops.execute(GetUser, { id })`.
 *
 * @example
 * const GetUser = Operation.define({
 *   name: 'acme:user:get',
 *   context: AcmeContext,
 *   async handle(input: { id: string }, ctx: AcmeContext) {
 *     return ctx.client.getUser(input.id)
 *   }
 * })
 */

import { StaticTypeCompanion } from './companion.js'
import { ClassOf } from './type-system-utils.js'

// ============================================================================
// Operation
// ============================================================================

export interface Operation<
  TName extends string = string,
  TInput = unknown,
  TOutput = unknown,
  TContext = unknown,
> {
  readonly name: TName
  readonly handle: (input: TInput, ctx: TContext) => Promise<TOutput>
  readonly context: ClassOf<TContext>
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
  define<TName extends string, TInput, TOutput, TContext>(config: {
    name: TName
    context: ClassOf<TContext>
    handle: (input: TInput, ctx: TContext) => Promise<TOutput>
  }): Operation<TName, TInput, TOutput, TContext> {
    return { name: config.name, context: config.context, handle: config.handle } as Operation<
      TName,
      TInput,
      TOutput,
      TContext
    >
  },
})
