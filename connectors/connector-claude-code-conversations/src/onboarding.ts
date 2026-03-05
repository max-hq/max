/**
 * Claude Code Conversations onboarding flow.
 *
 * Collects the path to the .claude directory (defaults to ~/.claude)
 * and validates that it contains a projects/ subdirectory.
 */

import { homedir } from "node:os";
import { stat } from "node:fs/promises";
import { join } from "node:path";
import { OnboardingFlow, InputStep, ValidationStep } from "@max/connector";
import type { CCConversationsConfig } from "./config.js";

const DEFAULT_CLAUDE_DIR = join(homedir(), ".claude");

export const ConversationsOnboarding = OnboardingFlow.create<CCConversationsConfig>([
  InputStep.create({
    label: "Claude directory",
    description: `Path to your .claude directory (default: ${DEFAULT_CLAUDE_DIR})`,
    fields: {
      claudeDir: {
        label: "Claude directory path",
        type: "string",
        required: false,
        default: DEFAULT_CLAUDE_DIR,
      },
    },
  }),

  ValidationStep.create({
    label: "Verify directory",
    async validate(accumulated) {
      const claudeDir = (accumulated.claudeDir as string) || DEFAULT_CLAUDE_DIR;
      const projectsDir = join(claudeDir, "projects");
      const s = await stat(projectsDir);
      if (!s.isDirectory()) {
        throw new Error(`${projectsDir} is not a directory`);
      }
    },
  }),
]);
