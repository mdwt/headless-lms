/* Boundary enforcement for the hexagonal architecture.
 *
 * Element types (by folder):
 *   core      packages/server/src/core/<context>/**   — framework-free domain
 *   reporting packages/server/src/reporting/**         — read layer (composed cross-context reads)
 *   adapters  packages/server/src/adapters/**          — outbound infra
 *   composition packages/server/src/composition/**     — wiring
 *   inbound   packages/server/src/{http,cli,workers,cron}/**
 *
 * Rules:
 *   - A context may import another context ONLY via its index.ts (no deep imports).
 *   - core/ may not import adapters/, composition/, inbound, reporting, frameworks, or drizzle.
 *   - reporting/ may import core context public surfaces; it owns no domain rules.
 *   - adapters/ own the Drizzle schema (adapters/db/schema) and repositories;
 *     they may import core ports and reporting ports.
 */
// Business bounded contexts (everything under core/ except shared/).
const CONTEXTS = [
  "identity",
  "organizations",
  "content",
  "entitlements",
  "progress",
  "assets",
  "integrations",
];

// A context file may import a sibling context ONLY through its public index.ts.
// ESLint's no-restricted-imports group matcher supports `*` and exact paths, but
// NOT negation (`!`) or brace expansion — so the deny-list is enumerated.
// `../shared/ports.js` (cross-cutting ports) is intentionally absent → allowed.
const CROSS_CONTEXT_DEEP_IMPORTS = [
  ...["service", "model", "types", "events"].map((f) => `../*/${f}.js`),
  ...CONTEXTS.map((c) => `../${c}/ports.js`),
];

module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  parserOptions: { ecmaVersion: 2022, sourceType: "module" },
  plugins: ["@typescript-eslint", "boundaries"],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:boundaries/recommended",
  ],
  settings: {
    // Resolve ESM `.js` specifiers back to their `.ts` sources so boundaries can
    // classify cross-context imports (otherwise deep-import violations slip through).
    "import/resolver": {
      typescript: {
        project: [
          "apps/api/tsconfig.json",
          "apps/web/tsconfig.json",
          "packages/types/tsconfig.json",
          "packages/server/tsconfig.json",
        ],
      },
    },
    "boundaries/include": ["packages/server/src/**/*", "apps/api/src/**/*"],
    "boundaries/elements": [
      {
        type: "core",
        pattern: "packages/server/src/core/*",
        mode: "folder",
        capture: ["context"],
      },
      {
        type: "reporting",
        pattern: "packages/server/src/reporting/*",
        mode: "folder",
        capture: ["context"],
      },
      { type: "adapters", pattern: "packages/server/src/adapters/*", mode: "folder" },
      // Third-party integrations — not the domain (that's core/integrations),
      // one folder per integration (directory name = integration id). Loaded at
      // startup by composition; each satisfies the core Integration port.
      { type: "plugins", pattern: "apps/api/src/plugins/*", mode: "folder" },
      { type: "composition", pattern: "packages/server/src/composition/**" },
      { type: "http", pattern: "packages/server/src/http/**" },
      { type: "cli", pattern: "packages/server/src/cli/**" },
      { type: "workers", pattern: "packages/server/src/workers/**" },
      { type: "cron", pattern: "packages/server/src/cron/**" },
    ],
  },
  rules: {
    // Placeholder params/vars in bootstrap shells use the conventional underscore prefix.
    "no-unused-vars": "off",
    "@typescript-eslint/no-unused-vars": [
      "error",
      { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
    ],
    // Bootstrap inbound-port interfaces are intentionally empty; methods are added later.
    "@typescript-eslint/no-empty-object-type": "off",
    "boundaries/element-types": [
      "error",
      {
        default: "disallow",
        rules: [
          // core may only depend on itself (context-to-context gated to index.ts
          // by the per-context no-restricted-imports override below)
          { from: "core", allow: ["core"] },
          // reporting composes core context public surfaces; owns no data/rules
          { from: "reporting", allow: ["core", "reporting"] },
          // adapters depend on core (ports) + reporting (read-model ports). They
          // may also compose other adapters (e.g. db repositories read the auth
          // adapter's mirrored `user` table for display joins).
          { from: "adapters", allow: ["core", "reporting", "adapters"] },
          // plugins implement the core Integration port; nothing else
          { from: "plugins", allow: ["core", "plugins"] },
          // composition wires everything
          {
            from: "composition",
            allow: ["core", "adapters", "reporting", "plugins"],
          },
          // inbound entry points use composition + core public surface + reporting
          { from: ["http", "cli", "workers", "cron"], allow: ["composition", "core", "reporting"] },
        ],
      },
    ],
  },
  overrides: [
    {
      // core must stay framework-free, runtime-free, and persistence-free, and a
      // context may reach another context ONLY through its public index.ts.
      files: ["packages/server/src/core/**/*.ts"],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            paths: [
              { name: "fastify", message: "core must be framework-free" },
              { name: "pg", message: "core must be runtime-free" },
              {
                name: "drizzle-orm",
                message: "core must be persistence-free; schema + repos live in adapters/db",
              },
            ],
            patterns: [
              {
                group: ["drizzle-orm/*"],
                message: "core must be persistence-free; schema + repos live in adapters/db",
              },
              { group: ["**/adapters/**"], message: "core may not import adapters" },
              {
                group: ["**/http/**", "**/composition/**"],
                message: "core may not import inbound or wiring",
              },
              {
                group: CROSS_CONTEXT_DEEP_IMPORTS,
                message: "import another context only via its public index.ts",
              },
            ],
          },
        ],
      },
    },
  ],
};
