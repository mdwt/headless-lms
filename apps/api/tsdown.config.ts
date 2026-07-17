import { defineConfig } from "tsdown";

export default defineConfig({
  // Transpile-only: mirror the src/ tree into dist/ file-for-file rather than
  // bundling into one file. Keeps the hexagonal layout intact and preserves
  // dist/http/main.js as the process entry (main field + start script).
  unbundle: true,
  entry: ["src/**/*.ts", "!src/**/*.test.ts"],
  outDir: "dist",
  format: ["esm"],
  fixedExtension: false,
  target: "node22",
  platform: "node",
  sourcemap: true,
  clean: true,
  // Type-checking is the job of `pnpm typecheck` (tsc --noEmit); tsdown only emits.
  dts: false,
});
