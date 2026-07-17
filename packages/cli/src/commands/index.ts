import type { Command } from "../command.js";
import { migrate } from "./migrate.js";
import { seed } from "./seed.js";

export const commands: readonly Command[] = [migrate, seed];
