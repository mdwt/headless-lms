import { ForbiddenError, InvalidInputError, NotFoundError } from '../shared/errors.js';
import type { Logger } from '../shared/ports.js';
import { noopLogger } from '../shared/logger.js';
import type { CommunityAccessReader } from '../entitlements/index.js';
import type { Actor } from '../shared/actor.js';
import type {
  SubjectRef,
  Subscription,
  SubscriptionItemType,
  SubscriptionView,
} from '../types/index.js';
import type {
  ChatService,
  MuteInput,
  PostService,
  SubscriptionInput,
  SubscriptionService,
  SubscriptionsRepository,
} from './ports.js';

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
  access: Pick<CommunityAccessReader, 'canOpenSpace' | 'isCommunityMember'>;
  posts: Pick<PostService, 'visible'>;
  chats: Pick<ChatService, 'chatSummary'>;
  logger?: Logger;
};

export class SubscriptionServiceImpl implements SubscriptionService {
  private readonly repo: SubscriptionsRepository;
  private readonly access: Pick<CommunityAccessReader, 'canOpenSpace' | 'isCommunityMember'>;
  private readonly posts: Pick<PostService, 'visible'>;
  private readonly chats: Pick<ChatService, 'chatSummary'>;
  private readonly logger: Logger;

  constructor(params: SubscriptionServiceParams) {
    this.repo = params.repo;
    this.access = params.access;
    this.posts = params.posts;
    this.chats = params.chats;
    this.logger = params.logger ?? noopLogger;
  }

  async setPost(
    orgId: string,
    actor: Actor,
    postId: string,
    input: SubscriptionInput,
  ): Promise<void> {
    await this.posts.visible(orgId, actor, postId);
    await this.write(orgId, actor, 'post', postId, input);
  }

  async setSpace(orgId: string, actor: Actor, spaceId: string, input: MuteInput): Promise<void> {
    if (!(await this.access.canOpenSpace(orgId, actor, spaceId))) {
      throw new NotFoundError('Space', spaceId);
    }
    await this.write(orgId, actor, 'space', spaceId, input);
  }

  async setChat(orgId: string, actor: Actor, chatId: string, input: MuteInput): Promise<void> {
    const summary = await this.chats.chatSummary(orgId, chatId);
    if (!summary) {
      throw new NotFoundError('Chat', chatId);
    }
    if (!(await this.access.isCommunityMember(orgId, actor, summary.chat.communityId))) {
      throw new ForbiddenError('You are not a member of this community');
    }
    if (!summary.participants.some((user) => user.orgUserId === actor.id && user.leftAt === null)) {
      throw new ForbiddenError('You are not in this chat');
    }
    await this.write(orgId, actor, 'chat', chatId, input);
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
    orgId: string,
    actor: Actor,
    itemType: SubscriptionItemType,
    itemId: string,
    input: SubscriptionInput,
  ): Promise<void> {
    if (input.state === 'none') {
      await this.repo.remove(orgId, actor.id, itemType, itemId);
      this.logger.debug('subscription removed', { orgId, itemType, itemId });
      return;
    }
    if (input.state === 'following' && itemType !== 'post') {
      throw new InvalidInputError('Only a post can be followed');
    }
    await this.repo.upsert(orgId, {
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
