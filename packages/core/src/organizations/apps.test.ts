import { describe, it, expect, beforeEach } from 'vitest';
import { OrgApps, servesCommunity, servesCourses, type OrgAppsParams } from './apps.js';
import type { Actor } from '../shared/actor.js';
import {
  ConflictError,
  ForbiddenError,
  InvalidInputError,
  NotFoundError,
} from '../shared/errors.js';
import type { App, Permission } from '../types/index.js';

const ACME = 'org_acme';
const GLOBEX = 'org_globex';
const ORGS = [
  { id: ACME, externalId: 'ba_acme', name: 'Acme', slug: 'acme' },
  { id: GLOBEX, externalId: null, name: 'Globex', slug: 'globex' },
];
const LEARN: App = {
  orgId: ACME,
  id: 'app_learn',
  name: 'Acme Academy',
  slug: 'academy',
  domain: 'https://learn.acme.test',
  courses: true,
  community: false,
};
const CLUB: App = {
  orgId: ACME,
  id: 'app_club',
  name: 'Acme Club',
  slug: 'club',
  domain: 'https://club.acme.test',
  courses: false,
  community: true,
};
const GLOBEX_APP: App = {
  orgId: GLOBEX,
  id: 'app_globex',
  name: 'Globex',
  slug: 'globex',
  domain: 'https://globex.platform.test',
  courses: true,
  community: true,
};

function actor(orgId: string, held: Permission[]): Actor {
  const has = (permission: Permission) => held.includes(permission);
  return {
    id: 'ou_1',
    orgId,
    permissions: {
      has,
      require: (permission) => {
        if (!has(permission)) {
          throw new ForbiddenError(permission);
        }
      },
      anywhere: has,
      where: (permission) => ({ org: has(permission), content: [] }),
      roleOn: () => ({ key: 'admin', name: 'Admin', team: true }),
      isOwner: () => false,
      isToken: () => false,
    },
  };
}

const admin = actor(ACME, ['organizations:read', 'organizations:write']);
const reader = actor(ACME, ['organizations:read']);
const member = actor(ACME, []);

function store(opts: Partial<OrgAppsParams> = {}) {
  const apps = new Map<string, App>();
  const refusedOf = (app: App): Error | null => {
    const others = [...apps.values()].filter((other) => other.id !== app.id);
    const mine = others.filter((other) => other.orgId === app.orgId);
    if (others.some((other) => other.domain === app.domain)) {
      return new ConflictError('That domain is already in use', 'domain_taken');
    }
    if (mine.some((other) => other.slug === app.slug)) {
      return new ConflictError('That slug is already in use', 'slug_taken');
    }
    if (app.courses && mine.some((other) => other.courses)) {
      return new ConflictError(
        'The organization already has an app that serves courses',
        'courses_taken',
      );
    }
    if (app.community && mine.some((other) => other.community)) {
      return new ConflictError(
        'The organization already has an app that serves the community',
        'community_taken',
      );
    }
    return app.courses || app.community
      ? null
      : new InvalidInputError('An app serves courses, the community, or both');
  };
  const save = (app: App): App => {
    const refused = refusedOf(app);
    if (refused) {
      throw refused;
    }
    apps.set(app.id, app);
    return app;
  };
  const repo: OrgAppsParams['repo'] = {
    findById: async (orgId) => (ORGS.find((org) => org.id === orgId) as never) ?? null,
    createApp: async (app) => save(app),
    listApps: async (orgId) => [...apps.values()].filter((app) => app.orgId === orgId),
    findAppByDomain: async (domain) =>
      [...apps.values()].find((app) => app.domain === domain) ?? null,
    updateApp: async (orgId, id, patch) => {
      const app = apps.get(id);
      if (!app || app.orgId !== orgId) {
        return null;
      }
      const defined = Object.fromEntries(
        Object.entries(patch).filter(([, value]) => value !== undefined),
      );
      return save({ ...app, ...defined });
    },
    deleteApp: async (orgId, id) => {
      const app = apps.get(id);
      if (!app || app.orgId !== orgId) {
        return null;
      }
      apps.delete(id);
      return app;
    },
  };
  const service = new OrgApps({
    repo,
    reservedDomains: ['https://admin.platform.test', 'https://api.platform.test'],
    ...opts,
  });
  return { apps, repo, service };
}

let w: ReturnType<typeof store>;
beforeEach(async () => {
  w = store();
  await w.repo.createApp(LEARN);
  await w.repo.createApp(CLUB);
  await w.repo.createApp(GLOBEX_APP);
});

describe('managing apps', () => {
  it("lists the organization's apps to a holder of organizations:read", async () => {
    expect(await w.service.list(reader)).toEqual([LEARN, CLUB]);
    await expect(w.service.list(member)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('creates, changes and deletes an app, each needing organizations:write', async () => {
    await w.service.delete(CLUB.id, admin);
    const input = {
      name: 'Acme Circle',
      slug: 'circle',
      domain: 'https://circle.test',
      courses: false,
      community: true,
    };
    await expect(w.service.create(input, reader)).rejects.toBeInstanceOf(ForbiddenError);
    const created = await w.service.create(input, admin);
    expect(created).toEqual({ ...input, orgId: ACME, id: expect.stringMatching(/^app_/) });

    await expect(w.service.update(created.id, { name: 'Circle' }, reader)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    const changed = await w.service.update(created.id, { name: 'Circle' }, admin);
    expect(changed).toEqual({ ...created, name: 'Circle' });

    await expect(w.service.delete(created.id, reader)).rejects.toBeInstanceOf(ForbiddenError);
    await w.service.delete(created.id, admin);
    expect(await w.repo.listApps(ACME)).toEqual([LEARN]);
  });

  it('refuses a domain another app has, in this organization or another', async () => {
    await w.service.delete(CLUB.id, admin);
    const input = { name: 'Circle', slug: 'circle', courses: false, community: true };
    await expect(
      w.service.create({ ...input, domain: GLOBEX_APP.domain }, admin),
    ).rejects.toBeInstanceOf(ConflictError);
    await expect(
      w.service.create({ ...input, domain: LEARN.domain }, admin),
    ).rejects.toBeInstanceOf(ConflictError);
    await expect(
      w.service.update(LEARN.id, { domain: GLOBEX_APP.domain }, admin),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(await w.repo.listApps(ACME)).toEqual([LEARN]);
  });

  it("refuses the installation's own addresses as a domain", async () => {
    await w.service.delete(CLUB.id, admin);
    const input = { name: 'Circle', slug: 'circle', courses: false, community: true };
    for (const domain of [
      'https://admin.platform.test',
      'https://api.platform.test',
      'http://admin.platform.test',
    ]) {
      await expect(w.service.create({ ...input, domain }, admin)).rejects.toMatchObject({
        name: 'ConflictError',
        code: 'domain_reserved',
      });
      await expect(w.service.update(LEARN.id, { domain }, admin)).rejects.toBeInstanceOf(
        ConflictError,
      );
    }
    expect(await w.repo.listApps(ACME)).toEqual([LEARN]);
  });

  it('keeps a domain with another port apart from a reserved one', async () => {
    await w.service.delete(CLUB.id, admin);
    const created = await w.service.create(
      {
        name: 'Circle',
        slug: 'circle',
        domain: 'https://admin.platform.test:8443',
        courses: false,
        community: true,
      },
      admin,
    );
    expect(created.domain).toBe('https://admin.platform.test:8443');
  });

  it('refuses a second app that serves courses or the community', async () => {
    const input = { name: 'Third', slug: 'third', domain: 'https://third.test' };
    await expect(
      w.service.create({ ...input, courses: true, community: false }, admin),
    ).rejects.toBeInstanceOf(ConflictError);
    await expect(
      w.service.create({ ...input, courses: false, community: true }, admin),
    ).rejects.toBeInstanceOf(ConflictError);
    await expect(w.service.update(LEARN.id, { community: true }, admin)).rejects.toBeInstanceOf(
      ConflictError,
    );
    expect(await w.repo.listApps(ACME)).toEqual([LEARN, CLUB]);
  });

  it('refuses an app that serves neither courses nor the community', async () => {
    await expect(
      w.service.create(
        {
          name: 'Third',
          slug: 'third',
          domain: 'https://third.test',
          courses: false,
          community: false,
        },
        admin,
      ),
    ).rejects.toBeInstanceOf(InvalidInputError);
    await expect(w.service.update(LEARN.id, { courses: false }, admin)).rejects.toBeInstanceOf(
      InvalidInputError,
    );
    expect(await w.repo.listApps(ACME)).toEqual([LEARN, CLUB]);
  });

  it('names the rule a refused app breaks', async () => {
    const third = { name: 'Third', slug: 'third', domain: 'https://third.test' };
    const refused = [
      w.service.create(
        { ...third, domain: GLOBEX_APP.domain, courses: true, community: false },
        admin,
      ),
      w.service.create({ ...third, slug: 'club', courses: false, community: false }, admin),
      w.service.create({ ...third, courses: true, community: false }, admin),
      w.service.create({ ...third, courses: false, community: true }, admin),
      w.service.create({ ...third, courses: false, community: false }, admin),
      w.service.update(CLUB.id, { domain: LEARN.domain }, admin),
      w.service.update(CLUB.id, { slug: 'academy' }, admin),
      w.service.update(CLUB.id, { courses: true }, admin),
      w.service.update(CLUB.id, { community: false }, admin),
    ];
    const codes = await Promise.all(
      refused.map((attempt) =>
        attempt.then(
          () => 'accepted',
          (err: { code?: string; name: string }) => err.code ?? err.name,
        ),
      ),
    );
    expect(codes).toEqual([
      'domain_taken',
      'slug_taken',
      'courses_taken',
      'community_taken',
      'InvalidInputError',
      'domain_taken',
      'slug_taken',
      'courses_taken',
      'InvalidInputError',
    ]);
    expect(await w.repo.listApps(ACME)).toEqual([LEARN, CLUB]);
  });

  it('keeps an app that is saved again as it is', async () => {
    const same = await w.service.update(
      CLUB.id,
      { name: CLUB.name, slug: CLUB.slug, domain: CLUB.domain, courses: false, community: true },
      admin,
    );
    expect(same).toEqual(CLUB);
  });

  it('lets one app take over both once the other is gone', async () => {
    await w.service.delete(CLUB.id, admin);
    const both = await w.service.update(LEARN.id, { community: true }, admin);
    expect(both).toEqual({ ...LEARN, community: true });
  });

  it("answers 404 for another organization's app", async () => {
    await expect(w.service.update(GLOBEX_APP.id, { name: 'Mine' }, admin)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(w.service.delete(GLOBEX_APP.id, admin)).rejects.toBeInstanceOf(NotFoundError);
    expect(w.apps.get(GLOBEX_APP.id)).toEqual(GLOBEX_APP);
  });
});

describe('looking a domain up', () => {
  it('gives the app and its organization', async () => {
    const at = await w.service.at('https://club.acme.test');
    expect(at?.app).toEqual(CLUB);
    expect(at?.organization).toEqual(ORGS[0]);
  });

  it("gives nothing for a domain that is no app's", async () => {
    expect(await w.service.at('https://elsewhere.test')).toBeNull();
    expect(await w.service.at('https://club.acme.test/')).toBeNull();
    expect(await w.service.at('club.acme.test')).toBeNull();
  });

  it("gives nothing for the installation's own addresses, without reading", async () => {
    const reads: string[] = [];
    const find = w.repo.findAppByDomain;
    w.repo.findAppByDomain = async (domain) => {
      reads.push(domain);
      return find(domain);
    };
    expect(await w.service.at('https://admin.platform.test')).toBeNull();
    expect(await w.service.at('http://api.platform.test')).toBeNull();
    expect(await w.service.at('not a domain')).toBeNull();
    expect(reads).toEqual([]);
  });

  it('follows a change of domain from the next read', async () => {
    await w.service.update(CLUB.id, { domain: 'https://circle.test' }, admin);
    expect(await w.service.at('https://club.acme.test')).toBeNull();
    expect((await w.service.at('https://circle.test'))?.app.id).toBe(CLUB.id);
  });
});

describe('what an app serves', () => {
  it('tells which app serves courses and which the community', () => {
    expect(servesCourses([LEARN, CLUB])).toEqual(LEARN);
    expect(servesCommunity([LEARN, CLUB])).toEqual(CLUB);
    expect(servesCommunity([LEARN])).toBeNull();
    expect(servesCourses([])).toBeNull();
  });

  it("gives an organization's apps and whether a domain is an app's", async () => {
    expect(await w.service.of(ACME)).toEqual([LEARN, CLUB]);
    expect(await w.service.has(CLUB.domain)).toBe(true);
    expect(await w.service.has('https://elsewhere.test')).toBe(false);
    expect(await w.service.has('https://admin.platform.test')).toBe(false);
    expect(await w.service.has('https://*')).toBe(false);
  });
});
