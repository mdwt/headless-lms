import { nameMentions } from '../../../discussion/index.js';
import type { DomainEvent } from '../../../shared/ports.js';
import type { Reason, RecipientList, SubjectRef } from '../../../types/index.js';
import { actorOf, excerpt } from '../../community-mail.js';
import type { NotificationReads } from '../../ports.js';

export type Recipient = NonNullable<RecipientList['recipients']>[number];
export type ListBase = Omit<RecipientList, 'recipients' | 'audience'>;
export type Chat = NonNullable<Awaited<ReturnType<NotificationReads['chat']>>>;

const MUTE_PROOF: Reason[] = ['subject', 'moderator', 'staff', 'mentioned'];

export class Reasons {
  private readonly byPerson = new Map<string, Reason[]>();

  add(orgUserIds: (string | null | undefined)[], reason: Reason): this {
    for (const orgUserId of orgUserIds) {
      if (!orgUserId) {
        continue;
      }
      const reasons = this.byPerson.get(orgUserId) ?? [];
      if (!reasons.includes(reason)) {
        reasons.push(reason);
      }
      this.byPerson.set(orgUserId, reasons);
    }
    return this;
  }

  ids(): string[] {
    return [...this.byPerson.keys()];
  }

  entries(): [string, Reason[]][] {
    return [...this.byPerson.entries()];
  }
}

export interface Reach {
  exclude: (string | null | undefined)[];
  canOpen?: (orgUserIds: string[]) => Promise<string[]>;
  mutedOn?: SubjectRef[];
  at: Date;
}

export async function recipientsOf(
  reads: NotificationReads,
  orgId: string,
  reasons: Reasons,
  reach: Reach,
): Promise<Recipient[]> {
  const excluded = new Set(reach.exclude.filter((id): id is string => Boolean(id)));
  let people = new Map(reasons.entries().filter(([orgUserId]) => !excluded.has(orgUserId)));
  if (people.size > 0 && reach.canOpen) {
    const open = new Set(await reach.canOpen([...people.keys()]));
    people = new Map([...people].filter(([orgUserId]) => open.has(orgUserId)));
  }
  for (const item of reach.mutedOn ?? []) {
    const exposed = [...people]
      .filter(([, held]) => held.some((reason) => !MUTE_PROOF.includes(reason)))
      .map(([orgUserId]) => orgUserId);
    if (exposed.length === 0) {
      break;
    }
    for (const orgUserId of await reads.mutedAmong(orgId, item, exposed, reach.at)) {
      const kept = (people.get(orgUserId) ?? []).filter((reason) => MUTE_PROOF.includes(reason));
      if (kept.length > 0) {
        people.set(orgUserId, kept);
      } else {
        people.delete(orgUserId);
      }
    }
  }
  if (people.size === 0) {
    return [];
  }
  const userIds = await reads.userIdsOf(orgId, [...people.keys()]);
  return [...people].flatMap(([orgUserId, held]) => {
    const userId = userIds[orgUserId];
    return userId ? [{ orgUserId, userId, reasons: held }] : [];
  });
}

export function listOf(base: ListBase, recipients: Recipient[]): RecipientList[] {
  return recipients.length > 0 ? [{ ...base, recipients }] : [];
}

export function eventAt(event: DomainEvent): Date {
  return new Date(event.occurredAt);
}

export function actorOr(event: DomainEvent, fallback: string | null): string | null {
  return actorOf(event) ?? fallback;
}

export async function textExcerpt(
  reads: NotificationReads,
  orgId: string,
  text: string,
  max: number,
): Promise<string> {
  return excerpt(await nameMentions(text, (orgUserId) => reads.displayName(orgId, orgUserId)), max);
}

export async function participantNames(
  reads: NotificationReads,
  orgId: string,
  chat: Chat,
): Promise<string[]> {
  const names: string[] = [];
  for (const participant of chat.participants) {
    if (!participant.leftAt) {
      names.push(await reads.displayName(orgId, participant.orgUserId));
    }
  }
  return names;
}

export async function chatTitle(
  reads: NotificationReads,
  orgId: string,
  chat: Chat,
  senderOrgUserId: string,
): Promise<string> {
  if (chat.kind === 'direct') {
    return reads.displayName(orgId, senderOrgUserId);
  }
  const names = await participantNames(reads, orgId, chat);
  return names.length > 0 ? names.join(', ') : 'Group chat';
}

export function chatReach(
  reads: NotificationReads,
  orgId: string,
  chat: Chat,
  chatId: string,
  actor: string,
  at: Date,
): Reach {
  return {
    exclude: [actor],
    at,
    mutedOn: [{ type: 'chat', id: chatId }],
    canOpen: async (orgUserIds) => {
      const present = new Set(
        chat.participants
          .filter((participant) => participant.leftAt === null)
          .map((participant) => participant.orgUserId),
      );
      const unblocked: string[] = [];
      for (const orgUserId of orgUserIds) {
        if (
          present.has(orgUserId) &&
          !(await reads.pairBlocked(orgId, chat.communityId, actor, orgUserId))
        ) {
          unblocked.push(orgUserId);
        }
      }
      return unblocked.length > 0
        ? reads.communityMembersAmong(orgId, chat.communityId, unblocked)
        : [];
    },
  };
}
