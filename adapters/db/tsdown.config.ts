import { defineConfig } from "tsdown";

export default defineConfig({
  unbundle: true,
  entry: ["src/**/*.ts", "!src/**/*.test.ts"],
  outDir: "dist",
  format: ["esm"],
  fixedExtension: false,
  target: "node22",
  platform: "node",
  sourcemap: true,
  clean: true,
  dts: true,
});
