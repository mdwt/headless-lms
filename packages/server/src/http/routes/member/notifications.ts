import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Container } from '../../../app/container.js';
import { InvalidInputError, NotFoundError } from '@headless-lms/core/shared/errors';
import { actorOf } from './actor.js';
import {
  NotificationFilterQuery,
  NotificationIdParam,
  NotificationListQuery,
  NotificationUnreadCounts,
  NotificationView,
  NotificationsPage,
  refusals,
} from '../../schemas/index.js';

export async function memberNotificationRoutes(
  app: FastifyInstance,
  container: Container,
): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const tags = ['Notifications'];

  r.route({
    method: 'GET',
    url: '/api/member/notifications',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'listMemberNotifications',
      tags,
      summary: 'List your notifications, newest first, with the unread count of the same filters',
      description:
        'For any member of the organization. Filters combine with AND; the values of one filter combine with OR, and `includeOrg=true` with `communityId` adds the org list, so one query reads a community with the course and account notifications. 400 for `includeOrg` without `communityId` or with `scope`. Each notification carries the current titles, names and excerpts of what it refers to; a subject or parent you can no longer open, or that was deleted, is null. `display` is the text stored when it was sent.',
      querystring: NotificationListQuery,
      response: { 200: NotificationsPage, ...refusals(400, 403) },
    },
    handler: async (req) => {
      const actor = await actorOf(container, req.orgId, req.userId);
      const { page, pageSize, ...filter } = req.query;
      return container.reporting.member.notifications(req.orgId, actor, req.userId, filter, {
        page,
        pageSize,
      });
    },
  });

  r.route({
    method: 'GET',
    url: '/api/member/notifications/unread-counts',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'getMemberNotificationUnreadCounts',
      tags,
      summary: 'Count your unread notifications in the org list and in each community',
      description:
        'For any member of the organization. `org` counts the org list; `communities` has one entry per community you can open, staff included.',
      response: { 200: NotificationUnreadCounts, ...refusals(403) },
    },
    handler: async (req) => {
      const actor = await actorOf(container, req.orgId, req.userId);
      return container.reporting.member.notificationUnreadCounts(req.orgId, actor, req.userId);
    },
  });

  r.route({
    method: 'GET',
    url: '/api/member/notifications/:notificationId',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'getMemberNotification',
      tags,
      summary: 'Read one of your notifications',
      description:
        'For any member of the organization. The notification as the list shows it, with current titles, names and excerpts; reading it does not mark it read. 404 when it is not yours or was not shown in the app.',
      params: NotificationIdParam,
      response: { 200: NotificationView, ...refusals(403, 404) },
    },
    handler: async (req) => {
      const actor = await actorOf(container, req.orgId, req.userId);
      const view = await container.reporting.member.notification(
        req.orgId,
        actor,
        req.userId,
        req.params.notificationId,
      );
      if (!view) {
        throw new NotFoundError('Notification', req.params.notificationId);
      }
      return view;
    },
  });

  r.route({
    method: 'POST',
    url: '/api/member/notifications/:notificationId/read',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'markMemberNotificationRead',
      tags,
      summary: 'Mark one of your notifications read',
      description:
        'For any member of the organization. Marking a read notification keeps its first read time. 404 when it is not yours.',
      params: NotificationIdParam,
      response: { 204: z.void(), ...refusals(403, 404) },
    },
    handler: async (req, reply) => {
      await actorOf(container, req.orgId, req.userId);
      await container.notificationList.markRead(req.orgId, req.userId, req.params.notificationId);
      return reply.code(204).send();
    },
  });

  r.route({
    method: 'POST',
    url: '/api/member/notifications/read',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'markAllMemberNotificationsRead',
      tags,
      summary: 'Mark your notifications matching the filters read',
      description:
        'For any member of the organization. Takes the filters of the list in the query string, `includeOrg` included; with none, marks every notification read. 400 when the request has a body.',
      querystring: NotificationFilterQuery,
      response: { 204: z.void(), ...refusals(400, 403) },
    },
    preValidation: async (req) => {
      if (req.body !== undefined) {
        throw new InvalidInputError('Mark-read takes its filters in the query string, not in a body');
      }
    },
    handler: async (req, reply) => {
      await actorOf(container, req.orgId, req.userId);
      await container.notificationList.markAllRead(req.orgId, req.userId, req.query);
      return reply.code(204).send();
    },
  });
}
