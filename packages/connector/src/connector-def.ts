/**
 * ConnectorDef — Static descriptor of a connector type.
 *
 * Carries schema, identity, version, scopes, resolvers, and seeder.
 * Pure data — no factory methods, no runtime logic.
 */

import {
  StaticTypeCompanion,
  Inspect,
  type SeederAny,
  type ResolverAny,
  type OperationAny,
  Id,
} from "@max/core";
import type { Schema } from "@max/core";
import type { OnboardingFlow } from "./onboarding.js";

// ============================================================================
// ConnectorDef Interface
// ============================================================================

export type ConnectorName = Id<'connector-name'>

export interface ConnectorDef<TConfig = unknown> {
  readonly name: ConnectorName;
  readonly displayName: string;
  readonly description: string;
  readonly icon: string;
  readonly version: string;
  readonly scopes: readonly string[];
  readonly schema: Schema;
  readonly onboarding: OnboardingFlow<TConfig>;
  readonly seeder: SeederAny;
  readonly resolvers: readonly ResolverAny[];
  /**
   * Operations declared by this connector.
   *
   * Currently used for discovery and display (e.g. listing a connector's
   * API surface). Dispatch still goes through the operation token directly
   * via op.handle. If we later sever the coupling between an operation's
   * definition and its handler, this array becomes the resolution source.
   */
  readonly operations: readonly OperationAny[];
}

export type ConnectorDefAny = ConnectorDef<unknown>;

// ============================================================================
// ConnectorDef Implementation (internal)
// ============================================================================

class ConnectorDefImpl<TConfig> implements ConnectorDef<TConfig> {
  readonly name: ConnectorName;
  readonly displayName: string;
  readonly description: string;
  readonly icon: string;
  readonly version: string;
  readonly scopes: readonly string[];
  readonly schema: Schema;
  readonly onboarding: OnboardingFlow<TConfig>;
  readonly seeder: SeederAny;
  readonly resolvers: readonly ResolverAny[];
  readonly operations: readonly OperationAny[];

  static {
    Inspect(this, (self) => ({
      format: "ConnectorDef(%s v%s)",
      params: [self.name, self.version],
    }));
  }

  constructor(opts: {
    name: ConnectorName;
    displayName: string;
    description: string;
    icon: string;
    version: string;
    scopes: readonly string[];
    schema: Schema;
    onboarding: OnboardingFlow<TConfig>;
    seeder: SeederAny;
    resolvers: readonly ResolverAny[];
    operations?: readonly OperationAny[];
  }) {
    this.name = opts.name;
    this.displayName = opts.displayName;
    this.description = opts.description;
    this.icon = opts.icon;
    this.version = opts.version;
    this.scopes = Object.freeze([...opts.scopes]);
    this.schema = opts.schema;
    this.onboarding = opts.onboarding;
    this.seeder = opts.seeder;
    this.resolvers = Object.freeze([...opts.resolvers]);
    this.operations = Object.freeze([...(opts.operations ?? [])]);
  }
}

// ============================================================================
// ConnectorDef Static Methods (namespace merge)
// ============================================================================

export const ConnectorDef = StaticTypeCompanion({
  /** Create a new ConnectorDef */
  create<TConfig = unknown>(opts: {
    name: ConnectorName;
    displayName: string;
    description: string;
    icon: string;
    version: string;
    scopes: string[];
    schema: Schema;
    onboarding: OnboardingFlow<TConfig>;
    seeder: SeederAny;
    resolvers: ResolverAny[];
    operations?: OperationAny[];
  }): ConnectorDef<TConfig> {
    return new ConnectorDefImpl(opts);
  },
});
