/**
 * AcmeWorkspace Resolver - Maps AcmeWorkspace fields to loaders.
 */

import {
  Loader,
  Resolver,
  EntityInput,
  Page,
  type LoaderName,
} from "@max/core";
import { AcmeUser, AcmeProject, AcmeTask } from "../entities.js";
import { AcmeAppContext } from "../context.js";
import { GetProject, ListTasks } from "../operations.js";

// ============================================================================
// Loaders
// ============================================================================

export const ProjectBasicLoader = Loader.entity({
  name: "acme:project:basic",
  context: AcmeAppContext,
  entity: AcmeProject,

  async load(ref, env) {
    const project = await env.ops.execute(GetProject, { id: ref.id });
    return EntityInput.create(ref, {
      description: project.description || undefined,
      name: project.name,
      owner: AcmeUser.ref(project.ownerId),
      status: project.status,
    });
  },
});

export const ProjectTasksLoader = Loader.collection({
  name: "acme:project:tasks",
  context: AcmeAppContext,
  entity: AcmeProject,
  target: AcmeTask,

  async load(ref, page, env) {
    const tasks = await env.ops.execute(ListTasks, { projectId: ref.id });
    const items = tasks.map((t) =>
      EntityInput.create(AcmeTask.ref(t.id), {
        status: t.status,
        description: t.description || undefined,
        title: t.title,
        priority: t.priority,
      }),
    );
    return Page.from(items, false, undefined);
  },
});

// ============================================================================
// Resolver
// ============================================================================

export const AcmeProjectResolver = Resolver.for(AcmeProject, {
  name: ProjectBasicLoader.field('name'),
  description: ProjectBasicLoader.field('description'),
  status: ProjectBasicLoader.field('status'),
  owner: ProjectBasicLoader.field('owner'),
  tasks: ProjectTasksLoader.field('tasks')
});
