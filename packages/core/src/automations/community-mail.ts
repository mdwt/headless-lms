import type { GrantEntitlementInput } from '../entitlements/index.js';
import type { EmailTemplateId, EmailTemplateParams, JsonValue } from '../types/index.js';
import type { Mailer, MailerLookups } from '../shared/mailer.js';
import type { CredentialStore, DomainEvent, Logger } from '../shared/ports.js';
import { noopLogger } from '../shared/logger.js';
import type { WebhookSender } from './ports.js';

export const MESSAGE_EXCERPT = 140;
export const POST_EXCERPT = 280;
export const MESSAGE_BATCH_MS = 15 * 60 * 1000;

export interface EmailRecipient<K extends EmailTemplateId = EmailTemplateId> {
  to: string;
  orgUserId: string;
  params: EmailTemplateParams[K];
}

export interface CommunityMailReads {
  communityTitle(orgId: string, communityId: string): Promise<string | null>;
  space(
    orgId: string,
    spaceId: string,
  ): Promise<{ name: string; communityId: string; capacity: number | null } | null>;
  openSpaceNames(orgId: string, orgUserId: string, communityId: string): Promise<string[]>;
  grantOpensCommunity(
    orgId: string,
    grant: { contentId: string | null; bundleId: string | null },
    communityId: string,
  ): Promise<boolean>;
  moderationAudience(orgId: string, communityId: string): Promise<string[]>;
  staffIds(orgId: string): Promise<string[]>;
  displayName(orgId: string, orgUserId: string): Promise<string>;
  followerIds(orgId: string, postId: string): Promise<string[]>;
  comment(
    orgId: string,
    commentId: string,
  ): Promise<{ orgUserId: string; postId: string | null; body: string } | null>;
  post(
    orgId: string,
    postId: string,
  ): Promise<{
    title: string;
    body: string;
    spaceId: string;
    orgUserId: string;
    communityId: string;
  } | null>;
  chat(
    orgId: string,
    chatId: string,
  ): Promise<{
    communityId: string;
    kind: 'direct' | 'group';
    createdBy: string;
    participants: { orgUserId: string; mutedUntil: Date | null; leftAt: Date | null }[];
  } | null>;
  latestMessageBody(orgId: string, chatId: string): Promise<string | null>;
  pairBlocked(orgId: string, communityId: string, a: string, b: string): Promise<boolean>;
  activeMemberCount(orgId: string, spaceId: string): Promise<number>;
  memberCommunityTitles(orgId: string, orgUserId: string): Promise<{ id: string; title: string }[]>;
  recentMessageRecipients(
    orgId: string,
    automationId: string,
    chatId: string,
    since: Date,
  ): Promise<string[]>;
}

export interface ScheduledWork {
  publishDuePosts(orgId: string, now: Date): Promise<void>;
  expireDueGrants(orgId: string, now: Date): Promise<void>;
  sendDigest(orgId: string, now: Date): Promise<void>;
  hasDuePosts(orgId: string, now: Date): Promise<boolean>;
}

export interface GrantWriter {
  grant(orgId: string, input: GrantEntitlementInput): Promise<unknown>;
}

export interface ActionDeps {
  mailer: Pick<Mailer, 'send'>;
  lookups: MailerLookups;
  credentials: Pick<CredentialStore, 'reveal'>;
  webhooks: WebhookSender;
  mail: CommunityMailReads;
  grants: GrantWriter;
  scheduledWork: ScheduledWork;
  automationId: string;
  actionInput: Record<string, JsonValue>;
  logger?: Logger;
}

export const emptyCommunityMail: CommunityMailReads = {
  communityTitle: async () => null,
  space: async () => null,
  openSpaceNames: async () => [],
  grantOpensCommunity: async () => false,
  moderationAudience: async () => [],
  staffIds: async () => [],
  displayName: async () => 'A member',
  followerIds: async () => [],
  comment: async () => null,
  post: async () => null,
  chat: async () => null,
  latestMessageBody: async () => null,
  pairBlocked: async () => false,
  activeMemberCount: async () => 0,
  memberCommunityTitles: async () => [],
  recentMessageRecipients: async () => [],
};

export const emptyScheduledWork: ScheduledWork = {
  publishDuePosts: async () => {},
  expireDueGrants: async () => {},
  sendDigest: async () => {},
  hasDuePosts: async () => false,
};

export function actorOf(event: DomainEvent): string | undefined {
  const value = event.metadata?.actorOrgUserId;
  return typeof value === 'string' ? value : undefined;
}

export function previousStatusOf(event: DomainEvent): string | undefined {
  const value = event.metadata?.previousStatus;
  return typeof value === 'string' ? value : undefined;
}

export function excerpt(value: string, max: number): string {
  const flat = value.replace(/\s+/g, ' ').trim();
  return flat.length <= max ? flat : flat.slice(0, max);
}

export function seededCommunityId(deps: ActionDeps): string | null {
  const id = deps.actionInput['communityId'];
  return typeof id === 'string' ? id : null;
}

export function firedAtOf(event: DomainEvent): Date {
  if (typeof event.data === 'object' && event.data !== null && 'firedAt' in event.data) {
    const firedAt = (event.data as { firedAt?: unknown }).firedAt;
    if (typeof firedAt === 'string') {
      return new Date(firedAt);
    }
  }
  return new Date(event.occurredAt);
}

export async function address<K extends EmailTemplateId>(
  deps: ActionDeps,
  event: DomainEvent,
  orgId: string,
  orgUserIds: string[],
  params: EmailTemplateParams[K],
): Promise<EmailRecipient<K>[] | undefined> {
  const actor = actorOf(event);
  const wanted = [...new Set(orgUserIds)].filter((id) => id !== actor);
  if (wanted.length === 0) {
    return [];
  }
  const recipients: EmailRecipient<K>[] = [];
  const logger = deps.logger ?? noopLogger;
  for (const orgUserId of wanted) {
    const to = await deps.lookups.orgUserEmail(orgId, orgUserId);
    if (!to) {
      logger.warn('email skipped: recipient has no address', { orgId, orgUserId });
      continue;
    }
    recipients.push({ to, orgUserId, params });
  }
  return recipients;
}
