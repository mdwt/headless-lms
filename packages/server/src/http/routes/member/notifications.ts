import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { Container } from '../../../app/container.js';
import { actorOf } from './actor.js';
import {
  MarkedRead,
  NotificationIdParam,
  NotificationPreferences,
  NotificationView,
  NotificationsPage,
  PageQuery,
  SetNotificationPreferences,
  refusals,
} from '../../schemas/index.js';

export async function memberNotificationRoutes(
  app: FastifyInstance,
  container: Container,
): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const notifications = container.notifications;
  const tags = ['Notifications'];

  r.route({
    method: 'GET',
    url: '/api/member/notifications',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'listMemberNotifications',
      tags,
      summary: 'List your notifications, newest first, with your unread count',
      description:
        'For any member of the organization. Each notification names what it refers to; a post or chat you can no longer see is null.',
      querystring: PageQuery,
      response: { 200: NotificationsPage, ...refusals(403) },
    },
    handler: async (req) => {
      const actor = await actorOf(container, req.orgId, req.userId);
      return container.reporting.member.notifications(req.orgId, actor, req.userId, req.query);
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
        'For any member of the organization. Returns the notification the way the list shows it. Marking a read notification keeps its first read time. 404 when it is not yours.',
      params: NotificationIdParam,
      response: { 200: NotificationView, ...refusals(403, 404) },
    },
    handler: async (req) => {
      const actor = await actorOf(container, req.orgId, req.userId);
      const notification = await notifications.markNotificationRead(
        req.orgId,
        req.userId,
        req.params.notificationId,
      );
      return container.reporting.member.notificationView(req.orgId, actor, notification);
    },
  });

  r.route({
    method: 'POST',
    url: '/api/member/notifications/read',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'markAllMemberNotificationsRead',
      tags,
      summary: 'Mark all your notifications read',
      description: 'For any signed-in person in the organization. Returns how many were unread.',
      response: { 200: MarkedRead },
    },
    handler: async (req) => {
      return notifications.markAllNotificationsRead(req.orgId, req.userId);
    },
  });

  r.route({
    method: 'GET',
    url: '/api/member/notification-preferences',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'getMemberNotificationPreferences',
      tags,
      summary: 'Read how you are told about each kind of notification',
      description:
        'For any signed-in person in the organization. One entry per kind; a kind you never set is on in the app and by email.',
      response: { 200: NotificationPreferences },
    },
    handler: async (req) => {
      return notifications.notificationPreferences(req.orgId, req.userId);
    },
  });

  r.route({
    method: 'PUT',
    url: '/api/member/notification-preferences',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'setMemberNotificationPreferences',
      tags,
      summary: 'Set how you are told about the given kinds of notification',
      description:
        'For any signed-in person in the organization. Changes only the kinds sent and returns every kind.',
      body: SetNotificationPreferences,
      response: { 200: NotificationPreferences },
    },
    handler: async (req) => {
      return notifications.setNotificationPreferences(req.orgId, req.userId, req.body.preferences);
    },
  });
}
