// The command registry — explicit imports, no filesystem scanning, so the
// bundle stays static and `--help` always matches what actually ships.
// Adding a command: create commands/<name>.ts exporting a Command, list it here.
import type { Command } from "../command.js";
import { migrate } from "./migrate.js";
import { seed } from "./seed.js";

export const commands: readonly Command[] = [migrate, seed];
