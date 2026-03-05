/**
 * Error definitions for the Claude Code Conversations connector boundary.
 */

import { MaxError, ErrFacet, NotFound, BadInput } from "@max/core";

// ============================================================================
// Conversations Boundary
// ============================================================================

export const Conversations = MaxError.boundary("conversations");

// ============================================================================
// Error Definitions
// ============================================================================

/** The configured claude directory is invalid. */
export const ErrInvalidClaudeDir = Conversations.define("invalid_claude_dir", {
  customProps: ErrFacet.props<{ path: string }>(),
  facets: [BadInput],
  message: (d) => `${d.path} is not a valid projects directory`,
});

/** A message could not be found in its session's .jsonl file. */
export const ErrMessageNotFound = Conversations.define("message_not_found", {
  customProps: ErrFacet.props<{ messageId: string }>(),
  facets: [NotFound],
  message: (d) => `Message not found: ${d.messageId}`,
});
