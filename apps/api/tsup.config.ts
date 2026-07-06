import { defineConfig } from "tsup";

export default defineConfig({
  // Transpile-only: mirror the src/ tree into dist/ file-for-file rather than
  // bundling into one file. Keeps the hexagonal layout intact and preserves
  // dist/http/main.js as the process entry (main field + start script).
  bundle: false,
  entry: ["src/**/*.ts", "!src/**/*.test.ts"],
  outDir: "dist",
  format: ["esm"],
  target: "node22",
  platform: "node",
  sourcemap: true,
  clean: true,
  // Type-checking is the job of `pnpm typecheck` (tsc --noEmit); tsup only emits.
  dts: false,
  // Workspace deps (api-contract, shared-types) and node_modules resolve via
  // package exports at runtime — nothing to bundle.
  skipNodeModulesBundle: true,
});
