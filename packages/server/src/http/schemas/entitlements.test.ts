import { describe, expect, it } from 'vitest';
import { contentTypeSchema, entitlementsQuerySchema } from '@headless-lms/core/schemas';
import { EntitlementsQuery } from './entitlements.js';

describe('entitlements list query', () => {
  it('filters by every content type', () => {
    for (const type of contentTypeSchema.options) {
      expect(EntitlementsQuery.parse({ type }).type).toBe(type);
      expect(entitlementsQuerySchema.parse({ page: 1, pageSize: 20, type }).type).toBe(type);
    }
    expect(contentTypeSchema.options).toContain('community');
  });

  it('refuses a type that is not a content type', () => {
    expect(EntitlementsQuery.safeParse({ type: 'bundle' }).success).toBe(false);
  });
});
