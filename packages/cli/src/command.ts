/** A subcommand of `headless-lms`. Register new commands in commands/index.ts. */
export interface Command {
  name: string;
  description: string;
  /** Extra argv after the command name (flags, positionals). Throw to fail — the runner prints the message and exits 1. */
  run(args: string[]): Promise<void>;
}
