/**
 * Onboarding — Step pipeline for connector setup.
 *
 * An OnboardingFlow is an ordered list of steps that collect config and credentials
 * from a user. The platform interprets and renders each step type (CLI prompts, web UI, etc).
 *
 * Key property: credentials go directly to the credential store during collection.
 * They never appear in the accumulated config. The flow produces only plain config (TConfig).
 */

import { CustomHardBrand, StaticTypeCompanion } from '@max/core'
import type { CredentialStore } from "./credential-store.js";
import type { StringCredential } from "./credential.js";

// ============================================================================
// OnboardingContext
// ============================================================================

/** Platform services available to onboarding steps. */
export interface OnboardingContext {
  readonly credentialStore: CredentialStore;
}

// ============================================================================
// FieldDescriptor
// ============================================================================

/** Describes a single config field collected during InputStep. */
export interface FieldDescriptor {
  readonly label: string;
  readonly type: "string" | "number" | "boolean";
  readonly required?: boolean;
  readonly default?: string | number | boolean;
}

// ============================================================================
// DynamicString
// ============================================================================

/**
 * A string that may depend on previously-accumulated onboarding values.
 *
 * Use a plain string for static text. Use a function when the text needs to
 * reference values collected in earlier steps (e.g. embedding a project ID
 * into setup URLs).
 */
export type DynamicString<T extends Record<string, unknown> = Record<string, unknown>> =
  string | ((accumulated: T) => string);

// ============================================================================
// OnboardingPrompter
// ============================================================================

/**
 * Minimal I/O capability for interactive onboarding steps.
 *
 * This is a subset of the full Prompter interface, defined here so that
 * connector authors can use it without depending on the CLI package.
 * The runner passes the real Prompter, which structurally satisfies this.
 */
export interface OnboardingPrompter {
  ask(message: string, options?: { secret?: boolean }): Promise<string>;
  write(text: string): void;
}

// ============================================================================
// SelectOption
// ============================================================================

/** A single choice in a SelectStep. */
export interface SelectOption {
  readonly label: string;
  readonly value: string;
}

// ============================================================================
// Step Definitions (what connector authors provide)
// ============================================================================

/** Author-provided fields for an InputStep. */
export interface InputStepDef {
  readonly label: string;
  readonly description?: DynamicString;
  readonly fields?: Record<string, FieldDescriptor>;
  readonly credentials?: Record<string, StringCredential>;
}

/** Author-provided fields for a ValidationStep. */
export interface ValidationStepDef {
  readonly label: string;
  readonly validate: (
    accumulated: Record<string, unknown>,
    ctx: OnboardingContext,
  ) => Promise<void>;
}

/** Author-provided fields for a SelectStep. */
export interface SelectStepDef {
  readonly label: string;
  readonly field: string;
  readonly multiple?: boolean;
  readonly options: (
    accumulated: Record<string, unknown>,
    ctx: OnboardingContext,
  ) => Promise<SelectOption[]>;
}

/** Author-provided fields for a CustomStep. */
export interface CustomStepDef {
  readonly label: string;
  readonly execute: (
    accumulated: Record<string, unknown>,
    ctx: OnboardingContext,
    prompter: OnboardingPrompter,
  ) => Promise<Record<string, unknown>>;
}

// ============================================================================
// Step Types (Def + framework fields, discriminated union on `kind`)
// ============================================================================

/**
 * InputStep - Declarative field and credential collection.
 *
 * `fields` produce plain config values (added to accumulated state).
 * `credentials` produce secrets (written to credential store, NOT accumulated).
 */
export interface InputStep extends InputStepDef {
  readonly kind: "input";
  readonly when?: (accumulated: Record<string, unknown>) => boolean;
}

/**
 * ValidationStep - Runs a check against accumulated state + credential store.
 *
 * Throws on failure. The runner catches the error and presents it to the user.
 */
export interface ValidationStep extends ValidationStepDef {
  readonly kind: "validation";
  readonly when?: (accumulated: Record<string, unknown>) => boolean;
}

/**
 * SelectStep - Presents dynamically-fetched options, user picks one (or many).
 *
 * The selected value is added to accumulated state under `field`.
 */
export interface SelectStep extends SelectStepDef {
  readonly kind: "select";
  readonly when?: (accumulated: Record<string, unknown>) => boolean;
}

/**
 * CustomStep - Escape hatch for arbitrary async work with optional user I/O.
 *
 * Receives the OnboardingPrompter so it can display progress messages and
 * ask follow-up questions. Returns additions to the accumulated state.
 */
export interface CustomStep extends CustomStepDef {
  readonly kind: "custom";
  readonly when?: (accumulated: Record<string, unknown>) => boolean;
}

/** Union of all onboarding step types. */
export type OnboardingStep = InputStep | ValidationStep | SelectStep | CustomStep;

// ============================================================================
// TypedStep - type-safe step references
// ============================================================================

/**
 * An OnboardingStep branded with the accumulated state available after it runs.
 *
 * At runtime this is just an OnboardingStep - the brand is a phantom type that
 * lets `.after()` extract what earlier steps have collected so later steps get
 * typed `accumulated` parameters.
 *
 * Uses CustomHardBrand from core - the "mark" is the accumulated state type.
 */
export type TypedStep<
  TStep extends OnboardingStep = OnboardingStep,
  TAcc extends Record<string, unknown> = Record<string, unknown>,
> = CustomHardBrand<TStep, TAcc>;

/** Extract the accumulated state type from a TypedStep. */
export type AccumulatedFrom<T> =
  T extends CustomHardBrand<OnboardingStep, infer A extends Record<string, unknown>> ? A : Record<string, unknown>;

// Type-level mapping from FieldDescriptor.type to TypeScript types.
type FieldTypeMap = { string: string; number: number; boolean: boolean };

/** Infer the accumulated value types produced by a set of field descriptors. */
type InferFieldValues<T extends Record<string, FieldDescriptor>> = {
  [K in keyof T]: FieldTypeMap[T[K]["type"]]
};

// ============================================================================
// Step Factories
// ============================================================================

export const InputStep = StaticTypeCompanion({
  create<TFields extends Record<string, FieldDescriptor> = {}>(
    opts: Omit<InputStepDef, "fields"> & { fields?: TFields },
  ): TypedStep<InputStep, InferFieldValues<TFields>> {
    return { kind: "input", ...opts } as unknown as TypedStep<InputStep, InferFieldValues<TFields>>;
  },

  /**
   * Create an InputStep that runs after a previous step.
   *
   * `_prev` is used only for type inference - it tells TypeScript what values
   * have been accumulated so that `description` callbacks and other dynamic
   * properties receive a typed `accumulated` parameter.
   */
  after<TPrev extends TypedStep<any, any>, TFields extends Record<string, FieldDescriptor> = {}>(
    _prev: TPrev,
    opts: Omit<InputStepDef, "description" | "fields"> & {
      description?: DynamicString<AccumulatedFrom<TPrev>>;
      fields?: TFields;
      when?: (accumulated: AccumulatedFrom<TPrev>) => boolean;
    },
  ): TypedStep<InputStep, AccumulatedFrom<TPrev> & InferFieldValues<TFields>> {
    return { kind: "input", ...opts } as unknown as TypedStep<InputStep, AccumulatedFrom<TPrev> & InferFieldValues<TFields>>;
  },
});

export const ValidationStep = StaticTypeCompanion({
  create(opts: ValidationStepDef): TypedStep<ValidationStep> {
    return { kind: "validation", ...opts } as unknown as TypedStep<ValidationStep>;
  },

  after<TPrev extends TypedStep<any, any>>(
    _prev: TPrev,
    opts: Omit<ValidationStepDef, "validate"> & {
      validate: (accumulated: AccumulatedFrom<TPrev>, ctx: OnboardingContext) => Promise<void>;
      when?: (accumulated: AccumulatedFrom<TPrev>) => boolean;
    },
  ): TypedStep<ValidationStep, AccumulatedFrom<TPrev>> {
    return { kind: "validation", ...opts } as unknown as TypedStep<ValidationStep, AccumulatedFrom<TPrev>>;
  },
});

export const SelectStep = StaticTypeCompanion({
  create<F extends string>(
    opts: Omit<SelectStepDef, "field"> & { field: F },
  ): TypedStep<SelectStep, Record<F, string>> {
    return { kind: "select", ...opts } as unknown as TypedStep<SelectStep, Record<F, string>>;
  },

  after<TPrev extends TypedStep<any, any>, F extends string>(
    _prev: TPrev,
    opts: Omit<SelectStepDef, "field" | "options"> & {
      field: F;
      options: (accumulated: AccumulatedFrom<TPrev>, ctx: OnboardingContext) => Promise<SelectOption[]>;
      when?: (accumulated: AccumulatedFrom<TPrev>) => boolean;
    },
  ): TypedStep<SelectStep, AccumulatedFrom<TPrev> & Record<F, string>> {
    return { kind: "select", ...opts } as unknown as TypedStep<SelectStep, AccumulatedFrom<TPrev> & Record<F, string>>;
  },
});

export const CustomStep = StaticTypeCompanion({
  create(opts: CustomStepDef): TypedStep<CustomStep> {
    return { kind: "custom", ...opts } as unknown as TypedStep<CustomStep>;
  },

  after<TPrev extends TypedStep<any, any>, TAdded extends Record<string, unknown> = {}>(
    _prev: TPrev,
    opts: Omit<CustomStepDef, "execute"> & {
      execute: (
        accumulated: AccumulatedFrom<TPrev>,
        ctx: OnboardingContext,
        prompter: OnboardingPrompter,
      ) => Promise<TAdded>;
      when?: (accumulated: AccumulatedFrom<TPrev>) => boolean;
    },
  ): TypedStep<CustomStep, AccumulatedFrom<TPrev> & TAdded> {
    return { kind: "custom", ...opts } as unknown as TypedStep<CustomStep, AccumulatedFrom<TPrev> & TAdded>;
  },
});

// ============================================================================
// OnboardingFlow
// ============================================================================

/**
 * OnboardingFlow — Ordered list of steps that produce TConfig.
 *
 * The TConfig generic is a phantom type that ensures type alignment
 * between the flow's output and ConnectorModule.initialise(config: TConfig, ...).
 */
export interface OnboardingFlow<TConfig = unknown> {
  readonly steps: readonly OnboardingStep[];
}

export type OnboardingFlowAny = OnboardingFlow<unknown>;

export const OnboardingFlow = StaticTypeCompanion({
  create<TConfig = unknown>(steps: OnboardingStep[]): OnboardingFlow<TConfig> {
    return { steps: Object.freeze([...steps]) };
  },
  empty<TConfig = unknown>(): OnboardingFlow<TConfig> {
    return { steps: [] }
  },

  InputStep,
  ValidationStep,
  SelectStep,
  CustomStep,
});
