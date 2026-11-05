import type { GrantEntitlementInput } from '../entitlements/index.js';
import type {
  ChatStatus,
  ContentType,
  EmailTemplateId,
  EmailTemplateParams,
  JsonValue,
  Permission,
} from '../types/index.js';
import { PERMISSIONS, withImplied } from '../organizations/index.js';
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
  userId: string;
  params: EmailTemplateParams[K];
}

export interface CommunityMailReads {
  communityTitle(orgId: string, communityId: string): Promise<string | null>;
  space(
    orgId: string,
    spaceId: string,
  ): Promise<{ name: string; communityId: string; capacity: number | null } | null>;
  openSpaceNames(orgId: string, orgUserId: string, communityId: string): Promise<string[]>;
  communitiesOpenedBy(
    orgId: string,
    grant: { contentId: string | null; bundleId: string | null },
  ): Promise<string[]>;
  communityMembersAmong(orgId: string, communityId: string, ids: string[]): Promise<string[]>;
  spaceOpenersAmong(orgId: string, spaceId: string, ids: string[]): Promise<string[]>;
  spaceOpeners(orgId: string, spaceId: string): Promise<string[]>;
  holders(orgId: string, permission: Permission, on?: string): Promise<string[]>;
  role(orgId: string, roleKey: string): Promise<{ name: string; permissions: Permission[] } | null>;
  orgName(orgId: string): Promise<string | null>;
  contentInfo(
    orgId: string,
    item: { contentId: string } | { bundleId: string },
  ): Promise<{ title: string; type: string } | null>;
  displayName(orgId: string, orgUserId: string): Promise<string>;
  followerIds(orgId: string, postId: string): Promise<string[]>;
  comment(
    orgId: string,
    commentId: string,
  ): Promise<{
    orgUserId: string;
    postId: string | null;
    activityId: string | null;
    parentId: string | null;
    body: string;
  } | null>;
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
    status: ChatStatus;
    createdBy: string | null;
    participants: {
      orgUserId: string;
      muted: boolean;
      mutedUntil: Date | null;
      leftAt: Date | null;
    }[];
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
  automationId: string;
  actionInput: Record<string, JsonValue>;
  logger?: Logger;
}

export const emptyCommunityMail: CommunityMailReads = {
  communityTitle: async () => null,
  space: async () => null,
  openSpaceNames: async () => [],
  communitiesOpenedBy: async () => [],
  communityMembersAmong: async () => [],
  spaceOpenersAmong: async () => [],
  spaceOpeners: async () => [],
  holders: async () => [],
  role: async () => null,
  orgName: async () => null,
  contentInfo: async () => null,
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

export async function communityModerators(
  reads: Pick<CommunityMailReads, 'holders' | 'communityMembersAmong'>,
  orgId: string,
  communityId: string,
): Promise<string[]> {
  const holders = await reads.holders(orgId, 'communities:moderate', communityId);
  return holders.length === 0 ? [] : reads.communityMembersAmong(orgId, communityId, holders);
}

export interface RoleGain {
  roleName: string;
  place: string;
  contentId: string | null;
  contentType: ContentType | null;
}

function contributes(
  permissions: readonly Permission[],
  contentType: ContentType | null,
): Set<Permission> {
  const expanded = [...withImplied(permissions)];
  return new Set(
    contentType === null
      ? expanded
      : expanded.filter((permission) => PERMISSIONS[permission].about === contentType),
  );
}

export async function roleGain(
  reads: Pick<CommunityMailReads, 'role' | 'orgName' | 'contentInfo'>,
  orgId: string,
  assigned: {
    roleKey: string;
    previousRoleKey: string | null;
    contentId: string | null;
    contentType: ContentType | null;
  },
): Promise<RoleGain | null> {
  const next = await reads.role(orgId, assigned.roleKey);
  if (!next) {
    return null;
  }
  const previous = assigned.previousRoleKey
    ? await reads.role(orgId, assigned.previousRoleKey)
    : null;
  const before = contributes(previous?.permissions ?? [], assigned.contentType);
  const gained = [...contributes(next.permissions, assigned.contentType)].some(
    (permission) => !before.has(permission),
  );
  if (!gained) {
    return null;
  }
  const place =
    assigned.contentId === null
      ? `in ${(await reads.orgName(orgId)) ?? 'the organization'}`
      : `of ${(await reads.contentInfo(orgId, { contentId: assigned.contentId }))?.title ?? 'an item'}`;
  return {
    roleName: next.name,
    place,
    contentId: assigned.contentId,
    contentType: assigned.contentType,
  };
}

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
    const person = await deps.lookups.orgUserPerson(orgId, orgUserId);
    if (!person) {
      logger.warn('email skipped: recipient has no address', { orgId, orgUserId });
      continue;
    }
    recipients.push({ to: person.email, orgUserId, userId: person.userId, params });
  }
  return recipients;
}
