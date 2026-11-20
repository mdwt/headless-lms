import { describe, expect, it } from 'vitest';
import { createMailerSources } from './mailer-sources.js';

const LEARN = {
  orgId: 'org_acme',
  id: 'app_learn',
  name: 'Acme Academy',
  slug: 'academy',
  domain: 'https://learn.acme.test',
  courses: true,
  community: false,
};

const sources = createMailerSources({
  organization: async (orgId) =>
    orgId === 'org_acme'
      ? { id: 'org_acme', name: 'Acme', slug: 'acme', metadata: { plan: 'pro' }, ownerId: 'usr_1' }
      : null,
  apps: async (orgId) => (orgId === 'org_acme' ? [LEARN] : []),
  person: async (email) =>
    email === 'sarah@example.com'
      ? { id: 'usr_1', firstName: 'Sarah', lastName: null, email, image: 'x' }
      : null,
});

describe('what the mailer reads', () => {
  it('is the organization with its apps, and only the fields a template receives', async () => {
    expect(await sources.organization('org_acme')).toEqual({
      organization: { id: 'org_acme', name: 'Acme', slug: 'acme', metadata: { plan: 'pro' } },
      apps: [LEARN],
    });
  });

  it('is nothing for an organization that does not exist', async () => {
    expect(await sources.organization('org_gone')).toBeNull();
  });

  it('is the person who has an address, or nothing', async () => {
    expect(await sources.recipient('sarah@example.com')).toEqual({
      id: 'usr_1',
      firstName: 'Sarah',
      lastName: null,
    });
    expect(await sources.recipient('nobody@example.com')).toBeNull();
  });
});
