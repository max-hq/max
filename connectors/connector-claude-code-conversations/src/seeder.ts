/**
 * ConversationsSeeder — Cold-start bootstrapper for the conversations connector.
 *
 * Creates the root entity and returns a plan to discover projects,
 * sessions, and messages.
 */

import { Seeder, SyncPlan, Step, EntityInput } from "@max/core";
import { Root, Project, Session } from "./entities.js";
import { CCConversationsContext } from "./context.js";

export const ConversationsSeeder = Seeder.create({
  context: CCConversationsContext,

  async seed(_ctx, engine) {
    const rootRef = Root.ref("root");
    await engine.store(EntityInput.create(rootRef, {}));

    return SyncPlan.create([
      // 1. Discover all projects from root
      Step.forRoot(rootRef).loadCollection("projects"),
      // 2. Load project metadata
      Step.forAll(Project).loadFields("name", "path"),
      // 3. Discover sessions per project
      Step.forAll(Project).loadCollection("sessions"),
      // 4. Load session metadata
      Step.forAll(Session).loadFields(
        "title", "summary", "firstMessage", "model",
        "gitBranch", "cwd", "version",
        "startedAt", "endedAt", "messageCount", "project",
      ),
      // 5. Discover messages per session
      Step.forAll(Session).loadCollection("messages"),
    ]);
  },
});
