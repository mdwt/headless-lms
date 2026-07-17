import { runSeed } from "@headless-lms/server";
import type { Command } from "../command.js";

export const seed: Command = {
  name: "seed",
  description: "Seed random data across every domain",
  async run() {
    await runSeed(process.env.DATABASE_URL ?? "");
    console.log("Seed complete.");
  },
};
