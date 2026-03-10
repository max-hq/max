import {StaticTypeCompanion} from "@max/core";

/** Result of CLI.execute() - output was already written to the provided sink. */
export type ExecuteResult = {
  exitCode: number;
  stderr?: string;
  completions?: string[];
};

/** Handle returned by CLI.execute(). Allows aborting from outside. */
export interface ExecuteHandle {
  /** Resolves when the command finishes (or is aborted). */
  readonly result: Promise<ExecuteResult>
  /** Abort the current command. No-op if already finished. */
  abort(): void
}

export const ExecuteHandle = StaticTypeCompanion({
  // simple lifter for code discovery / clarity only
  create(handle: ExecuteHandle): ExecuteHandle {
    return handle
  }
})

export type CliRequest = {
  kind: "run" | "complete";
  argv: readonly string[];
  shell?: string;
  cwd?: string;
  color?: boolean;
};
