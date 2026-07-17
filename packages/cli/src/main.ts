// Dispatcher, separated from the bin entry so it is testable: takes argv,
// returns the exit code, never calls process.exit itself.
import pkg from "../package.json" with { type: "json" };
import { commands } from "./commands/index.js";

function usage(): string {
  const width = Math.max(...commands.map((c) => c.name.length));
  return [
    "Usage: headless-lms <command>",
    "",
    "Commands:",
    ...commands.map((c) => `  ${c.name.padEnd(width)}  ${c.description}`),
    "",
    "Options:",
    "  -h, --help     Show this help",
    "  -v, --version  Print the CLI version",
  ].join("\n");
}

export async function main(argv: readonly string[]): Promise<number> {
  const [name, ...args] = argv;

  if (!name) {
    console.error(usage());
    return 1;
  }
  if (name === "help" || name === "--help" || name === "-h") {
    console.log(usage());
    return 0;
  }
  if (name === "--version" || name === "-v") {
    console.log(pkg.version);
    return 0;
  }

  const command = commands.find((c) => c.name === name);
  if (!command) {
    console.error(`Unknown command: ${name}\n\n${usage()}`);
    return 1;
  }

  try {
    await command.run(args);
    return 0;
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    return 1;
  }
}
