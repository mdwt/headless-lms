import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { toolInputSchema } from './input-schema.js';

describe('toolInputSchema', () => {
  it('describes dates as date-time strings', () => {
    const schema = toolInputSchema(z.object({ at: z.coerce.date().nullable(), name: z.string() }));
    const json = schema['~standard'].jsonSchema.input({ target: 'draft-2020-12' }) as {
      type: string;
      properties: Record<string, unknown>;
    };
    expect(json.type).toBe('object');
    expect(json.properties.name).toEqual({ type: 'string' });
    expect(JSON.stringify(json.properties.at)).toContain('"format":"date-time"');
  });

  it('leaves validation to the runner, so input is parsed exactly once', async () => {
    const schema = toolInputSchema(z.object({ reported: z.stringbool() }));
    expect(await schema['~standard'].validate({ reported: 'true' })).toEqual({
      value: { reported: 'true' },
    });
  });
});
