/**
 * Error boundary for the plan parser.
 */

import { BadInput, ErrFacet, MaxError } from '@max/core'

const PlanParserBoundary = MaxError.boundary('plan-parser')

/** The plan expression could not be parsed. */
export const ErrPlanParse = PlanParserBoundary.define('parse_failed', {
  customProps: ErrFacet.props<{ expression: string; reason: string; index: number }>(),
  facets: [BadInput],
  message: (d) => `Invalid sync plan — ${d.reason} (at position ${d.index})`,
})
