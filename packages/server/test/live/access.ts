import { beforeAll, describe, expect, it } from 'vitest';
import type { MessageView } from '@headless-lms/core/types';
import {
  LIVE,
  call,
  directChat,
  json,
  openStream,
  startInstance,
  stop,
  type Instance,
  type LiveEnv,
  type Mailbox,
  type Member,
  type World,
} from './harness.js';

const WITHIN = 35_000;

export function access(env: () => LiveEnv): void {
  describe('access', () => {
    let a: Instance;
    let mailbox: Mailbox;
    let world: World;

    beforeAll(() => {
      ({ a, mailbox, world } = env());
    });

    const connect = (member: Member | null) => openStream(a, member, world.communityId);

    it('refuses no cookie with 401, a member of another community with 403, and a server without PubSub with 503', async () => {
      expect((await connect(null)).status).toBe(401);

      const henry = await world.join('Henry', { community: world.otherCommunityId });
      expect((await connect(henry)).status).toBe(403);

      const c = await startInstance('C', mailbox, { pubsub: false });
      try {
        const refused = await openStream(c, henry, world.otherCommunityId);
        expect(refused.status).toBe(503);
        expect(c.container.pubsub).toBeNull();
        expect(c.container.chatHub).toBeNull();
      } finally {
        await stop(c);
      }
    });

    it('closes with access when the grant is revoked, expires, or the bundle loses the community', async () => {
      const sarah = await world.join('Sarah');
      const lucy = await world.join('Lucy', { expiresAt: new Date(Date.now() + 1500) });
      const bundle = await a.container.content.createBundle(
        { name: 'Spring bundle', contentIds: [world.communityId] },
        world.ownerActor,
      );
      const henry = await world.join('Harry', { bundleId: bundle.id });

      const streams = await Promise.all([sarah, lucy, henry].map(connect));
      await Promise.all(streams.map((stream) => stream.waitFor('ready')));

      await a.container.entitlements.setStatus(sarah.grantId!, 'revoked', world.ownerActor);
      await a.container.content.removeBundleItem(bundle.id, world.communityId, world.ownerActor);
      await new Promise((resolve) => setTimeout(resolve, 1600));
      await a.container.entitlements.expireDueGrants(new Date());

      for (const stream of streams) {
        const closed = await stream.waitFor('closed', undefined, WITHIN);
        expect(closed.reason).toBe('access');
        await stream.ended;
      }
      for (const member of [sarah, lucy, henry]) {
        expect((await connect(member)).status).toBe(403);
      }
    });

    it('closes with session when the member signs out in that browser', async () => {
      const jack = await world.join('Jack');
      const stream = await connect(jack);
      await stream.waitFor('ready');

      await json(await call(a, 'POST', '/api/auth/sign-out', jack, {}));

      expect((await stream.waitFor('closed', undefined, WITHIN)).reason).toBe('session');
      expect((await connect(jack)).status).toBe(401);
    });

    it('closes with session when the member resets their password', async () => {
      const amelia = await world.join('Amelia');
      const stream = await connect(amelia);
      await stream.waitFor('ready');

      await json(
        await call(a, 'POST', '/api/auth/request-password-reset', null, {
          email: amelia.email,
          redirectTo: 'http://localhost:3999/reset-password',
        }),
      );
      const deadline = Date.now() + 5000;
      while (!mailbox.resetUrls.has(amelia.email) && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      const token = /reset-password\/([^?/]+)/.exec(mailbox.resetUrls.get(amelia.email) ?? '')?.[1];
      expect(token).toBeTruthy();
      await json(
        await call(a, 'POST', '/api/auth/reset-password', null, {
          newPassword: 'a whole new passphrase',
          token,
        }),
      );

      expect((await stream.waitFor('closed', undefined, WITHIN)).reason).toBe('session');
      expect((await connect(amelia)).status).toBe(401);
    });

    it('closes with access when the member is removed from the org', async () => {
      const emma = await world.join('Emma');
      const stream = await connect(emma);
      await stream.waitFor('ready');

      await a.container.organizations.removePerson(emma.orgUserId, world.ownerActor);

      expect((await stream.waitFor('closed', undefined, WITHIN)).reason).toBe('access');
    });

    it('keeps the stream open while the session check fails, and checks again', async () => {
      const sarah = await world.join('Sophie');
      const james = await world.join('Jake');
      const chatId = await directChat(a, world, sarah, james);
      const stream = await connect(sarah);
      await stream.waitFor('ready');

      const auth = a.container.auth;
      const verify = auth.verify.bind(auth);
      let failed = 0;
      auth.verify = async (headers, options) => {
        if (options?.bypassCookieCache) {
          failed += 1;
          throw new Error('session store unreachable');
        }
        return verify(headers, options);
      };
      try {
        const deadline = Date.now() + 10 * (LIVE.checkMs + LIVE.checkJitterMs);
        while (failed < 2 && Date.now() < deadline) {
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
        expect(failed).toBeGreaterThanOrEqual(2);
        expect(stream.events.some((event) => event.type === 'closed')).toBe(false);
      } finally {
        delete (auth as { verify?: unknown }).verify;
      }

      const sent = await json<MessageView>(
        await call(a, 'POST', `/api/member/chats/${chatId}/messages`, james, {
          body: 'Sigues ahí?',
        }),
      );
      await stream.waitFor('message.created', (event) => event.message.id === sent.id);
      expect(stream.events.some((event) => event.type === 'closed')).toBe(false);
      stream.abort();
    });
  });
}
