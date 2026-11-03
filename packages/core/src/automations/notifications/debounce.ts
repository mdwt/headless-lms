import { z } from 'zod';
import { idSchema } from '../../types/schemas/index.js';
import type { RecipientList } from '../../types/index.js';
import { noopLogger } from '../../shared/logger.js';
import type { Logger, ScheduledJob, Scheduler } from '../../shared/ports.js';
import { MESSAGE_EXCERPT } from '../community-mail.js';
import type { ChatDebounce, NotificationReads } from '../ports.js';
import { chatOf, type NotificationProcessor } from './processor.js';
import { messageSummary } from './rules/discussion.js';
import { chatReach, chatTitle, Reasons, recipientsOf, textExcerpt } from './rules/recipients.js';

export const FLUSH_JOB = 'automations.notifications.flush';
export const CHAT_QUIET_MS = 2 * 60 * 1000;

const flushPayload = z
  .object({ orgId: idSchema, userId: idSchema, orgUserId: idSchema, chatId: idSchema })
  .strict();

export function flushKey(userId: string, chatId: string): string {
  return `${userId}:${chatId}`;
}

export class SchedulerChatDebounce implements ChatDebounce {
  constructor(private readonly scheduler: Pick<Scheduler, 'at' | 'cancel'>) {}

  async arm(orgId: string, list: RecipientList, occurredAt: Date): Promise<void> {
    const chatId = chatOf(list);
    if (!chatId) {
      return;
    }
    const runAt = new Date(occurredAt.getTime() + CHAT_QUIET_MS);
    for (const recipient of list.recipients ?? []) {
      await this.scheduler.at(FLUSH_JOB, runAt, flushKey(recipient.userId, chatId), {
        orgId,
        userId: recipient.userId,
        orgUserId: recipient.orgUserId,
        chatId,
      });
    }
  }

  async mentioned(_orgId: string, userId: string, chatId: string): Promise<void> {
    await this.scheduler.cancel(FLUSH_JOB, flushKey(userId, chatId));
  }
}

export interface NotificationJobDeps {
  processor: Pick<NotificationProcessor, 'file'>;
  reads: NotificationReads;
  logger?: Logger;
}

export function notificationJobs(deps: NotificationJobDeps): ScheduledJob[] {
  const logger = deps.logger ?? noopLogger;
  return [
    {
      job: FLUSH_JOB,
      async run(payload, fire) {
        const parsed = flushPayload.safeParse(payload);
        if (!parsed.success) {
          logger.error('chat flush payload refused', { job: FLUSH_JOB, fireId: fire.id });
          return;
        }
        const { orgId, orgUserId, chatId } = parsed.data;
        const unread = await deps.reads.unreadInChat(orgId, chatId, orgUserId);
        if (unread.count === 0 || !unread.latest) {
          return;
        }
        const chat = await deps.reads.chat(orgId, chatId);
        if (!chat) {
          return;
        }
        const latest = unread.latest;
        const recipients = await recipientsOf(
          deps.reads,
          orgId,
          new Reasons().add([orgUserId], 'participant'),
          chatReach(deps.reads, orgId, chat, chatId, latest.senderOrgUserId, fire.startedAt),
        );
        if (recipients.length === 0) {
          return;
        }
        await deps.processor.file(
          orgId,
          `chat-flush:${chatId}:${latest.messageId}`,
          [
            {
              type: 'message.sent',
              scope: 'chat',
              actorOrgUserId: latest.senderOrgUserId,
              communityId: chat.communityId,
              spaceId: null,
              subject: { type: 'message', id: latest.messageId },
              parent: { type: 'chat', id: chatId },
              display: {
                senderName: await deps.reads.displayName(orgId, latest.senderOrgUserId),
                chatTitle: await chatTitle(deps.reads, orgId, chat, latest.senderOrgUserId),
                excerpt: await textExcerpt(deps.reads, orgId, latest.body, MESSAGE_EXCERPT),
                count: String(unread.count),
                summary: messageSummary(unread.count),
              },
              recipients,
            },
          ],
          { occurredAt: fire.startedAt, debounce: false },
        );
      },
    },
  ];
}
