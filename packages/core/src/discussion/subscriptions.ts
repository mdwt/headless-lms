import { ForbiddenError, InvalidInputError, NotFoundError } from '../shared/errors.js';
import type { Logger } from '../shared/ports.js';
import { noopLogger } from '../shared/logger.js';
import type { Actor } from '../shared/actor.js';
import type {
  SubjectRef,
  Subscription,
  SubscriptionItemType,
  SubscriptionView,
} from '../types/index.js';
import type {
  ChatService,
  CommunityAccess,
  MuteInput,
  PostService,
  SubscriptionInput,
  SubscriptionService,
  SubscriptionsRepository,
  SubscriptionUnitOfWork,
} from './ports.js';
import { discussionEvents } from './events.js';

const ITEM_TYPES: readonly SubscriptionItemType[] = ['post', 'space', 'chat'];

function itemTypeOf(item: SubjectRef): SubscriptionItemType | null {
  return (ITEM_TYPES as readonly string[]).includes(item.type)
    ? (item.type as SubscriptionItemType)
    : null;
}

export function activeSubscription(
  subscription: Subscription | undefined,
  at: Date,
): SubscriptionView | null {
  if (!subscription) {
    return null;
  }
  if (
    subscription.state === 'muted' &&
    subscription.mutedUntil !== null &&
    subscription.mutedUntil <= at
  ) {
    return null;
  }
  return { state: subscription.state, mutedUntil: subscription.mutedUntil };
}

export type SubscriptionServiceParams = {
  repo: SubscriptionsRepository;
  access: Pick<CommunityAccess, 'canOpenSpace' | 'isCommunityMember'>;
  posts: Pick<PostService, 'visible'>;
  chats: Pick<ChatService, 'chatSummary'>;
  uow: SubscriptionUnitOfWork;
  logger?: Logger;
};

export class SubscriptionServiceImpl implements SubscriptionService {
  private readonly repo: SubscriptionsRepository;
  private readonly access: Pick<CommunityAccess, 'canOpenSpace' | 'isCommunityMember'>;
  private readonly posts: Pick<PostService, 'visible'>;
  private readonly chats: Pick<ChatService, 'chatSummary'>;
  private readonly uow: SubscriptionUnitOfWork;
  private readonly logger: Logger;

  constructor(params: SubscriptionServiceParams) {
    this.repo = params.repo;
    this.access = params.access;
    this.posts = params.posts;
    this.chats = params.chats;
    this.uow = params.uow;
    this.logger = params.logger ?? noopLogger;
  }

  async setPost(postId: string, input: SubscriptionInput, actor: Actor): Promise<void> {
    await this.posts.visible(postId, actor);
    await this.write(this.repo, actor.orgId, actor, 'post', postId, input);
  }

  async setSpace(spaceId: string, input: MuteInput, actor: Actor): Promise<void> {
    if (!(await this.access.canOpenSpace(spaceId, actor))) {
      throw new NotFoundError('Space', spaceId);
    }
    await this.write(this.repo, actor.orgId, actor, 'space', spaceId, input);
  }

  async setChat(chatId: string, input: MuteInput, actor: Actor): Promise<void> {
    const orgId = actor.orgId;
    const summary = await this.chats.chatSummary(orgId, chatId);
    if (!summary) {
      throw new NotFoundError('Chat', chatId);
    }
    if (!(await this.access.isCommunityMember(summary.chat.communityId, actor))) {
      throw new ForbiddenError('You are not a member of this community');
    }
    if (!summary.participants.some((user) => user.orgUserId === actor.id && user.leftAt === null)) {
      throw new ForbiddenError('You are not in this chat');
    }
    await this.uow.run(async ({ subscriptions, outbox }) => {
      await this.write(subscriptions, orgId, actor, 'chat', chatId, input);
      await outbox.append([
        discussionEvents.chatMuted.make({
          orgId,
          data: {
            chatId,
            communityId: summary.chat.communityId,
            orgUserId: actor.id,
            mutedUntil: input.state === 'muted' ? (input.mutedUntil ?? null) : null,
          },
          metadata: { actorOrgUserId: actor.id },
        }),
      ]);
    });
  }

  async viewerSubscriptions(
    orgId: string,
    orgUserId: string,
    itemType: SubscriptionItemType,
    itemIds: string[],
    at: Date,
  ): Promise<Record<string, SubscriptionView>> {
    if (itemIds.length === 0) {
      return {};
    }
    const rows = await this.repo.forViewer(orgId, orgUserId, itemType, [...new Set(itemIds)]);
    return Object.fromEntries(
      rows.flatMap((row) => {
        const view = activeSubscription(row, at);
        return view ? [[row.itemId, view]] : [];
      }),
    );
  }

  followerIds(orgId: string, postId: string): Promise<string[]> {
    return this.repo.followerIds(orgId, postId);
  }

  async mutedAmong(
    orgId: string,
    item: SubjectRef,
    orgUserIds: string[],
    at: Date,
  ): Promise<string[]> {
    const itemType = itemTypeOf(item);
    if (itemType === null || orgUserIds.length === 0) {
      return [];
    }
    return this.repo.mutedAmong(orgId, itemType, item.id, [...new Set(orgUserIds)], at);
  }

  async itemSubscriptions(orgId: string, item: SubjectRef): Promise<Subscription[]> {
    const itemType = itemTypeOf(item);
    return itemType === null ? [] : this.repo.ofItem(orgId, itemType, item.id);
  }

  private async write(
    repo: SubscriptionsRepository,
    orgId: string,
    actor: Actor,
    itemType: SubscriptionItemType,
    itemId: string,
    input: SubscriptionInput,
  ): Promise<void> {
    if (input.state === 'none') {
      await repo.remove(orgId, actor.id, itemType, itemId);
      this.logger.debug('subscription removed', { orgId, itemType, itemId });
      return;
    }
    if (input.state === 'following' && itemType !== 'post') {
      throw new InvalidInputError('Only a post can be followed');
    }
    await repo.upsert(orgId, {
      orgId,
      orgUserId: actor.id,
      itemType,
      itemId,
      state: input.state,
      mutedUntil: input.state === 'muted' ? (input.mutedUntil ?? null) : null,
      createdAt: new Date(),
    });
    this.logger.debug('subscription set', { orgId, itemType, itemId, state: input.state });
  }
}
