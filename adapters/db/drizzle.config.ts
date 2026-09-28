import { defineConfig } from "drizzle-kit";

// Scans the centralized schema barrel plus the auth engine's own tables;
// outputs migrations to ./drizzle.
export default defineConfig({
  dialect: "postgresql",
  schema: ["./src/schema/index.ts", "./src/schema/better-auth.ts"],
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
});
