import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  fixedExtension: false,
  // Zod schema exports rely on inference, so no isolatedDeclarations here —
  // tsdown falls back to tsc for .d.ts generation.
  dts: true,
  sourcemap: true,
  clean: true,
});
