/**
 * Execution boundary — shared domain-owned errors for the execution layer.
 *
 * Used by @max/execution-local and @max/execution-sqlite.
 */

import {
  MaxError,
  NotFound,
  HasEntityField,
  HasEntityType,
  ErrFacet
} from "@max/core";

import {TaskId} from "./task.js";


// ============================================================================
// Boundary
// ============================================================================

export const Execution = MaxError.boundary("execution");

// ============================================================================
// Errors
// ============================================================================

/** Entity type not found in the execution registry */
export {ErrUnknownEntityType} from '@max/core'

/** No resolver registered for entity type */
export const ErrNoResolver = Execution.define("no_resolver", {
  facets: [NotFound, HasEntityType],
  message: (d) => `No resolver for entity: ${d.entityType}`,
});

/** No collection loader for field */
export const ErrNoCollectionLoader = Execution.define("no_collection_loader", {
  facets: [NotFound, HasEntityField],
  message: (d) => `No collection loader for field '${d.field}' on ${d.entityType}`,
});

/** Task not found in task store */
export const ErrTaskNotFound = Execution.define("task_not_found", {
  customProps: ErrFacet.props<{taskId: TaskId}>(),
  facets: [NotFound],
  message: (d) => `Task not found: ${d.taskId}`,
});

