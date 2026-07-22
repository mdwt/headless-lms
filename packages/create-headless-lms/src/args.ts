export interface CliArgs {
  name: string | undefined;
  yes: boolean;
}

export function parseArgs(argv: string[]): CliArgs {
  const yes = argv.includes("--yes") || argv.includes("-y");
  const name = argv.find((a) => !a.startsWith("-"));
  return { name, yes };
}

/** Returns an error message, or undefined when valid (npm package name rules, the subset we need). */
export function validateName(name: string): string | undefined {
  if (!name) {
    return "project name is required";
  }
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(name)) {
    return "use lowercase letters, digits, ., _ and - (must start with a letter or digit)";
  }
  if (name.length > 214) {
    return "name too long (npm limit is 214)";
  }
  return undefined;
}
