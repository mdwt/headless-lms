const CONTEXTS = [
  "identity",
  "organizations",
  "content",
  "entitlements",
  "progress",
  "assets",
  "integrations",
  "automations",
  "discussion",
];

const CROSS_CONTEXT_DEEP_IMPORTS = CONTEXTS.flatMap((c) => [`../${c}/*`, `!../${c}/index.js`]);

const REPORTING_CROSS_CONTEXT_DEEP_IMPORTS = CONTEXTS.flatMap((c) => [
  `../../${c}/*`,
  `!../../${c}/index.js`,
]);

module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  parserOptions: { ecmaVersion: 2022, sourceType: "module" },
  plugins: ["@typescript-eslint"],
  extends: ["eslint:recommended", "plugin:@typescript-eslint/recommended"],
  rules: {
    curly: ["error", "all"],
    "no-unused-vars": "off",
    "@typescript-eslint/no-unused-vars": [
      "error",
      { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
    ],
    "@typescript-eslint/no-empty-object-type": "off",
  },
  overrides: [
    {
      files: ["packages/server/**/*.ts", "packages/core/**/*.ts", "adapters/*/src/**/*.ts"],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            paths: [
              {
                name: "@headless-lms/editor",
                message: "the editor contract is React-bound; server-side code never imports it",
              },
            ],
          },
        ],
      },
    },
    {
      files: [
        ...CONTEXTS.map((c) => `packages/core/src/${c}/**/*.ts`),
        "packages/core/src/shared/**/*.ts",
        "packages/core/src/types/**/*.ts",
      ],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            paths: [
              { name: "fastify", message: "core must be framework-free" },
              { name: "pg", message: "core must be runtime-free" },
              {
                name: "drizzle-orm",
                message:
                  "core must be persistence-free; schema + repos live in @headless-lms/adapter-db",
              },
              { name: "@headless-lms/editor", message: "editor contract is React-bound" },
            ],
            patterns: [
              {
                group: ["drizzle-orm/*"],
                message: "core must be persistence-free",
              },
              {
                group: ["@headless-lms/adapter-*", "@headless-lms/server"],
                message: "core may not import adapters or the server",
              },
              {
                group: ["**/reporting/**", "@headless-lms/core/reporting/*"],
                message: "core contexts may not import reporting",
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
    {
      files: ["packages/core/src/reporting/**/*.ts"],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            paths: [
              {
                name: "@headless-lms/editor",
                message: "the editor contract is React-bound; server-side code never imports it",
              },
            ],
            patterns: [
              {
                group: [
                  "@headless-lms/adapter-*",
                  "@headless-lms/server",
                  "drizzle-orm",
                  "drizzle-orm/*",
                ],
                message: "reporting composes core surfaces only",
              },
              {
                group: REPORTING_CROSS_CONTEXT_DEEP_IMPORTS,
                message: "reporting imports a context only via its public index.ts",
              },
            ],
          },
        ],
      },
    },
    {
      files: ["adapters/*/src/**/*.ts"],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            paths: [
              {
                name: "@headless-lms/editor",
                message: "the editor contract is React-bound; server-side code never imports it",
              },
            ],
            patterns: [
              {
                group: ["@headless-lms/server", "@headless-lms/server/*"],
                message: "adapters implement core ports; they never import the server",
              },
            ],
          },
        ],
      },
    },
  ],
};
