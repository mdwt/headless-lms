import { runMigrations } from "@headless-lms/server";
import type { Command } from "../command.js";

export const migrate: Command = {
  name: "migrate",
  description: "Apply the bundled Drizzle migrations to DATABASE_URL",
  async run() {
    await runMigrations(process.env.DATABASE_URL ?? "");
    console.log("Migrations applied.");
  },
};
