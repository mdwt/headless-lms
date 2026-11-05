import { requires, type Declarations } from '../shared/declarations.js';
import type { AutomationsService, NotificationsService } from './ports.js';

export const automationsDeclarations = {
  handle: 'system',
  availableActions: requires('automations:read'),
  availableTriggers: requires('automations:read'),
  list: requires('automations:read'),
  get: requires('automations:read'),
  create: requires('automations:write'),
  update: requires('automations:write'),
  delete: requires('automations:delete'),
  listRuns: requires('automations:read'),
  rerun: requires('automations:write'),
  listWebhooks: requires('automations:read'),
  getWebhook: requires('automations:read'),
  createWebhook: requires('automations:write'),
  updateWebhook: requires('automations:write'),
  deleteWebhook: requires('automations:delete'),
  revealWebhookSecret: requires('automations:write'),
  rotateWebhookSecret: requires('automations:write'),
} as const satisfies Declarations<AutomationsService>;

export const notificationListDeclarations = {
  list: 'member',
  get: 'member',
  unreadCounts: 'member',
  markRead: 'member',
  markAllRead: 'member',
} as const satisfies Declarations<NotificationsService>;
