/**
 * PlanExpander - Expands a SyncPlan into a full task graph with dependencies.
 *
 * All sync-step tasks are registered upfront with blockedBy/parentId
 * relationships. Concurrent groups get a synthetic "sync-group" parent
 * that completes when all children complete.
 */

import type {
  SyncPlan,
  SyncStep,
  SyncPlanEntry,
  ConcurrentSteps,
  StepTarget,
  StepOperation,
  EntityType,
} from "@max/core";
import type {SyncStepPayload, SerialisedStepTarget, SerialisedStepOperation} from "./task.js";
import type {SyncId} from "./sync-handle.js";
import type {TaskTemplate} from "./task-store.js";
import {ErrUnknownTargetKind} from "./errors.js";

// ============================================================================
// PlanExpander
// ============================================================================

export class PlanExpander {
  private tempCounter = 0;

  private nextTempId(): string {
    return `temp-${++this.tempCounter}`;
  }

  /**
   * Expand entire plan into a task graph with dependencies.
   * Returns TaskTemplates with temp IDs for bulk enqueue.
   */
  expandPlan(plan: SyncPlan, syncId: SyncId): TaskTemplate[] {
    const templates: TaskTemplate[] = [];
    let prevId: string | null = null;

    for (const entry of plan.steps) {
      if (entry.kind === "concurrent") {
        // Create synthetic group task (starts in awaiting_children)
        const groupId = this.nextTempId();
        templates.push({
          tempId: groupId,
          syncId,
          state: "awaiting_children",
          payload: { kind: "sync-group" },
        });

        // Create child tasks for each step in the concurrent group
        for (const step of entry.steps) {
          const stepId = this.nextTempId();
          templates.push({
            tempId: stepId,
            syncId,
            state: prevId ? "new" : "pending",
            blockedBy: prevId ?? undefined,
            parentId: groupId,
            payload: this.serialiseStep(step),
          });
        }

        prevId = groupId;
      } else {
        const stepId = this.nextTempId();
        templates.push({
          tempId: stepId,
          syncId,
          state: prevId ? "new" : "pending",
          blockedBy: prevId ?? undefined,
          payload: this.serialiseStep(entry),
        });
        prevId = stepId;
      }
    }

    return templates;
  }

  // ============================================================================
  // Serialisation
  // ============================================================================

  serialiseStep(step: SyncStep): SyncStepPayload {
    return {
      kind: "sync-step",
      target: this.serialiseTarget(step.target),
      operation: this.serialiseOperation(step.operation),
    };
  }

  private serialiseTarget(target: StepTarget): SerialisedStepTarget {
    const kind = target.kind
    switch (kind) {
      case "forAll":
        return { kind: "forAll", entityType: target.entity.name };
      case "forRoot":
        return { kind: "forRoot", entityType: target.ref.entityType, refKey: target.ref.toKey() };
      case "forOne":
        return { kind: "forOne", entityType: target.ref.entityType, refKey: target.ref.toKey() };
      default:
        throw ErrUnknownTargetKind.create({ targetKind: kind satisfies never });
    }
  }

  private serialiseOperation(operation: StepOperation): SerialisedStepOperation {
    switch (operation.kind) {
      case "loadFields":
        return { kind: "loadFields", fields: operation.fields };
      case "loadCollection":
        return { kind: "loadCollection", field: operation.field };
    }
  }
}
