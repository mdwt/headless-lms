import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  fixedExtension: false,
  target: "node22",
  platform: "node",
  dts: false,
  sourcemap: true,
  clean: true,
});
