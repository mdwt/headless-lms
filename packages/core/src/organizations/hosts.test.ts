import { describe, expect, it } from 'vitest';
import { OrgHostSettings, type OrgHostIndex } from './hosts.js';
import { SettingsService, type SettingsRepository } from '../shared/settings.js';
import { ForbiddenError, NotFoundError } from '../shared/errors.js';
import { actorWith } from './testing.js';

const ADMIN = actorWith({ orgId: 'org_acme', org: ['organizations:write', 'organizations:read'] });

function world() {
  const rows = new Map<string, Record<string, unknown>>();
  const repo: SettingsRepository = {
    async find(orgId, scopeId, namespace) {
      const value = rows.get(`${orgId}:${namespace}:${scopeId}`);
      return value ? [{ namespace: namespace ?? '', scopeId, value }] : [];
    },
    async patch(orgId, namespace, scopeId, value) {
      const key = `${orgId}:${namespace}:${scopeId}`;
      const next = { ...rows.get(key), ...(value as Record<string, unknown>) };
      rows.set(key, next);
      return { namespace, scopeId, value: next };
    },
  };
  const index: OrgHostIndex = {
    async findOrgIdsByHost(host) {
      return [...rows]
        .filter(([, value]) => Object.values(value.hosts ?? {}).includes(host))
        .map(([key]) => key.split(':')[0]!);
    },
  };
  const hosts = new OrgHostSettings({
    settings: new SettingsService(repo),
    index,
    platformHost: 'https://platform.test',
  });
  return { hosts, rows, repo, index };
}

describe('OrgHostSettings', () => {
  it('starts an organization at its slug under the platform host, for both apps', async () => {
    const { hosts } = world();
    const started = await hosts.assign('org_acme', 'acme');
    expect(started).toEqual({
      courses: 'https://acme.platform.test',
      community: 'https://acme.platform.test',
    });
    expect(await hosts.resolve('org_acme')).toEqual(started);
  });

  it('keeps the scheme and port of the platform host, and uses the id when there is no slug', async () => {
    const { repo, index } = world();
    const settings = new SettingsService(repo);
    const local = new OrgHostSettings({
      settings,
      index,
      platformHost: 'http://localhost:8002/',
    });
    expect((await local.assign('org_acme', 'acme')).courses).toBe('http://acme.localhost:8002');
    expect((await local.assign('org_3LyAb', '')).courses).toBe('http://org-3lyab.localhost:8002');
  });

  it.each(['example.com', 'https://example.com/app', 'ftp://example.com'])(
    'refuses %s as the platform host',
    (platformHost) => {
      const { repo, index } = world();
      const settings = new SettingsService(repo);
      expect(() => new OrgHostSettings({ settings, index, platformHost })).toThrow(/platform host/);
    },
  );

  it('has no hosts for an organization that was never given one', async () => {
    const { hosts } = world();
    await expect(hosts.resolve('org_other')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('stores both hosts for the organization and uses them from the next read', async () => {
    const { hosts } = world();
    await hosts.assign('org_acme', 'acme');
    const stored = await hosts.replace(
      { courses: 'https://learn.acme.test', community: 'https://club.acme.test' },
      ADMIN,
    );
    expect(stored).toEqual({
      courses: 'https://learn.acme.test',
      community: 'https://club.acme.test',
    });
    expect(await hosts.resolve('org_acme')).toEqual(stored);

    await hosts.replace(
      { courses: 'https://learn.acme.test', community: 'https://community.acme.test' },
      ADMIN,
    );
    expect((await hosts.resolve('org_acme')).community).toBe('https://community.acme.test');
  });

  it('keeps the other organization settings when the hosts change', async () => {
    const { hosts, rows } = world();
    rows.set('org_acme:organizations:org_acme', { notificationCategories: ['kept'] });
    await hosts.assign('org_acme', 'acme');
    expect(rows.get('org_acme:organizations:org_acme')).toEqual({
      notificationCategories: ['kept'],
      hosts: { courses: 'https://acme.platform.test', community: 'https://acme.platform.test' },
    });
  });

  it('finds the organizations at a host, from the next read after a change', async () => {
    const { hosts } = world();
    await hosts.assign('org_acme', 'acme');
    expect(await hosts.orgsAt('https://acme.platform.test')).toEqual(['org_acme']);
    await hosts.replace(
      { courses: 'https://learn.acme.test', community: 'https://club.acme.test' },
      ADMIN,
    );
    expect(await hosts.orgsAt('https://club.acme.test')).toEqual(['org_acme']);
    expect(await hosts.orgsAt('https://acme.platform.test')).toEqual([]);
  });

  it('needs organizations:write to change the hosts', async () => {
    const { hosts } = world();
    await hosts.assign('org_acme', 'acme');
    const reader = actorWith({ orgId: 'org_acme', org: ['organizations:read'] });
    await expect(
      hosts.replace(
        { courses: 'https://learn.acme.test', community: 'https://club.acme.test' },
        reader,
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});
