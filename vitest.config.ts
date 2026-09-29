import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      {
        find: "@headless-lms/core/types",
        replacement: r("./packages/core/src/types/index.ts"),
      },
      {
        find: "@headless-lms/core/schemas",
        replacement: r("./packages/core/src/types/schemas/index.ts"),
      },
      {
        find: "@headless-lms/editor",
        replacement: r("./packages/editor/src/index.ts"),
      },
      {
        find: "@headless-lms/server",
        replacement: r("./packages/server/src/index.ts"),
      },
      {
        find: "@headless-lms/plugin-slack",
        replacement: r("./plugins/slack/src/index.ts"),
      },
      {
        find: "@headless-lms/adapter-auth",
        replacement: r("./adapters/auth/src/index.ts"),
      },
      {
        find: "@headless-lms/adapter-db/schema/better-auth",
        replacement: r("./adapters/db/src/schema/better-auth.ts"),
      },
      {
        find: "@headless-lms/adapter-db",
        replacement: r("./adapters/db/src/index.ts"),
      },
      {
        find: "@headless-lms/adapter-defaults/events/outbox-relay",
        replacement: r("./adapters/defaults/src/events/outbox-relay.ts"),
      },
      {
        find: "@headless-lms/adapter-defaults/logging/request-context",
        replacement: r("./adapters/defaults/src/logging/request-context.ts"),
      },
      {
        find: "@headless-lms/adapter-defaults/email",
        replacement: r("./adapters/defaults/src/email/index.ts"),
      },
      {
        find: "@headless-lms/adapter-defaults/storage",
        replacement: r("./adapters/defaults/src/storage/index.ts"),
      },
      {
        find: "@headless-lms/adapter-defaults/events",
        replacement: r("./adapters/defaults/src/events/index.ts"),
      },
      {
        find: "@headless-lms/adapter-defaults/logging",
        replacement: r("./adapters/defaults/src/logging/index.ts"),
      },
      {
        find: "@headless-lms/adapter-defaults/workflows",
        replacement: r("./adapters/defaults/src/workflows/index.ts"),
      },
      {
        find: "@headless-lms/adapter-defaults/webhooks",
        replacement: r("./adapters/defaults/src/webhooks/index.ts"),
      },
      {
        find: /^@headless-lms\/core\/shared\/([a-z-]+)$/,
        replacement: r("./packages/core/src/shared/$1.ts"),
      },
      {
        find: /^@headless-lms\/core\/reporting\/([a-z-]+)$/,
        replacement: r("./packages/core/src/reporting/$1/index.ts"),
      },
      {
        find: /^@headless-lms\/core\/([a-z-]+)$/,
        replacement: r("./packages/core/src/$1/index.ts"),
      },
    ],
  },
  test: {
    environment: "node",
    include: ["**/src/**/*.test.{ts,tsx}"],
    exclude: ["**/node_modules/**", "**/dist/**"],
  },
});
