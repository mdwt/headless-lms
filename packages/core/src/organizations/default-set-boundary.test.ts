import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../../../../', import.meta.url));
const organizations = fileURLToPath(new URL('./', import.meta.url));
const skip = new Set(['node_modules', 'dist', '.next', 'generated', '.turbo', 'coverage']);

function sources(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (skip.has(name) || name.startsWith('.')) {
      continue;
    }
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      out.push(...sources(path));
    } else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) {
      out.push(path);
    }
  }
  return out;
}

describe('the default role set', () => {
  it('is read only inside organizations', () => {
    const offenders = ['packages', 'adapters', 'apps', 'plugins']
      .flatMap((top) => sources(join(root, top)))
      .filter((path) => !path.startsWith(organizations))
      .filter((path) =>
        /\bDEFAULT_ROLES\b|default-roles(\.js)?['"]/.test(readFileSync(path, 'utf8')),
      )
      .map((path) => relative(root, path));
    expect(offenders).toEqual([]);
  });
});
