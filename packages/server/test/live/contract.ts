import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import type { ChatService } from '@headless-lms/core/discussion';
import type { MessageView } from '@headless-lms/core/types';
import {
  call,
  directChat,
  json,
  openStream,
  stalledStream,
  startInstance,
  type Instance,
  type LiveEnv,
  type Member,
  type World,
} from './harness.js';

const STREAM_PATH = '/api/member/communities/{communityId}/chats/events';
const BURST_WIDTH = 4;

export function contract(env: () => LiveEnv): void {
  describe('contract and operations', () => {
    let a: Instance;
    let b: Instance;
    let world: World;
    let sarah: Member;
    let james: Member;
    let chatId: string;

    beforeAll(async () => {
      ({ a, b, world } = env());
      sarah = await world.join('Sarah');
      james = await world.join('James');
      chatId = await directChat(a, world, sarah, james);
    }, 30_000);

    it('declares the stream as text/event-stream', () => {
      const spec = a.app.swagger() as unknown as {
        paths: Record<
          string,
          Record<
            string,
            { operationId: string; responses: Record<string, { content: Record<string, unknown> }> }
          >
        >;
      };
      const operation = spec.paths[STREAM_PATH]!.get!;
      expect(operation.operationId).toBe('streamMemberChatEvents');
      expect(Object.keys(operation.responses['200']!.content)).toEqual(['text/event-stream']);
    });

    it('sends every open stream, and one past routing, the shutdown frame when the app closes', async () => {
      const s = await startInstance('S');
      const open = await Promise.all(
        [sarah, james].map((member) => openStream(s, member, world.communityId)),
      );
      await Promise.all(open.map((stream) => stream.waitFor('ready')));

      let entered!: () => void;
      const inWatch = new Promise<void>((resolve) => {
        entered = resolve;
      });
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const chats = s.container.chats as ChatService;
      const watch = chats.watch.bind(chats);
      chats.watch = async (...args) => {
        entered();
        await gate;
        return watch(...args);
      };
      const hub = s.container.chatHub!;
      const close = hub.close.bind(hub);
      let closing!: () => void;
      const closeStarted = new Promise<void>((resolve) => {
        closing = resolve;
      });
      hub.close = () => {
        const done = close();
        closing();
        return done;
      };

      const late = openStream(s, sarah, world.communityId);
      await inWatch;
      const closed = s.app.close();
      await closeStarted;
      release();

      const stream = await late;
      expect(stream.status).toBe(200);
      expect(await stream.waitFor('closed')).toEqual({ type: 'closed', reason: 'shutdown' });
      for (const each of open) {
        expect(await each.waitFor('closed')).toEqual({ type: 'closed', reason: 'shutdown' });
        await each.ended;
      }
      await closed;
    }, 20_000);

    it('records the delivery time of a burst of sends across the two instances', async () => {
      const sarahOnA = await openStream(a, sarah, world.communityId);
      const jamesOnB = await openStream(b, james, world.communityId);
      await Promise.all([sarahOnA.waitFor('ready'), jamesOnB.waitFor('ready')]);

      const sends = Array.from({ length: 40 }, (_, i) => {
        const fromSarah = i % 2 === 0;
        return {
          from: fromSarah ? sarah : james,
          via: fromSarah ? a : b,
          to: fromSarah ? jamesOnB : sarahOnA,
        };
      });
      const committed: { id: string; at: number }[] = [];
      for (let i = 0; i < sends.length; i += BURST_WIDTH) {
        const wave = sends.slice(i, i + BURST_WIDTH).map(async ({ from, via }, j) => {
          const message = await json<MessageView>(
            await call(via, 'POST', `/api/member/chats/${chatId}/messages`, from, {
              body: `burst ${i + j}`,
              clientId: randomUUID(),
            }),
          );
          committed[i + j] = { id: message.id, at: Date.now() };
        });
        await Promise.all(wave);
      }
      const latencies = await Promise.all(
        sends.map(async ({ to }, i) => {
          const { id, at } = committed[i]!;
          await to.waitFor('message.created', (event) => event.message.id === id, 20_000);
          const index = to.events.findIndex(
            (event) => event.type === 'message.created' && event.message.id === id,
          );
          return to.arrivals[index]! - at;
        }),
      );
      const sorted = [...latencies].sort((x, y) => x - y);
      const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
      console.info(
        `burst of ${sends.length} sends, commit to message.created on the other instance: p50 ${at(0.5)} ms, p95 ${at(0.95)} ms, max ${sorted.at(-1)} ms`,
      );
      expect(sorted.at(-1)!).toBeLessThan(10_000);

      sarahOnA.abort();
      jamesOnB.abort();
    }, 60_000);

    it('ends the stream of a client that stops reading within 30 s of the first undrained write', async () => {
      const emma = await world.join('Emma');
      const group = await json<{ id: string }>(
        await call(a, 'POST', '/api/member/chats/group', sarah, {
          communityId: world.communityId,
          orgUserIds: [james.orgUserId, emma.orgUserId],
        }),
      );
      const socket = stalledStream(a, emma, world.communityId);
      const closed = new Promise<void>((resolve) => socket.on('close', () => resolve()));
      await new Promise((resolve) => setTimeout(resolve, 500));

      const body = 'x'.repeat(10_000);
      for (let i = 0; i < 600; i += 1) {
        await json(
          await call(a, 'POST', `/api/member/chats/${group.id}/messages`, sarah, { body }),
        );
      }
      const flooded = Date.now();

      await new Promise((resolve) => setTimeout(resolve, 31_000));
      socket.resume();
      let ended = false;
      await Promise.race([
        closed.then(() => {
          ended = true;
        }),
        new Promise((resolve) => setTimeout(resolve, 5000)),
      ]);
      socket.destroy();
      expect(ended, `stream still open ${Date.now() - flooded} ms after the flood`).toBe(true);
    }, 120_000);
  });
}
