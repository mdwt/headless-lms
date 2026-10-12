import { z } from 'zod';
import type { StandardSchemaWithJSON } from '@modelcontextprotocol/server';

export function toolInputSchema(schema: z.ZodObject): StandardSchemaWithJSON<unknown, unknown> {
  const json = z.toJSONSchema(schema, {
    io: 'input',
    target: 'draft-2020-12',
    unrepresentable: 'any',
    override: (ctx) => {
      if (ctx.zodSchema._zod.def.type === 'date') {
        ctx.jsonSchema.type = 'string';
        ctx.jsonSchema.format = 'date-time';
      }
    },
  }) as Record<string, unknown>;
  return {
    '~standard': {
      version: 1,
      vendor: 'zod',
      validate: (value: unknown) => ({ value }),
      jsonSchema: { input: () => json, output: () => json },
    },
  } as StandardSchemaWithJSON<unknown, unknown>;
}
