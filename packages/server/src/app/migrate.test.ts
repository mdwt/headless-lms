import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { migrationsFolder, runMigrations } from './migrate.js';

describe('migrate', () => {
  it('resolves the packaged migrations folder', () => {
    expect(existsSync(migrationsFolder())).toBe(true);
  });

  it('fails with a clear message when DATABASE_URL is missing', async () => {
    await expect(runMigrations('')).rejects.toThrow(/DATABASE_URL/);
  });
});
