/** Result of CLI.execute() - output was already written to the provided sink. */
export type ExecuteResult = {
  exitCode: number;
  stderr?: string;
  completions?: string[];
};

export type CliRequest = {
  kind: "run" | "complete";
  argv: readonly string[];
  shell?: string;
  cwd?: string;
  color?: boolean;
};
