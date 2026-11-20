import { describe, expect, it } from 'vitest';
import { AppsService, servesCommunity, servesCourses } from './apps.js';
import type { App } from '../types/index.js';

const LEARN: App = {
  orgId: 'org_acme',
  id: 'app_learn',
  name: 'Acme Academy',
  slug: 'academy',
  domain: 'https://learn.acme.test',
  courses: true,
  community: false,
};
const CLUB: App = { ...LEARN, id: 'app_club', slug: 'club', domain: 'https://club.acme.test' };
const GLOBEX: App = {
  ...LEARN,
  orgId: 'org_globex',
  id: 'app_globex',
  domain: 'https://globex.test',
};
const ALL = [LEARN, { ...CLUB, courses: false, community: true }, GLOBEX];

const reads: string[] = [];
const apps = new AppsService({
  list: async (orgId) => ALL.filter((app) => app.orgId === orgId),
  findByDomain: async (domain) => {
    reads.push(domain);
    return ALL.find((app) => app.domain === domain) ?? null;
  },
});

describe('the apps lookup', () => {
  it("gives an organization's apps", async () => {
    expect((await apps.of('org_acme')).map((app) => app.id)).toEqual(['app_learn', 'app_club']);
    expect(await apps.of('org_none')).toEqual([]);
  });

  it('gives the app that has a domain, matched exactly', async () => {
    expect(await apps.at('https://club.acme.test')).toMatchObject({ id: 'app_club' });
    expect(await apps.at('https://club.acme.test/')).toBeNull();
    expect(await apps.at('https://*')).toBeNull();
  });

  it("gives the first of several domains that is an app's, asking for each once", async () => {
    reads.length = 0;
    const first = await apps.firstAt([
      'https://mail.test',
      'https://mail.test',
      'https://globex.test',
      'https://learn.acme.test',
    ]);
    expect(first).toEqual(GLOBEX);
    expect(reads).toEqual(['https://mail.test', 'https://globex.test']);
    expect(await apps.firstAt(['https://mail.test'])).toBeNull();
    expect(await apps.firstAt([])).toBeNull();
  });

  it('tells which app serves courses and which the community', async () => {
    const acme = await apps.of('org_acme');
    expect(servesCourses(acme)?.id).toBe('app_learn');
    expect(servesCommunity(acme)?.id).toBe('app_club');
    expect(servesCommunity([LEARN])).toBeNull();
  });
});
