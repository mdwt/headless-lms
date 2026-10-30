import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ACCESS_SCOPES } from '@headless-lms/core/organizations';
import { mcpCatalogue } from './catalogue.js';
import { TOOLS } from './tools/index.js';

const published = fileURLToPath(
  new URL('../../../../../apps/website/lib/mcp-catalogue.json', import.meta.url),
);

describe('mcp catalogue', () => {
  it('lists every tool and every scope', () => {
    const catalogue = mcpCatalogue();
    expect(catalogue.tools.map((tool) => tool.name)).toEqual(TOOLS.map((tool) => tool.name));
    expect(catalogue.scopes.map((scope) => scope.scope)).toEqual([...ACCESS_SCOPES]);
  });

  it('describes each input field with its type and whether it is required', () => {
    const grant = mcpCatalogue().tools.find((tool) => tool.name === 'grant_access');
    expect(grant?.fields.find((field) => field.name === 'expiresAt')).toMatchObject({
      required: true,
      type: 'date-time | null',
    });
  });

  it('matches the catalogue the docs site publishes', () => {
    expect(JSON.parse(readFileSync(published, 'utf8'))).toEqual(mcpCatalogue());
  });
});
