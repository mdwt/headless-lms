// Zod helpers for integration modules. An integration declares its config and
// each action's input/output as zod schemas once; these adapt them to the
// contract's JSON-Schema getters and validators.
import { z } from "zod";
import type { Action, ActionContext, Validation } from "./ports.js";

function toErrors(error: z.ZodError): string[] {
  return error.issues.map((issue) =>
    issue.path.length ? `${issue.path.join(".")}: ${issue.message}` : issue.message,
  );
}

export function zodConfig(schema: z.ZodType): {
  configSchema: () => Record<string, unknown>;
  validateConfig: (config: unknown) => Validation;
} {
  return {
    configSchema: () => z.toJSONSchema(schema) as Record<string, unknown>,
    validateConfig: (config) => {
      const result = schema.safeParse(config ?? {});
      return result.success ? { ok: true } : { ok: false, errors: toErrors(result.error) };
    },
  };
}

/** Derive the Integration contract's secretsSchema getter from a zod schema. */
export function zodSecrets(schema: z.ZodType): {
  secretsSchema: () => Record<string, unknown>;
} {
  return { secretsSchema: () => z.toJSONSchema(schema) as Record<string, unknown> };
}

/**
 * Build an Action from zod schemas + a run function. `invoke` parses the input
 * first (defaults applied, throws on mismatch), so `run` always sees typed,
 * valid input. The output schema documents the resolved shape for consumers;
 * it is not re-validated at runtime.
 */
export function zodAction<I extends z.ZodType, O extends z.ZodType>(def: {
  id: string;
  description: string;
  input: I;
  output: O;
  run(ctx: ActionContext, input: z.infer<I>): Promise<z.infer<O>>;
}): Action {
  return {
    id: def.id,
    description: def.description,
    inputSchema: () => z.toJSONSchema(def.input) as Record<string, unknown>,
    outputSchema: () => z.toJSONSchema(def.output) as Record<string, unknown>,
    invoke: async (ctx, input) => def.run(ctx, def.input.parse(input ?? {}) as z.infer<I>),
  };
}
