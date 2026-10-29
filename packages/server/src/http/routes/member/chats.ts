import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Container } from '../../../app/container.js';
import { actorOf } from './actor.js';
import {
  BlockParam,
  Chat,
  ChatIdParam,
  ChatListItem,
  CommunityParam,
  EditMessage,
  FlagReason,
  PageQuery,
  MarkRead,
  MessageFlag,
  MessageIdParam,
  MessagesPage,
  MessageView,
  MuteChat,
  OrgUserBody,
  Reactions,
  ResolveMessageFlags,
  SendMessage,
  SetReaction,
  StartDirectChat,
  StartGroupChat,
  refusals,
} from '../../schemas/index.js';

export async function memberChatRoutes(app: FastifyInstance, container: Container): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const chats = container.chats;
  const tags = ['Chats'];

  r.route({
    method: 'GET',
    url: '/api/member/communities/:communityId/chats',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'listMemberChats',
      tags,
      summary: 'List your chats in a community',
      description:
        'For a member of the community. Every chat you are in, with your unread count and its last message.',
      params: CommunityParam,
      response: { 200: z.array(ChatListItem), ...refusals(403, 404) },
    },
    handler: async (req) => {
      const actor = await actorOf(container, req.orgId, req.userId);
      return chats.listChats(req.orgId, actor, req.params.communityId);
    },
  });

  r.route({
    method: 'POST',
    url: '/api/member/chats/direct',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'startDirectChat',
      tags,
      summary: 'Start a direct chat, or return the one that already exists',
      description:
        'For a member of the community, within its direct-message settings (403 otherwise). With the community set so a first message is a request, a new chat starts `pending` until the other person accepts it. 409 when you message yourself, send attachments without a body, or start a request without a message.',
      body: StartDirectChat,
      response: { 200: Chat, ...refusals(403, 404, 409) },
    },
    handler: async (req) => {
      const actor = await actorOf(container, req.orgId, req.userId);
      return chats.startDirect(req.orgId, actor, req.body);
    },
  });

  r.route({
    method: 'POST',
    url: '/api/member/chats/group',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'startGroupChat',
      tags,
      summary: 'Start a group chat',
      description:
        "For a member of the community while group chats are on (403 otherwise). Everyone named must hold the community and be someone you may message. 409 when fewer than two others are named or the group would exceed the community's group size.",
      body: StartGroupChat,
      response: { 201: Chat, ...refusals(403, 404, 409) },
    },
    handler: async (req, reply) => {
      const actor = await actorOf(container, req.orgId, req.userId);
      const chat = await chats.startGroup(req.orgId, actor, req.body);
      return reply.code(201).send(chat);
    },
  });

  r.route({
    method: 'POST',
    url: '/api/member/chats/:chatId/participants',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'addChatParticipant',
      tags,
      summary: 'Add a person to a group chat you are in',
      description:
        'For a participant of a group chat. 409 when the chat is direct, the person is already in it, or it is full.',
      params: ChatIdParam,
      body: OrgUserBody,
      response: { 200: Chat, ...refusals(403, 404, 409) },
    },
    handler: async (req) => {
      const actor = await actorOf(container, req.orgId, req.userId);
      return chats.addParticipant(req.orgId, actor, req.params.chatId, req.body.orgUserId);
    },
  });

  r.route({
    method: 'POST',
    url: '/api/member/chats/:chatId/leave',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'leaveChat',
      tags,
      summary: 'Leave a chat',
      description: 'For a participant. The chat stays for the others.',
      params: ChatIdParam,
      response: { 200: Chat, ...refusals(403, 404) },
    },
    handler: async (req) => {
      const actor = await actorOf(container, req.orgId, req.userId);
      return chats.leave(req.orgId, actor, req.params.chatId);
    },
  });

  r.route({
    method: 'POST',
    url: '/api/member/chats/:chatId/acceptance',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'acceptChat',
      tags,
      summary: 'Accept a message request',
      description:
        'For the person the request was sent to. The chat opens for both sides. 409 when the chat is not a pending request.',
      params: ChatIdParam,
      response: { 200: Chat, ...refusals(403, 404, 409) },
    },
    handler: async (req) => {
      const actor = await actorOf(container, req.orgId, req.userId);
      return chats.accept(req.orgId, actor, req.params.chatId);
    },
  });

  r.route({
    method: 'GET',
    url: '/api/member/chats/:chatId/messages',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'listChatMessages',
      tags,
      summary: 'Read the messages in a chat, newest first',
      description: 'For a participant of the chat.',
      params: ChatIdParam,
      querystring: PageQuery,
      response: { 200: MessagesPage, ...refusals(403, 404) },
    },
    handler: async (req) => {
      const actor = await actorOf(container, req.orgId, req.userId);
      return chats.messages(req.orgId, actor, req.params.chatId, req.query);
    },
  });

  r.route({
    method: 'POST',
    url: '/api/member/chats/:chatId/messages',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'sendChatMessage',
      tags,
      summary: 'Send a message',
      description:
        "For a participant while the chat is open and not locked, and nobody in it has blocked the other (403 otherwise). A request's sender cannot send more until it is accepted.",
      params: ChatIdParam,
      body: SendMessage,
      response: { 201: MessageView, ...refusals(403, 404) },
    },
    handler: async (req, reply) => {
      const actor = await actorOf(container, req.orgId, req.userId);
      const message = await chats.send(req.orgId, actor, req.params.chatId, req.body);
      return reply.code(201).send(message);
    },
  });

  r.route({
    method: 'PATCH',
    url: '/api/member/messages/:messageId',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'editChatMessage',
      tags,
      summary: 'Edit your own message',
      description:
        'Sender only, while the chat is open and not locked. 409 when the message is deleted.',
      params: MessageIdParam,
      body: EditMessage,
      response: { 200: MessageView, ...refusals(403, 404, 409) },
    },
    handler: async (req) => {
      const actor = await actorOf(container, req.orgId, req.userId);
      return chats.editMessage(req.orgId, actor, req.params.messageId, req.body.body);
    },
  });

  r.route({
    method: 'DELETE',
    url: '/api/member/messages/:messageId',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'deleteChatMessage',
      tags,
      summary: 'Delete your message, or one in a community you moderate',
      description:
        'For the sender, or a moderator of the community. The message stays in the history, marked deleted. 409 when it is already deleted.',
      params: MessageIdParam,
      response: { 200: MessageView, ...refusals(403, 404, 409) },
    },
    handler: async (req) => {
      const actor = await actorOf(container, req.orgId, req.userId);
      return chats.deleteMessage(req.orgId, actor, req.params.messageId);
    },
  });

  r.route({
    method: 'PUT',
    url: '/api/member/messages/:messageId/reaction',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'setMessageReaction',
      tags,
      summary: 'Set your reaction on a message',
      description:
        'For a participant of the chat. Replaces any reaction you already had and returns the new counts.',
      params: MessageIdParam,
      body: SetReaction,
      response: { 200: Reactions, ...refusals(403, 404) },
    },
    handler: async (req) => {
      const actor = await actorOf(container, req.orgId, req.userId);
      return chats.setReaction(req.orgId, actor, req.params.messageId, req.body.emoji);
    },
  });

  r.route({
    method: 'DELETE',
    url: '/api/member/messages/:messageId/reaction',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'clearMessageReaction',
      tags,
      summary: 'Withdraw your reaction from a message',
      description: 'For a participant of the chat. Returns the new counts.',
      params: MessageIdParam,
      response: { 200: Reactions, ...refusals(403, 404) },
    },
    handler: async (req) => {
      const actor = await actorOf(container, req.orgId, req.userId);
      return chats.setReaction(req.orgId, actor, req.params.messageId, null);
    },
  });

  r.route({
    method: 'POST',
    url: '/api/member/messages/:messageId/flags',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'flagMessage',
      tags,
      summary: 'Flag a message for the moderators',
      description:
        'For a participant of the chat. Flagging it again while your flag is open returns that flag.',
      params: MessageIdParam,
      body: FlagReason,
      response: { 201: MessageFlag, ...refusals(403, 404) },
    },
    handler: async (req, reply) => {
      const actor = await actorOf(container, req.orgId, req.userId);
      const flag = await chats.flagMessage(req.orgId, actor, req.params.messageId, req.body.reason);
      return reply.code(201).send(flag);
    },
  });

  r.route({
    method: 'POST',
    url: '/api/member/messages/:messageId/flags/resolution',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'resolveMessageFlags',
      tags,
      summary: 'Dismiss the open flags on a message in a community you moderate',
      description:
        'For a moderator who is a member of the community. Closes every open flag and leaves the message up.',
      params: MessageIdParam,
      body: ResolveMessageFlags,
      response: { 204: z.void(), ...refusals(403, 404) },
    },
    handler: async (req, reply) => {
      const actor = await actorOf(container, req.orgId, req.userId);
      await chats.resolveMessageFlags(req.orgId, actor, req.params.messageId, req.body.resolution);
      return reply.code(204).send();
    },
  });

  r.route({
    method: 'POST',
    url: '/api/member/chats/:chatId/read',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'markChatRead',
      tags,
      summary: 'Mark a chat read up to a message',
      description: 'For a participant. The message must be in the chat (404 otherwise).',
      params: ChatIdParam,
      body: MarkRead,
      response: { 204: z.void(), ...refusals(403, 404) },
    },
    handler: async (req, reply) => {
      const actor = await actorOf(container, req.orgId, req.userId);
      await chats.markRead(req.orgId, actor, req.params.chatId, req.body.messageId);
      return reply.code(204).send();
    },
  });

  r.route({
    method: 'POST',
    url: '/api/member/chats/:chatId/mute',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'muteChat',
      tags,
      summary: 'Mute a chat until a time, or until unmuted',
      description: 'For a participant. Without `until` the chat stays muted until you unmute it.',
      params: ChatIdParam,
      body: MuteChat,
      response: { 204: z.void(), ...refusals(403, 404) },
    },
    handler: async (req, reply) => {
      const actor = await actorOf(container, req.orgId, req.userId);
      await chats.mute(req.orgId, actor, req.params.chatId, req.body.until);
      return reply.code(204).send();
    },
  });

  r.route({
    method: 'POST',
    url: '/api/member/chats/:chatId/unmute',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'unmuteChat',
      tags,
      summary: 'Unmute a chat',
      description: 'For a participant.',
      params: ChatIdParam,
      response: { 204: z.void(), ...refusals(403, 404) },
    },
    handler: async (req, reply) => {
      const actor = await actorOf(container, req.orgId, req.userId);
      await chats.unmute(req.orgId, actor, req.params.chatId);
      return reply.code(204).send();
    },
  });

  r.route({
    method: 'POST',
    url: '/api/member/chats/:chatId/lock',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'lockChat',
      tags,
      summary: 'Lock a chat in a community you moderate',
      description:
        'For a moderator who is a member of the community. Nobody can send or edit messages until it is unlocked; its open message flags are resolved as `locked`. Locking a locked chat returns it unchanged.',
      params: ChatIdParam,
      response: { 200: Chat, ...refusals(403, 404) },
    },
    handler: async (req) => {
      const actor = await actorOf(container, req.orgId, req.userId);
      return chats.lock(req.orgId, actor, req.params.chatId);
    },
  });

  r.route({
    method: 'POST',
    url: '/api/member/chats/:chatId/unlock',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'unlockChat',
      tags,
      summary: 'Unlock a chat in a community you moderate',
      description:
        'For a moderator who is a member of the community. Unlocking an unlocked chat returns it unchanged.',
      params: ChatIdParam,
      response: { 200: Chat, ...refusals(403, 404) },
    },
    handler: async (req) => {
      const actor = await actorOf(container, req.orgId, req.userId);
      return chats.unlock(req.orgId, actor, req.params.chatId);
    },
  });

  r.route({
    method: 'PUT',
    url: '/api/member/communities/:communityId/blocks/:orgUserId',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'blockMember',
      tags,
      summary: 'Block a person in a community',
      description:
        'For a member of the community. Neither of you can message the other there; a direct chat between you closes. Blocking twice is harmless. 409 when you block yourself.',
      params: BlockParam,
      response: { 204: z.void(), ...refusals(403, 404, 409) },
    },
    handler: async (req, reply) => {
      const actor = await actorOf(container, req.orgId, req.userId);
      await chats.block(req.orgId, actor, req.params.communityId, req.params.orgUserId);
      return reply.code(204).send();
    },
  });

  r.route({
    method: 'DELETE',
    url: '/api/member/communities/:communityId/blocks/:orgUserId',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'unblockMember',
      tags,
      summary: 'Unblock a person in a community',
      description:
        'For a member of the community. A direct chat closed by the block reopens unless a moderator locked it. 409 when you unblock yourself.',
      params: BlockParam,
      response: { 204: z.void(), ...refusals(403, 404, 409) },
    },
    handler: async (req, reply) => {
      const actor = await actorOf(container, req.orgId, req.userId);
      await chats.unblock(req.orgId, actor, req.params.communityId, req.params.orgUserId);
      return reply.code(204).send();
    },
  });
}
