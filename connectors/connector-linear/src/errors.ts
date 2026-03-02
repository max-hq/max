/**
 * Error definitions for the linear connector boundary.
 */

import { MaxError, ErrFacet, InvariantViolated } from "@max/core";

// ============================================================================
// Linear Boundary
// ============================================================================

export const Linear = MaxError.boundary("linear");

// ============================================================================
// Error Definitions
// ============================================================================

/** Client accessed before start() was called — lifecycle violation. */
export const ErrLinearNotStarted = Linear.define("not_started", {
  facets: [InvariantViolated],
  message: () => "LinearClient not started — call start() first",
});

/** HTTP-level error from the Linear API (non-2xx response). */
export const ErrLinearApiError = Linear.define("api_error", {
  customProps: ErrFacet.props<{ status: number; statusText: string }>(),
  facets: [],
  message: (d) => `Linear API error: ${d.status} ${d.statusText}`,
});

/** GraphQL-level error from the Linear API. */
export const ErrLinearGraphqlError = Linear.define("graphql_error", {
  customProps: ErrFacet.props<{ graphqlMessage: string }>(),
  facets: [],
  message: (d) => `Linear GraphQL error: ${d.graphqlMessage}`,
});
