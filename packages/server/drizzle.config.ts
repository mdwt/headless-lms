import { defineConfig } from "drizzle-kit";

// Scans the centralized schema barrel plus the auth adapter's generated tables;
// outputs migrations to ./drizzle.
export default defineConfig({
  dialect: "postgresql",
  schema: ["./src/adapters/db/schema/index.ts", "./src/adapters/auth/schema.ts"],
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
});
