import { defineConfig } from "tsdown";

export default defineConfig({
  // Transpile-only: mirror src/ into dist/ file-for-file — keeps the hexagonal
  // layout intact and lets the integrations loader resolve compiled plugin
  // folders in consumers.
  unbundle: true,
  entry: ["src/**/*.ts", "!src/**/*.test.ts", "!src/**/__fixtures__/**"],
  outDir: "dist",
  format: ["esm"],
  fixedExtension: false,
  target: "node22",
  platform: "node",
  sourcemap: true,
  clean: true,
  // Public API consumers need types; per-file dts matches unbundle output.
  dts: true,
});
