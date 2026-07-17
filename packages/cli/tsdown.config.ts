import { defineConfig } from "tsdown";

export default defineConfig({
  // A bin, not a library: single bundled entry, no declarations.
  entry: ["src/index.ts"],
  outDir: "dist",
  format: ["esm"],
  fixedExtension: false,
  target: "node22",
  platform: "node",
  sourcemap: true,
  clean: true,
  dts: false,
});
