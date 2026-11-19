import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type {
  EmailMessage,
  EmailTemplateId,
  TemplateContext,
} from '@headless-lms/core/shared/ports';
import { buildServer } from '../http/server.js';
import type { ServerConfig } from '../http/config.js';
import { buildContainer, type Config, type Container } from './container.js';

const url = process.env.TEST_DATABASE_URL;

const tag = Math.random().toString(36).slice(2, 10);
const API = 'https://api.platform.test';
const ADMIN = 'https://admin.platform.test';
const PLATFORM = `https://p${tag}.test`;
const PASSWORD = 'correct horse battery';
const LEARN = `https://learn.acme-${tag}.test`;
const CLUB = `https://club.acme-${tag}.test`;
const GLOBEX = `https://globex-${tag}.p${tag}.test`;

type Sent = { to: string; id: EmailTemplateId; ctx: TemplateContext; params: unknown };

class Person {
  cookies = new Map<string, string>();

  constructor(
    readonly name: string,
    readonly email = `${name.toLowerCase()}-${tag}@example.com`,
  ) {}

  get cookie(): string {
    return [...this.cookies].map(([key, value]) => `${key}=${value}`).join('; ');
  }

  keep(setCookies: string[]): void {
    for (const line of setCookies) {
      const [pair, ...attributes] = line.split(';');
      const [key, ...value] = pair!.split('=');
      if (attributes.some((attribute) => /max-age=0/i.test(attribute))) {
        this.cookies.delete(key!.trim());
      } else {
        this.cookies.set(key!.trim(), value.join('='));
      }
    }
  }
}

describe.skipIf(!url)('apps and domains, end to end on Postgres', () => {
  let container: Container;
  let app: FastifyInstance;
  const sent: Sent[] = [];

  const sarah = new Person('Sarah');
  const liam = new Person('Liam');
  const james = new Person('James');
  const emma = new Person('Emma');
  const acmeAdmin = new Person('Sarah', sarah.email);
  let acmeId = '';
  let globexId = '';
  let clubAppId = '';

  async function call(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    path: string,
    options: { as?: Person; origin?: string; body?: unknown } = {},
  ) {
    const res = await app.inject({
      method,
      url: path,
      headers: {
        ...(options.origin && { origin: options.origin }),
        ...(options.as?.cookie && { cookie: options.as.cookie }),
      },
      ...(options.body !== undefined && { payload: options.body as object }),
    });
    const setCookies = res.headers['set-cookie'];
    options.as?.keep(setCookies ? [setCookies].flat() : []);
    return res;
  }

  const settled = () => new Promise((resolve) => setTimeout(resolve, 150));

  const signUp = (person: Person, origin: string) =>
    call('POST', '/api/auth/sign-up/email', {
      as: person,
      origin,
      body: { email: person.email, password: PASSWORD, name: `${person.name} Lee` },
    });

  const signIn = (person: Person, origin: string, password = PASSWORD) => {
    person.cookies.clear();
    return call('POST', '/api/auth/sign-in/email', {
      as: person,
      origin,
      body: { email: person.email, password },
    });
  };

  async function sessionOrg(person: Person): Promise<string | null | undefined> {
    const res = await call('GET', '/api/auth/get-session?disableCookieCache=true', { as: person });
    const body = res.json() as { session?: { activeOrganizationId?: string | null } } | null;
    return body?.session ? (body.session.activeOrganizationId ?? null) : undefined;
  }

  const lastTo = (person: Person, id: EmailTemplateId) =>
    sent.filter((email) => email.to === person.email && email.id === id).at(-1);

  async function invite(inviter: Person, invited: Person, domain?: string): Promise<string> {
    const res = await call('POST', '/api/organizations/invites', {
      as: inviter,
      origin: ADMIN,
      body: { email: invited.email, ...(domain && { domain }) },
    });
    expect(res.statusCode).toBe(201);
    const email = lastTo(invited, 'studentInvite')!;
    return (email.params as { inviteUrl: string }).inviteUrl;
  }

  const accept = (person: Person, inviteUrl: string) =>
    call('POST', '/api/organizations/invites/accept', {
      as: person,
      origin: new URL(inviteUrl).origin,
      body: { token: new URL(inviteUrl).searchParams.get('token') },
    });

  beforeAll(async () => {
    const config: Config = {
      databaseUrl: url!,
      authBaseURL: API,
      authSecret: 'a'.repeat(32),
      trustedOrigins: [ADMIN, API],
      credentialStoreKey: Buffer.alloc(32, 1).toString('base64'),
      platformHost: PLATFORM,
      adminAppUrl: ADMIN,
      deliveryExpirySeconds: 3600,
      memberImageMaxBytes: 1_000_000,
      memberFileMaxBytes: 1_000_000,
      logging: { level: 'error' },
      outbox: { enabled: false },
    };
    container = await buildContainer(config, {
      adapters: {
        email: { send: async (_message: EmailMessage) => {} },
        templates: {
          render: async (id, ctx, params) => {
            sent.push({ to: ctx.recipient.email, id, ctx, params });
            return { subject: id, html: id, text: id };
          },
        },
      },
    });
    const server: ServerConfig = {
      port: 0,
      host: '127.0.0.1',
      publicUrl: API,
      clientOrigins: [ADMIN],
      requestLogging: false,
      deliveryExpirySeconds: 3600,
      memberImageMaxBytes: 1_000_000,
      memberFileMaxBytes: 1_000_000,
      pubsubDatabaseUrl: url!,
      container: config,
    };
    app = await buildServer(server, container);
    await app.ready();

    expect((await signUp(sarah, ADMIN)).statusCode).toBe(200);
    const acme = await call('POST', '/api/organizations', {
      as: sarah,
      origin: ADMIN,
      body: { name: 'Acme', slug: `acme-${tag}` },
    });
    expect(acme.statusCode).toBe(201);
    acmeId = (acme.json() as { id: string }).id;
    expect(await sessionOrg(sarah)).toBe(acmeId);

    expect((await signUp(liam, ADMIN)).statusCode).toBe(200);
    const globex = await call('POST', '/api/organizations', {
      as: liam,
      origin: ADMIN,
      body: { name: 'Globex', slug: `globex-${tag}` },
    });
    expect(globex.statusCode).toBe(201);
    globexId = (globex.json() as { id: string }).id;
    expect(await sessionOrg(liam)).toBe(globexId);
  });

  afterAll(async () => {
    await app?.close();
  });

  it('starts an organization with one app for both, at its slug under the platform host', async () => {
    const res = await call('GET', '/api/organizations/apps', { as: sarah, origin: ADMIN });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([
      {
        id: expect.stringMatching(/^app_/),
        name: 'Acme',
        slug: `acme-${tag}`,
        domain: `https://acme-${tag}.p${tag}.test`,
        courses: true,
        community: true,
      },
    ]);
  });

  it('lets the organization move courses to its own domain and add a community app', async () => {
    const [first] = (
      await call('GET', '/api/organizations/apps', { as: sarah, origin: ADMIN })
    ).json() as { id: string }[];
    const course = await call('PATCH', `/api/organizations/apps/${first!.id}`, {
      as: sarah,
      origin: ADMIN,
      body: { name: 'Acme Academy', domain: `${LEARN}/`, community: false },
    });
    expect(course.statusCode).toBe(200);
    expect(course.json()).toMatchObject({ domain: LEARN, courses: true, community: false });

    const club = await call('POST', '/api/organizations/apps', {
      as: sarah,
      origin: ADMIN,
      body: { name: 'Acme Club', slug: 'club', domain: CLUB, courses: false, community: true },
    });
    expect(club.statusCode).toBe(201);
    clubAppId = (club.json() as { id: string }).id;

    const third = await call('POST', '/api/organizations/apps', {
      as: sarah,
      origin: ADMIN,
      body: { name: 'Third', slug: 'third', domain: GLOBEX, courses: false, community: true },
    });
    expect(third.statusCode).toBe(409);
    const taken = await call('PATCH', `/api/organizations/apps/${clubAppId}`, {
      as: sarah,
      origin: ADMIN,
      body: { domain: GLOBEX },
    });
    expect(taken.statusCode).toBe(409);
    expect(taken.json()).toMatchObject({ message: 'That domain is already in use' });
  });

  it("refuses the admin app's address and the API's as a domain", async () => {
    for (const domain of [ADMIN, API]) {
      const changed = await call('PATCH', `/api/organizations/apps/${clubAppId}`, {
        as: sarah,
        origin: ADMIN,
        body: { domain },
      });
      expect(changed.statusCode).toBe(409);
    }
    expect((await call('GET', '/api/app', { origin: ADMIN })).statusCode).toBe(404);
  });

  it("refuses another organization's app, and an app that would serve nothing", async () => {
    const stolen = await call('PATCH', `/api/organizations/apps/${clubAppId}`, {
      as: liam,
      origin: ADMIN,
      body: { name: 'Mine' },
    });
    expect(stolen.statusCode).toBe(404);
    const nothing = await call('PATCH', `/api/organizations/apps/${clubAppId}`, {
      as: sarah,
      origin: ADMIN,
      body: { community: false },
    });
    expect(nothing.statusCode).toBe(400);
  });

  it('tells a frontend which organization and app its domain is, without a session', async () => {
    const learn = await call('GET', '/api/app', { origin: LEARN });
    expect(learn.statusCode).toBe(200);
    expect(learn.json()).toEqual({
      organization: { name: 'Acme' },
      app: { name: 'Acme Academy', courses: true, community: false },
    });
    const club = await call('GET', '/api/app', { origin: CLUB });
    expect(club.json()).toMatchObject({ app: { name: 'Acme Club', community: true } });
    expect(
      (await call('GET', '/api/app', { origin: `https://nobody-${tag}.test` })).statusCode,
    ).toBe(404);
    expect((await call('GET', '/api/app')).statusCode).toBe(404);
  });

  it('gives a person a session for the organization of the domain they sign in on', async () => {
    const globexInvite = await invite(liam, sarah);
    expect(new URL(globexInvite).origin).toBe(GLOBEX);
    const carried = await accept(sarah, globexInvite);
    expect(carried.statusCode).toBe(401);
    expect((await signIn(sarah, GLOBEX)).statusCode).toBe(200);
    expect(await sessionOrg(sarah)).toBeNull();
    expect((await accept(sarah, globexInvite)).statusCode).toBe(200);
    expect(await sessionOrg(sarah)).toBe(globexId);

    expect((await signIn(sarah, LEARN)).statusCode).toBe(200);
    expect(await sessionOrg(sarah)).toBe(acmeId);
    expect((await signIn(sarah, CLUB)).statusCode).toBe(200);
    expect(await sessionOrg(sarah)).toBe(acmeId);
    expect((await signIn(sarah, GLOBEX)).statusCode).toBe(200);
    expect(await sessionOrg(sarah)).toBe(globexId);
  });

  it('gives a person in two organizations no organization on any other domain, and one organization its own', async () => {
    expect((await signIn(sarah, ADMIN)).statusCode).toBe(200);
    expect(await sessionOrg(sarah)).toBeNull();
    expect((await signIn(liam, ADMIN)).statusCode).toBe(200);
    expect(await sessionOrg(liam)).toBe(globexId);
  });

  it('refuses a person on the domain of an organization they are not in', async () => {
    const globexInvite = await invite(liam, james);
    expect((await signUp(james, GLOBEX)).statusCode).toBe(200);
    expect(await sessionOrg(james)).toBeNull();
    expect((await accept(james, globexInvite)).statusCode).toBe(200);
    expect(await sessionOrg(james)).toBe(globexId);

    const refused = await signIn(james, LEARN);
    expect(refused.statusCode).toBe(401);
    expect(await sessionOrg(james)).toBeUndefined();
    expect((await signIn(james, GLOBEX)).statusCode).toBe(200);
    expect(await sessionOrg(james)).toBe(globexId);
  });

  it('gives a stranger who signs up on the domain no session', async () => {
    const stranger = new Person('Stranger');
    const refused = await signUp(stranger, LEARN);
    expect(refused.statusCode).toBeGreaterThanOrEqual(400);
    expect(refused.statusCode).toBeLessThan(500);
    expect(await sessionOrg(stranger)).toBeUndefined();
    expect((await signIn(stranger, LEARN)).statusCode).toBe(401);
  });

  it('lets an invited person sign up on the domain, accept, and then holds their session to the organization', async () => {
    expect((await signIn(acmeAdmin, LEARN)).statusCode).toBe(200);
    const acmeInvite = await invite(acmeAdmin, emma);
    expect(new URL(acmeInvite).origin).toBe(LEARN);
    const invited = lastTo(emma, 'studentInvite')!;
    expect(invited.ctx.organization).toMatchObject({ id: acmeId, name: 'Acme' });
    expect(invited.ctx.courseApp).toMatchObject({ name: 'Acme Academy', domain: LEARN });
    expect(invited.ctx.communityApp).toMatchObject({ name: 'Acme Club', domain: CLUB });
    expect(invited.ctx.recipient).toMatchObject({ email: emma.email, id: expect.any(String) });

    expect((await signUp(emma, LEARN)).statusCode).toBe(200);
    expect(await sessionOrg(emma)).toBeNull();
    const before = await call('GET', '/api/member/org', { as: emma, origin: LEARN });
    expect(before.statusCode).toBe(401);

    expect((await accept(emma, acmeInvite)).statusCode).toBe(200);
    expect(await sessionOrg(emma)).toBe(acmeId);
    const after = await call('GET', '/api/member/org', { as: emma, origin: LEARN });
    expect(after.statusCode).toBe(200);
    expect(after.json()).toMatchObject({ name: 'Acme' });
  });

  it("answers 401 to a session for another organization on an app's domain", async () => {
    expect((await signIn(emma, LEARN)).statusCode).toBe(200);
    expect((await call('GET', '/api/member/org', { as: emma, origin: LEARN })).statusCode).toBe(
      200,
    );
    expect((await call('GET', '/api/member/org', { as: emma, origin: CLUB })).statusCode).toBe(200);
    const elsewhere = await call('GET', '/api/member/org', { as: emma, origin: GLOBEX });
    expect(elsewhere.statusCode).toBe(401);
    expect(elsewhere.json()).toMatchObject({ message: 'This session is for another organization' });
    expect((await call('GET', '/api/member/org', { as: emma })).statusCode).toBe(200);
  });

  it('sends a password reset with the organization and the app it was asked on, and its link opens on that domain', async () => {
    const asked = await call('POST', '/api/auth/request-password-reset', {
      origin: CLUB,
      body: { email: emma.email, redirectTo: `${CLUB}/reset-password` },
    });
    expect(asked.statusCode).toBe(200);
    await settled();
    const reset = lastTo(emma, 'passwordReset')!;
    expect(reset.ctx.organization).toMatchObject({ id: acmeId, name: 'Acme', metadata: {} });
    expect(reset.ctx.requestedApp).toEqual({
      id: clubAppId,
      name: 'Acme Club',
      slug: 'club',
      domain: CLUB,
    });
    expect(reset.ctx.recipient).toMatchObject({ firstName: 'Emma', lastName: 'Lee' });
    const { resetUrl } = reset.params as { resetUrl: string };
    expect(resetUrl.startsWith(`${CLUB}/api/auth/reset-password/`)).toBe(true);

    const link = new URL(resetUrl);
    const opened = await call('GET', `${link.pathname}${link.search}`);
    expect(opened.statusCode).toBe(302);
    const landing = new URL(opened.headers.location as string);
    expect(landing.origin).toBe(CLUB);
    expect(landing.pathname).toBe('/reset-password');

    const changed = await call('POST', '/api/auth/reset-password', {
      origin: CLUB,
      body: { newPassword: 'a brand new password', token: landing.searchParams.get('token') },
    });
    expect(changed.statusCode).toBe(200);
    await settled();
    const notice = lastTo(emma, 'passwordChanged')!;
    expect(notice.ctx.organization).toMatchObject({ id: acmeId });
    expect(notice.ctx.requestedApp).toMatchObject({ id: clubAppId, domain: CLUB });

    expect((await signIn(emma, LEARN)).statusCode).toBe(401);
    expect((await signIn(emma, LEARN, 'a brand new password')).statusCode).toBe(200);
    expect(await sessionOrg(emma)).toBe(acmeId);
  });

  it('sends no password reset that returns to the domain of an organization the person is not in', async () => {
    const before = sent.length;
    const asked = await call('POST', '/api/auth/request-password-reset', {
      origin: LEARN,
      body: { email: james.email, redirectTo: `${LEARN}/reset-password` },
    });
    expect(asked.statusCode).toBe(200);
    await settled();
    expect(sent.slice(before).filter((email) => email.to === james.email)).toEqual([]);
  });

  it('sends a password reset asked for on the admin app with no organization, at the API address', async () => {
    const asked = await call('POST', '/api/auth/request-password-reset', {
      origin: ADMIN,
      body: { email: james.email, redirectTo: `${ADMIN}/reset-password` },
    });
    expect(asked.statusCode).toBe(200);
    await settled();
    const reset = lastTo(james, 'passwordReset')!;
    expect(reset.ctx.organization).toBeNull();
    expect(reset.ctx.requestedApp).toBeNull();
    expect((reset.params as { resetUrl: string }).resetUrl.startsWith(`${API}/api/auth/`)).toBe(
      true,
    );
  });

  it('sends a sign-in link with its organization and app, and opening it signs the person in on that domain', async () => {
    const asked = await call('POST', '/api/auth/sign-in/magic-link', {
      origin: CLUB,
      body: { email: sarah.email, callbackURL: `${CLUB}/` },
    });
    expect(asked.statusCode).toBe(200);
    await settled();
    const email = lastTo(sarah, 'magicLink')!;
    expect(email.ctx.organization).toMatchObject({ id: acmeId, name: 'Acme' });
    expect(email.ctx.requestedApp).toMatchObject({ id: clubAppId, domain: CLUB });
    const link = new URL((email.params as { url: string }).url);
    expect(link.origin).toBe(CLUB);
    expect(link.pathname).toBe('/api/auth/magic-link/verify');

    sarah.cookies.clear();
    const opened = await call('GET', `${link.pathname}${link.search}`, { as: sarah });
    expect(opened.statusCode).toBe(302);
    expect(opened.headers.location).toBe(`${CLUB}/`);
    expect([opened.headers['set-cookie']].flat().join(';')).not.toMatch(/domain=/i);
    expect(await sessionOrg(sarah)).toBe(acmeId);
    expect((await call('GET', '/api/member/org', { as: sarah, origin: CLUB })).statusCode).toBe(
      200,
    );
  });

  it("creates nothing when the first domain of a new organization is already an app's", async () => {
    const slug = `taken-${tag}`;
    const moved = await call('PATCH', `/api/organizations/apps/${clubAppId}`, {
      as: acmeAdmin,
      origin: ADMIN,
      body: { domain: `https://${slug}.p${tag}.test` },
    });
    expect(moved.statusCode).toBe(200);

    const oliver = new Person('Oliver');
    expect((await signUp(oliver, ADMIN)).statusCode).toBe(200);
    const created = await call('POST', '/api/organizations', {
      as: oliver,
      origin: ADMIN,
      body: { name: 'Taken', slug },
    });
    expect(created.statusCode).toBe(409);
    expect(await container.organizations.getBySlug(slug)).toBeNull();
    const listed = await call('GET', '/api/auth/organization/list', { as: oliver, origin: ADMIN });
    expect(listed.json()).toEqual([]);
    expect(await sessionOrg(oliver)).toBeNull();
  });
});
