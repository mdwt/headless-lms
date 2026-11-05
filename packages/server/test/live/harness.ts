import { randomBytes, randomUUID } from 'node:crypto';
import { connect, type Socket } from 'node:net';
import type { FastifyInstance } from 'fastify';
import { PostgresPubSub } from '@headless-lms/adapter-pubsub-postgres';
import type { ChatLiveEvent } from '@headless-lms/core/discussion';
import type { Actor } from '@headless-lms/core/shared/actor';
import type { EmailMessage } from '@headless-lms/core/shared/ports';
import type { EmailTemplateId, TemplateRenderer } from '@headless-lms/core/types';
import {
  buildServer,
  createContainer,
  runMigrations,
  type Container,
  type ServerConfig,
} from '../../src/index.js';

export const DATABASE_URL = process.env.TEST_DATABASE_URL;
export const ORIGIN = 'http://localhost:3999';
const AUTH_URL = 'http://localhost:3990';
const PASSWORD = 'correct horse battery staple';
const SECRET = randomBytes(32).toString('base64');
const CREDENTIAL_KEY = randomBytes(32).toString('base64');

export const LIVE = { flushMs: 100, checkMs: 400, checkJitterMs: 100, closeTimeoutMs: 2000 };

export interface Instance {
  name: string;
  app: FastifyInstance;
  container: Container;
  url: string;
}

export interface Mailbox {
  resetUrls: Map<string, string>;
}

export interface Member {
  name: string;
  email: string;
  password: string;
  userId: string;
  orgUserId: string;
  grantId: string | null;
  cookies: Map<string, string>;
}

export interface World {
  orgId: string;
  orgExternalId: string;
  communityId: string;
  otherCommunityId: string;
  owner: Member;
  ownerActor: Actor;
  mailbox: Mailbox;
  join(
    name: string,
    options?: { community?: string | null; bundleId?: string; expiresAt?: Date },
  ): Promise<Member>;
}

export function migrate(): Promise<void> {
  return runMigrations(DATABASE_URL!);
}

function serverConfig(): ServerConfig {
  return {
    port: 0,
    host: '127.0.0.1',
    publicUrl: AUTH_URL,
    clientOrigins: [ORIGIN],
    requestLogging: false,
    deliveryExpirySeconds: 300,
    memberImageMaxBytes: 10 * 1024 * 1024,
    pubsubDatabaseUrl: DATABASE_URL!,
    container: {
      databaseUrl: DATABASE_URL!,
      authBaseURL: AUTH_URL,
      authSecret: SECRET,
      trustedOrigins: [ORIGIN, AUTH_URL],
      credentialStoreKey: CREDENTIAL_KEY,
      studentPortalUrl: ORIGIN,
      adminAppUrl: ORIGIN,
      deliveryExpirySeconds: 300,
      memberImageMaxBytes: 10 * 1024 * 1024,
      outbox: { pollIntervalMs: 50 },
      logging: { level: 'error' },
    },
  };
}

function capture(mailbox: Mailbox): {
  templates: TemplateRenderer;
  email: { send(message: EmailMessage): Promise<void> };
} {
  return {
    templates: {
      async render(id: EmailTemplateId, _ctx: unknown, params: unknown) {
        return { subject: id, text: JSON.stringify(params), html: '' };
      },
    } as TemplateRenderer,
    email: {
      async send(message: EmailMessage) {
        if (message.subject === 'passwordReset') {
          const { resetUrl } = JSON.parse(message.text) as { resetUrl: string };
          mailbox.resetUrls.set(message.to, resetUrl);
        }
      },
    },
  };
}

/** One API instance on a random port: its own container, PubSub, hub and relay. */
export async function startInstance(
  name: string,
  mailbox: Mailbox,
  options: { pubsub?: boolean } = {},
): Promise<Instance> {
  const config = serverConfig();
  const container = await createContainer(config, {
    adapters: {
      ...capture(mailbox),
      ...(options.pubsub !== false && {
        pubsub: (logger) => new PostgresPubSub({ connectionString: DATABASE_URL!, logger }),
      }),
    },
    live: LIVE,
  });
  const app = await buildServer(config, container);
  const url = await app.listen({ port: 0, host: '127.0.0.1' });
  await container.pubsub?.start();
  await container.chatHub?.start();
  container.outboxRelay.start();
  return { name, app, container, url };
}

export function cookieHeader(cookies: Map<string, string>): string {
  return [...cookies].map(([key, value]) => `${key}=${value}`).join('; ');
}

function keep(cookies: Map<string, string>, res: Response): void {
  for (const line of res.headers.getSetCookie()) {
    const [pair, ...attributes] = line.split(';');
    const at = pair!.indexOf('=');
    const key = pair!.slice(0, at).trim();
    const value = pair!.slice(at + 1).trim();
    const expired = attributes.some((attribute) => /^\s*max-age=0\s*$/i.test(attribute));
    if (expired || value === '') {
      cookies.delete(key);
    } else {
      cookies.set(key, value);
    }
  }
}

/** A request as a browser at ORIGIN makes it: the member's cookies, kept up to date. */
export async function call(
  instance: Instance,
  method: string,
  path: string,
  member: Member | null,
  body?: unknown,
): Promise<Response> {
  const res = await fetch(`${instance.url}${path}`, {
    method,
    headers: {
      origin: ORIGIN,
      ...(member && { cookie: cookieHeader(member.cookies) }),
      ...(body !== undefined && { 'content-type': 'application/json' }),
    },
    ...(body !== undefined && { body: JSON.stringify(body) }),
  });
  if (member) {
    keep(member.cookies, res);
  }
  return res;
}

export async function json<T = Record<string, unknown>>(res: Response): Promise<T> {
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${res.status} ${text}`);
  }
  return (text ? JSON.parse(text) : null) as T;
}

async function signUp(instance: Instance, name: string): Promise<Member & { authUserId: string }> {
  const email = `${name.toLowerCase().replace(/\s+/g, '.')}.${randomUUID().slice(0, 8)}@live.test`;
  const member = {
    name,
    email,
    password: PASSWORD,
    userId: '',
    orgUserId: '',
    grantId: null,
    cookies: new Map<string, string>(),
  };
  const created = await json<{ user: { id: string } }>(
    await call(instance, 'POST', '/api/auth/sign-up/email', member, {
      email,
      password: PASSWORD,
      name,
    }),
  );
  return { ...member, authUserId: created.user.id };
}

/** Signs the member in again; the new session carries their only organization. */
export async function signIn(instance: Instance, member: Member): Promise<void> {
  member.cookies.clear();
  await json(
    await call(instance, 'POST', '/api/auth/sign-in/email', member, {
      email: member.email,
      password: member.password,
    }),
  );
}

/** Seeds the example org through the services: the org and its owner, the
 *  Spring cohort community and a second one, and members who join it. */
export async function seed(instance: Instance, mailbox: Mailbox): Promise<World> {
  const { container } = instance;
  const owner = await signUp(instance, 'Oliver');
  const org = await json<{ id: string }>(
    await call(instance, 'POST', '/api/organizations', owner, {
      name: 'Spanish in 90 Days',
      slug: `spanish-${randomUUID().slice(0, 8)}`,
    }),
  );
  const domainOrg = await container.organizations.getByExternalId(org.id);
  const ownerUser = await container.identity.getUserByExternalId(owner.authUserId);
  const ownerOrgUser = await container.organizations.getOrgUser(domainOrg!.id, ownerUser!.id);
  owner.userId = ownerUser!.id;
  owner.orgUserId = ownerOrgUser!.id;
  await signIn(instance, owner);
  const orgId = domainOrg!.id;
  const ownerActor = (await container.organizations.actorFor(orgId, owner.orgUserId))!;
  const community = await container.content.createCommunity({ title: 'Spring cohort' }, ownerActor);
  await container.content.publishCommunity(community.id, ownerActor);
  const other = await container.content.createCommunity({ title: 'Autumn cohort' }, ownerActor);
  await container.content.publishCommunity(other.id, ownerActor);

  const join = async (
    name: string,
    options: { community?: string | null; bundleId?: string; expiresAt?: Date } = {},
  ): Promise<Member> => {
    const person = await signUp(instance, name);
    const user = await container.identity.getUserByExternalId(person.authUserId);
    const orgUser = await container.organizations.addOrgUser({ orgId, userId: user!.id });
    await container.orgProvider.grantMembership(org.id, person.authUserId);
    await signIn(instance, person);
    const contentId = options.community === undefined ? community.id : options.community;
    const expiresAt = options.expiresAt ?? null;
    const grant = options.bundleId
      ? await container.entitlements.grant(
          { orgUserId: orgUser.id, bundleId: options.bundleId, expiresAt },
          ownerActor,
        )
      : contentId
        ? await container.entitlements.grant(
            { orgUserId: orgUser.id, contentId, expiresAt },
            ownerActor,
          )
        : null;
    const { authUserId: _authUserId, ...member } = person;
    return { ...member, userId: user!.id, orgUserId: orgUser.id, grantId: grant?.id ?? null };
  };

  return {
    orgId,
    orgExternalId: org.id,
    communityId: community.id,
    otherCommunityId: other.id,
    owner,
    ownerActor,
    mailbox,
    join,
  };
}

export function newMailbox(): Mailbox {
  return { resetUrls: new Map() };
}

/** Sarah starts a direct chat with James and he accepts it. */
export async function directChat(instance: Instance, world: World, from: Member, to: Member) {
  const chat = await json<{ id: string }>(
    await call(instance, 'POST', '/api/member/chats/direct', from, {
      communityId: world.communityId,
      orgUserId: to.orgUserId,
      body: `Hola ${to.name}`,
    }),
  );
  await json(await call(instance, 'POST', `/api/member/chats/${chat.id}/acceptance`, to));
  return chat.id;
}

export interface LiveStream {
  status: number;
  headers: Headers;
  body: string;
  events: ChatLiveEvent[];
  arrivals: number[];
  ended: Promise<void>;
  waitFor<T extends ChatLiveEvent['type']>(
    type: T,
    match?: (event: Extract<ChatLiveEvent, { type: T }>) => boolean,
    timeoutMs?: number,
  ): Promise<Extract<ChatLiveEvent, { type: T }>>;
  abort(): void;
}

/** Opens the chat stream as the member's browser does, and parses its frames. */
export async function openStream(
  instance: Instance,
  member: Member | null,
  communityId: string,
): Promise<LiveStream> {
  const controller = new AbortController();
  const res = await fetch(`${instance.url}/api/member/communities/${communityId}/chats/events`, {
    headers: {
      origin: ORIGIN,
      accept: 'text/event-stream',
      ...(member && { cookie: cookieHeader(member.cookies) }),
    },
    signal: controller.signal,
  });
  const events: ChatLiveEvent[] = [];
  const arrivals: number[] = [];
  const listeners = new Set<() => void>();
  let finished = false;
  if (res.status !== 200) {
    const body = await res.text();
    return {
      status: res.status,
      headers: res.headers,
      body,
      events,
      arrivals,
      ended: Promise.resolve(),
      waitFor: () => Promise.reject(new Error(`stream refused: ${res.status} ${body}`)),
      abort: () => {},
    };
  }
  const ended = (async () => {
    const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = '';
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) {
          break;
        }
        buffer += value;
        let at: number;
        while ((at = buffer.indexOf('\n\n')) >= 0) {
          const frame = buffer.slice(0, at);
          buffer = buffer.slice(at + 2);
          const data = frame
            .split('\n')
            .filter((line) => line.startsWith('data: '))
            .map((line) => line.slice(6))
            .join('\n');
          if (data) {
            events.push(JSON.parse(data) as ChatLiveEvent);
            arrivals.push(Date.now());
            for (const listener of listeners) {
              listener();
            }
          }
        }
      }
    } catch {
      return;
    } finally {
      finished = true;
      for (const listener of listeners) {
        listener();
      }
    }
  })();
  return {
    status: res.status,
    headers: res.headers,
    body: '',
    events,
    arrivals,
    ended,
    waitFor(type, match = () => true, timeoutMs = 10_000) {
      type Found = Extract<ChatLiveEvent, { type: typeof type }>;
      const find = () =>
        events.find((event): event is Found => event.type === type && match(event as Found));
      return new Promise((resolve, reject) => {
        const check = () => {
          const found = find();
          if (found) {
            done();
            resolve(found);
          } else if (finished) {
            done();
            reject(new Error(`stream ended without ${type}: ${JSON.stringify(events)}`));
          }
        };
        const timer = setTimeout(() => {
          done();
          reject(new Error(`no ${type} within ${timeoutMs} ms: ${JSON.stringify(events)}`));
        }, timeoutMs);
        const done = () => {
          clearTimeout(timer);
          listeners.delete(check);
        };
        listeners.add(check);
        check();
      });
    },
    abort: () => controller.abort(),
  };
}

/** A stream client that sends the request and then never reads. */
export function stalledStream(instance: Instance, member: Member, communityId: string): Socket {
  const { port } = new URL(instance.url);
  const socket = connect(Number(port), '127.0.0.1');
  socket.pause();
  socket.write(
    [
      `GET /api/member/communities/${communityId}/chats/events HTTP/1.1`,
      'Host: 127.0.0.1',
      `Origin: ${ORIGIN}`,
      `Cookie: ${cookieHeader(member.cookies)}`,
      '',
      '',
    ].join('\r\n'),
  );
  return socket;
}

export async function stop(...instances: Instance[]): Promise<void> {
  await Promise.all(instances.map((instance) => instance.app.close()));
}

export interface LiveEnv {
  a: Instance;
  b: Instance;
  mailbox: Mailbox;
  world: World;
}

/** Two instances, A and B, on one database, and the example org seeded through A. */
export async function startEnv(): Promise<LiveEnv> {
  await migrate();
  const mailbox = newMailbox();
  const a = await startInstance('A', mailbox);
  const b = await startInstance('B', mailbox);
  const world = await seed(a, mailbox);
  return { a, b, mailbox, world };
}
