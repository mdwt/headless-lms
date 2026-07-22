import type { Command } from "../command.js";
import { migrate } from "./migrate.js";

export const commands: readonly Command[] = [migrate];
