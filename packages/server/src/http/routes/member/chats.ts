import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Container } from '../../../app/container.js';
import { UnauthorizedError } from '../../plugins/auth.js';
import {
  BlockParam,
  Chat,
  ChatIdParam,
  ChatListItem,
  CommunityParam,
  EditMessage,
  ErrorBody,
  FlagReason,
  ListQuery,
  MarkRead,
  MessageFlag,
  MessageIdParam,
  MessagesPage,
  MessageView,
  MuteChat,
  OrgUserBody,
  ResolveMessageFlags,
  SendMessage,
  SetReaction,
  StartDirectChat,
  StartGroupChat,
} from '../../schemas/index.js';

const errors = { 401: ErrorBody, 403: ErrorBody, 404: ErrorBody, 409: ErrorBody };

async function actorOf(container: Container, orgId: string, userId: string) {
  const orgUser = await container.organizations.getOrgUser(orgId, userId);
  if (!orgUser) {
    throw new UnauthorizedError();
  }
  return orgUser;
}

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
      params: CommunityParam,
      response: { 200: z.array(ChatListItem), ...errors },
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
      body: StartDirectChat,
      response: { 200: Chat, ...errors },
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
      body: StartGroupChat,
      response: { 201: Chat, ...errors },
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
      summary: 'Add a person to a group chat',
      params: ChatIdParam,
      body: OrgUserBody,
      response: { 200: Chat, ...errors },
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
      params: ChatIdParam,
      response: { 200: Chat, ...errors },
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
      params: ChatIdParam,
      response: { 200: Chat, ...errors },
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
      summary: 'Read the messages in a chat',
      params: ChatIdParam,
      querystring: ListQuery,
      response: { 200: MessagesPage, ...errors },
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
      params: ChatIdParam,
      body: SendMessage,
      response: { 201: MessageView, ...errors },
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
      params: MessageIdParam,
      body: EditMessage,
      response: { 200: MessageView, ...errors },
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
      summary: 'Delete a message',
      params: MessageIdParam,
      response: { 200: MessageView, ...errors },
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
      params: MessageIdParam,
      body: SetReaction,
      response: { 204: z.void(), ...errors },
    },
    handler: async (req, reply) => {
      const actor = await actorOf(container, req.orgId, req.userId);
      await chats.setReaction(req.orgId, actor, req.params.messageId, req.body.emoji);
      return reply.code(204).send();
    },
  });

  r.route({
    method: 'POST',
    url: '/api/member/messages/:messageId/flags',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'flagMessage',
      tags,
      summary: 'Flag a message',
      params: MessageIdParam,
      body: FlagReason,
      response: { 201: MessageFlag, ...errors },
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
      summary: 'Resolve the open flags on a message',
      params: MessageIdParam,
      body: ResolveMessageFlags,
      response: { 204: z.void(), ...errors },
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
      params: ChatIdParam,
      body: MarkRead,
      response: { 204: z.void(), ...errors },
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
      params: ChatIdParam,
      body: MuteChat,
      response: { 204: z.void(), ...errors },
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
      params: ChatIdParam,
      response: { 204: z.void(), ...errors },
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
      summary: 'Lock a chat',
      params: ChatIdParam,
      response: { 200: Chat, ...errors },
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
      summary: 'Unlock a chat',
      params: ChatIdParam,
      response: { 200: Chat, ...errors },
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
      summary: 'Block a person in this community',
      params: BlockParam,
      response: { 204: z.void(), ...errors },
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
      summary: 'Unblock a person in this community',
      params: BlockParam,
      response: { 204: z.void(), ...errors },
    },
    handler: async (req, reply) => {
      const actor = await actorOf(container, req.orgId, req.userId);
      await chats.unblock(req.orgId, actor, req.params.communityId, req.params.orgUserId);
      return reply.code(204).send();
    },
  });
}
