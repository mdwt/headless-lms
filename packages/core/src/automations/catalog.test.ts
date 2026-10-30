import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import { assetEvents } from '../assets/index.js';
import { contentEvents } from '../content/index.js';
import { discussionEvents } from '../discussion/index.js';
import { entitlementEvents } from '../entitlements/index.js';
import { identityEvents } from '../identity/index.js';
import { integrationEvents } from '../integrations/index.js';
import { organizationEvents } from '../organizations/index.js';
import { progressEvents } from '../progress/index.js';
import { catalogTriggers, publicDataSchema } from './catalog.js';

type Def = {
  type: string;
  [key: string]: unknown;
};

function defOf(schema: unknown): Def {
  return (schema as { _zod: { def: Def } })._zod.def;
}

function minLength(def: Def): number {
  const checks = (def.checks ?? []) as { _zod: { def: { check: string; minimum?: number } } }[];
  return checks.reduce((min, check) => {
    const inner = check._zod.def;
    return inner.check === 'min_length' && typeof inner.minimum === 'number'
      ? Math.max(min, inner.minimum)
      : min;
  }, 1);
}

function sample(schema: unknown, depth = 0): unknown {
  const def = defOf(schema);
  switch (def.type) {
    case 'object': {
      const shape = def.shape as Record<string, unknown>;
      return Object.fromEntries(
        Object.entries(shape).map(([key, value]) => [key, sample(value, depth + 1)]),
      );
    }
    case 'string': {
      if (def.format === 'email') {
        return 'sarah@example.com';
      }
      if (def.format === 'url') {
        return 'https://example.com/hook';
      }
      return 'x'.repeat(minLength(def));
    }
    case 'number':
      return 1;
    case 'boolean':
      return true;
    case 'date':
      return new Date('2026-10-21T07:00:00.000Z');
    case 'null':
      return null;
    case 'enum':
      return Object.values(def.entries as Record<string, unknown>)[0];
    case 'literal':
      return (def.values as unknown[])[0];
    case 'nullable':
    case 'optional':
    case 'default':
    case 'readonly':
    case 'nonoptional':
    case 'catch':
      return sample(def.innerType, depth);
    case 'pipe':
      return sample(def.in, depth);
    case 'lazy':
      return depth > 4 ? null : sample((def.getter as () => unknown)(), depth + 1);
    case 'array':
      return [sample(def.element, depth + 1)];
    case 'record':
      return {};
    case 'union': {
      for (const option of def.options as z.ZodType[]) {
        const value = sample(option, depth);
        if (option.safeParse(value).success) {
          return value;
        }
      }
      return sample((def.options as unknown[])[0], depth);
    }
    default:
      return null;
  }
}

const contexts = {
  assetEvents,
  contentEvents,
  discussionEvents,
  entitlementEvents,
  identityEvents,
  integrationEvents,
  organizationEvents,
  progressEvents,
};

const published = Object.values(contexts).flatMap((events) =>
  Object.values(
    events as Record<string, { type: string; dataSchema: z.ZodType; publicData?: z.ZodType }>,
  )
    .filter((event) => event.publicData !== undefined)
    .map((event) => [event.type, event.dataSchema] as const),
);

describe('trigger catalog', () => {
  it('lists every event that has a public shape', () => {
    const listed = new Set(catalogTriggers().map((trigger) => trigger.type));
    expect(published.map(([type]) => type).filter((type) => !listed.has(type))).toEqual([]);
  });

  it.each(published)('%s publishes a full data row', (type, dataSchema) => {
    const row = dataSchema.parse(sample(dataSchema));
    const stored = JSON.parse(JSON.stringify(row)) as unknown;
    const result = publicDataSchema(type)!.safeParse(stored);
    expect(result.error?.issues ?? []).toEqual([]);
  });

  it('never publishes a message body or a message flag reason', () => {
    const message = sample(discussionEvents.messageSent.dataSchema);
    const flag = sample(discussionEvents.messageReported.dataSchema);
    expect(publicDataSchema('discussion.message.sent')!.parse(message)).not.toHaveProperty('body');
    expect(publicDataSchema('discussion.message.reported')!.parse(flag)).not.toHaveProperty(
      'reason',
    );
  });
});
