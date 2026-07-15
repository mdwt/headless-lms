// integrations context — shared helper for integrations that define their
// config with zod: derives the Integration port's configSchema (JSON Schema)
// and validateConfig from a single zod schema.
import { z } from "zod";
import type { ConfigValidation } from "./model.js";

export function zodConfig(schema: z.ZodType): {
  configSchema: () => Record<string, unknown>;
  validateConfig: (config: unknown) => ConfigValidation;
} {
  return {
    configSchema: () => z.toJSONSchema(schema) as Record<string, unknown>,
    validateConfig: (config) => {
      const result = schema.safeParse(config ?? {});
      if (result.success) return { ok: true };
      return {
        ok: false,
        errors: result.error.issues.map((issue) =>
          issue.path.length ? `${issue.path.join(".")}: ${issue.message}` : issue.message,
        ),
      };
    },
  };
}
