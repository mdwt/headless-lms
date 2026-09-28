import { readFile } from "node:fs/promises";
import { createOpenAPI } from "fumadocs-openapi/server";

const specPath = "../../packages/sdk/openapi.json";

// Server-side only. The spec is generated from the routes by `pnpm gen:sdk`.
// The recursive JsonValue schemas are flattened to `{}` (arbitrary JSON) —
// fumadocs-openapi's schema rendering blows the heap on self-referencing refs.
export const openapi = createOpenAPI({
  input: {
    [specPath]: async () => {
      const document = JSON.parse(await readFile(specPath, "utf8"));
      const schemas = document.components?.schemas ?? {};
      for (const name of ["JsonValue", "JsonValueInput"]) {
        if (name in schemas) {
          schemas[name] = {};
        }
      }
      return document;
    },
  },
});
