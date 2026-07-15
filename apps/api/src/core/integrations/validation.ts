// integrations context — shared helper for integrations that define their
// config schema with zod: adapts a zod schema to the Integration port's
// validateConfig shape.
import type { z } from "zod";
import type { ConfigValidation } from "./model.js";

export function zodConfigValidator(schema: z.ZodType): (config: unknown) => ConfigValidation {
  return (config) => {
    const result = schema.safeParse(config ?? {});
    if (result.success) return { ok: true };
    return {
      ok: false,
      errors: result.error.issues.map((issue) =>
        issue.path.length ? `${issue.path.join(".")}: ${issue.message}` : issue.message,
      ),
    };
  };
}
