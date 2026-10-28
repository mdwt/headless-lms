import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { Container } from '../../../app/container.js';
import { UnauthorizedError } from '../../plugins/auth.js';
import {
  ErrorBody,
  MarkedRead,
  Notification,
  NotificationIdParam,
  NotificationPreferences,
  NotificationsPage,
  PageQuery,
  SetNotificationPreferences,
} from '../../schemas/index.js';

const errors = { 401: ErrorBody, 403: ErrorBody, 404: ErrorBody, 409: ErrorBody };

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
      querystring: PageQuery,
      response: { 200: NotificationsPage, ...errors },
    },
    handler: async (req) => {
      const actor = await container.organizations.getOrgUser(req.orgId, req.userId);
      if (!actor) {
        throw new UnauthorizedError();
      }
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
      params: NotificationIdParam,
      response: { 200: Notification, ...errors },
    },
    handler: async (req) => {
      return notifications.markNotificationRead(req.orgId, req.userId, req.params.notificationId);
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
      response: { 200: MarkedRead, ...errors },
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
      response: { 200: NotificationPreferences, ...errors },
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
      body: SetNotificationPreferences,
      response: { 200: NotificationPreferences, ...errors },
    },
    handler: async (req) => {
      return notifications.setNotificationPreferences(req.orgId, req.userId, req.body.preferences);
    },
  });
}
