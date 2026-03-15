/**
 * Seeder - Cold-start bootstrapper for sync.
 *
 * Creates root entities and returns a SyncPlan describing how to populate them.
 * The executor holds resolvers; the seeder only needs the engine and context.
 *
 * @example
 * const AcmeSeeder = Seeder.create({
 *   context: AcmeAppContext,
 *   async seed(env) {
 *     const rootRef = AcmeRoot.ref("root");
 *     await env.engine.store(EntityInput.create(rootRef, {}));
 *     return SyncPlan.create([
 *       Step.forRoot(rootRef).loadCollection("users"),
 *       Step.forAll(AcmeUser).loadFields("name", "email"),
 *     ]);
 *   },
 * });
 */

import {StaticTypeCompanion} from "./companion.js";
import type {ContextDefAny} from "./context-def.js";
import type {SyncPlan} from "./sync-plan.js";
import {ClassOf} from "./type-system-utils.js";
import type {SeederEnv} from "./env.js";

// ============================================================================
// Seeder Interface
// ============================================================================

export interface Seeder<TContext extends ContextDefAny = ContextDefAny> {
  /** Context class required by this seeder */
  readonly context: ClassOf<TContext>;

  /** Create root entities and return a sync plan */
  seed(env: SeederEnv<TContext>): Promise<SyncPlan>;
}

/** Any seeder */
export type SeederAny = Seeder<ContextDefAny>;

// ============================================================================
// Seeder Implementation (internal)
// ============================================================================

class SeederImpl<TContext extends ContextDefAny> implements Seeder<TContext> {
  constructor(
    readonly context: ClassOf<TContext>,
    private seedFn: (env: SeederEnv<TContext>) => Promise<SyncPlan>,
  ) {}

  seed(env: SeederEnv<TContext>): Promise<SyncPlan> {
    return this.seedFn(env);
  }
}

// ============================================================================
// Seeder Static Companion
// ============================================================================

export const Seeder = StaticTypeCompanion({
  create<TContext extends ContextDefAny>(config: {
    context: ClassOf<TContext>;
    seed: (env: SeederEnv<TContext>) => Promise<SyncPlan>;
  }): Seeder<TContext> {
    return new SeederImpl(
      config.context,
      config.seed,
    );
  },
});
