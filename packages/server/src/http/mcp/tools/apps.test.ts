import { describe, expect, it } from 'vitest';
import { runCase, OWNER, toolSpecs, type ToolCase } from '../test-support.js';
import { appTools } from './apps.js';

const CLUB = {
  id: 'app_club',
  name: 'Acme Club',
  slug: 'club',
  domain: 'https://club.acme.test',
  courses: false,
  community: true,
};
const STORED = { ...CLUB, orgId: 'org_1' };

const cases: ToolCase[] = [
  {
    tool: 'list_apps',
    args: {},
    service: 'apps.list',
    expected: [OWNER],
    returns: [STORED],
    shown: { apps: [CLUB] },
  },
  {
    tool: 'create_app',
    args: {
      name: ' Acme Club ',
      slug: 'club',
      domain: 'https://club.acme.test/',
      courses: false,
      community: true,
    },
    service: 'apps.create',
    expected: [
      {
        name: 'Acme Club',
        slug: 'club',
        domain: 'https://club.acme.test',
        courses: false,
        community: true,
      },
      OWNER,
    ],
    returns: STORED,
    shown: CLUB,
  },
  {
    tool: 'update_app',
    args: { appId: 'app_club', domain: 'https://club.acme.test/' },
    service: 'apps.update',
    expected: ['app_club', { domain: 'https://club.acme.test' }, OWNER],
    returns: STORED,
    shown: CLUB,
  },
  {
    tool: 'delete_app',
    args: { appId: 'app_club' },
    service: 'apps.delete',
    expected: ['app_club', OWNER],
    returns: undefined,
  },
];

describe('app tools', () => {
  it('declares what each tool does to the organization', () => {
    expect(toolSpecs(appTools)).toEqual([
      ['list_apps', 'read', true, false],
      ['create_app', 'write', false, false],
      ['update_app', 'write', true, false],
      ['delete_app', 'destructive', false, false],
    ]);
  });

  it.each(cases)('$tool calls $service once', (c) => runCase(appTools, c));
});
