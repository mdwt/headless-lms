import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import type { ChatListItem } from '@headless-lms/core/discussion';
import type { MessageView } from '@headless-lms/core/types';
import {
  call,
  directChat,
  json,
  openStream,
  type Instance,
  type LiveEnv,
  type Member,
  type World,
} from './harness.js';

type Page<T> = { rows: T[] };

export function twoInstances(env: () => LiveEnv): void {
  describe('two instances', () => {
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

    const send = async (instance: Instance, member: Member, body: string) =>
      json<MessageView>(
        await call(instance, 'POST', `/api/member/chats/${chatId}/messages`, member, {
          body,
          clientId: randomUUID(),
        }),
      );

    it('delivers what James sends through B to Sarah on A and to his second tab on B', async () => {
      const sarahOnA = await openStream(a, sarah, world.communityId);
      const jamesOnB = await openStream(b, james, world.communityId);
      await Promise.all([sarahOnA.waitFor('ready'), jamesOnB.waitFor('ready')]);

      const body = '¿Qué tal, Sarah? "quotes" \\ backslash 🙂 你好';
      const clientId = randomUUID();
      const sent = await json<MessageView>(
        await call(b, 'POST', `/api/member/chats/${chatId}/messages`, james, { body, clientId }),
      );

      const [onA, onB] = await Promise.all([
        sarahOnA.waitFor('message.created', (event) => event.message.id === sent.id),
        jamesOnB.waitFor('message.created', (event) => event.message.id === sent.id),
      ]);
      expect(onA.chatId).toBe(chatId);
      expect(onA.message.body).toBe(body);
      expect(onA.message.clientId).toBe(clientId);
      expect(onA.message.sender.firstName).toBe('James');
      expect(onA.message).not.toHaveProperty('viewerReaction');
      expect(onB.message.body).toBe(body);
      await sarahOnA.waitFor('chat.state', (event) => event.chatId === chatId && event.unread > 0);

      sarahOnA.abort();
      jamesOnB.abort();
    });

    it('carries an edit, a reaction and a delete made through A to both instances', async () => {
      const sarahOnA = await openStream(a, sarah, world.communityId);
      const jamesOnB = await openStream(b, james, world.communityId);
      await Promise.all([sarahOnA.waitFor('ready'), jamesOnB.waitFor('ready')]);
      const both = <T extends Parameters<typeof sarahOnA.waitFor>[0]>(
        type: T,
        match: Parameters<typeof sarahOnA.waitFor<T>>[1],
      ) => Promise.all([sarahOnA.waitFor(type, match), jamesOnB.waitFor(type, match)]);

      const sent = await send(a, sarah, 'Nos vemos mañana');
      await both('message.created', (event) => event.message.id === sent.id);

      await json(
        await call(a, 'PATCH', `/api/member/messages/${sent.id}`, sarah, {
          body: 'Nos vemos el viernes',
        }),
      );
      const [edited] = await both(
        'message.updated',
        (event) => event.message.id === sent.id && event.message.body === 'Nos vemos el viernes',
      );
      expect(edited.message.editedAt).not.toBeNull();

      await json(
        await call(a, 'PUT', `/api/member/messages/${sent.id}/reaction`, james, { emoji: '👍' }),
      );
      const [reacted, reactedOnB] = await both(
        'message.reactions',
        (event) => event.messageId === sent.id,
      );
      expect(reacted).toMatchObject({
        chatId,
        reactions: { '👍': 1 },
        orgUserId: james.orgUserId,
        reaction: '👍',
      });
      expect(reactedOnB.reactions).toEqual({ '👍': 1 });

      await json(await call(a, 'DELETE', `/api/member/messages/${sent.id}`, sarah));
      const [deleted] = await both('message.deleted', (event) => event.messageId === sent.id);
      expect(deleted.chatId).toBe(chatId);
      expect(deleted).not.toHaveProperty('message');

      sarahOnA.abort();
      jamesOnB.abort();
    });

    it('gives Sarah what she missed through the loads after she reconnects to B', async () => {
      const first = await openStream(a, sarah, world.communityId);
      await first.waitFor('ready');
      first.abort();
      await first.ended;

      const one = await send(b, james, 'Primer mensaje');
      const two = await send(b, james, 'Segundo mensaje');
      await json(
        await call(b, 'PATCH', `/api/member/messages/${one.id}`, james, {
          body: 'Primer mensaje, editado',
        }),
      );

      const again = await openStream(b, sarah, world.communityId);
      await again.waitFor('ready');
      const unread = await again.waitFor('unread');
      expect(unread.unread).toBeGreaterThanOrEqual(2);

      const [inbox, requests, messages] = await Promise.all([
        call(b, 'GET', `/api/member/communities/${world.communityId}/chats?requests=false`, sarah),
        call(b, 'GET', `/api/member/communities/${world.communityId}/chats?requests=true`, sarah),
        call(b, 'GET', `/api/member/chats/${chatId}/messages`, sarah),
      ]);
      const rows = (await json<Page<ChatListItem>>(inbox)).rows;
      const row = rows.find((item) => item.chat.id === chatId);
      expect(row?.lastMessage?.id).toBe(two.id);
      expect(row?.participants.map((person) => person.firstName).sort()).toEqual([
        'James',
        'Sarah',
      ]);
      expect((await json<Page<ChatListItem>>(requests)).rows).toEqual([]);
      const page = (await json<Page<MessageView>>(messages)).rows;
      expect(page.find((message) => message.id === one.id)?.body).toBe('Primer mensaje, editado');
      expect(page.find((message) => message.id === two.id)?.body).toBe('Segundo mensaje');

      again.abort();
    });
  });
}
