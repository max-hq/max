/**
 * Switch - Type-safe discriminated union matching with exhaustive case coverage.
 *
 * Compile-time: exhaustive case enforcement via TypeScript's type system.
 * Runtime: descriptive error when the discriminant value doesn't match any case.
 *
 * Symbols:
 * - Switch.else - opt out of exhaustiveness, catch unhandled cases
 * - Switch.noMatch - keep exhaustiveness, override the runtime error
 */
import {Core, InvariantViolated} from "./errors/errors.js";
import {ErrFacet} from "./max-error.js";

// ============================================================================
// Symbols
// ============================================================================

const elseSymbol: unique symbol = Symbol("Switch.else");
const noMatch: unique symbol = Symbol("Switch.noMatch");

// ============================================================================
// Error
// ============================================================================

export const ErrUnmatchedSwitch = Core.define("unmatched_switch", {
  customProps: ErrFacet.props<{ key: string; actual: string; expected: string }>(),
  facets: [InvariantViolated],
  message: (d) =>
    `Switch(${d.key}): unexpected value "${d.actual}" (expected: ${d.expected})`,
});

// ============================================================================
// Types
// ============================================================================

type ExhaustiveCases<T, K extends string & keyof T, R> = {
  [V in T[K] & string]: (value: Extract<T, Record<K, V>>) => R;
};

// ============================================================================
// Switch Function
// ============================================================================

interface SwitchFn {
  /** Exhaustive + custom noMatch handler: all cases required, custom error for runtime mismatches */
  <T, K extends keyof T & string, R>(
    input: T,
    key: K,
    cases: ExhaustiveCases<T, K, R> & { [noMatch]: (value: T) => NoInfer<R> },
  ): R;

  /** Partial + else handler: some cases handled, else catches the remainder */
  <T, K extends keyof T & string, R>(
    input: T,
    key: K,
    cases: Partial<ExhaustiveCases<T, K, R>> & { [elseSymbol]: (value: T) => R },
  ): R;

  /** Exhaustive (default): all cases required, throws ErrUnmatchedSwitch on runtime mismatch */
  <T, K extends keyof T & string, R>(
    input: T,
    key: K,
    cases: ExhaustiveCases<T, K, R>,
  ): R;

  /** Catch-all for unhandled discriminant values at runtime */
  readonly else: typeof elseSymbol;

  /** Custom handler for runtime values that shouldn't exist according to types */
  readonly noMatch: typeof noMatch;
}

function switchImpl(
  input: Record<string, unknown>,
  key: string,
  cases: Record<string | symbol, Function>,
): unknown {
  const discriminant = input[key];

  if (discriminant != null && Object.hasOwn(cases, discriminant as PropertyKey)) {
    return (cases as any)[discriminant as string](input);
  }

  if (elseSymbol in cases) return (cases as any)[elseSymbol](input);
  if (noMatch in cases) return (cases as any)[noMatch](input);

  const expected = Object.keys(cases).join(" | ");
  throw ErrUnmatchedSwitch.create({
    key,
    actual: String(discriminant),
    expected,
  });
}

/** Type-safe discriminated union matching with exhaustive case coverage. */
export const Switch: SwitchFn = Object.assign(switchImpl, {
  else: elseSymbol,
  noMatch,
}) as SwitchFn;
