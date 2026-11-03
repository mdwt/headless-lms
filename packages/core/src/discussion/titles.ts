import { activityTitle } from '../content/index.js';
import { canModerate, isStaffRole } from '../organizations/index.js';
import type { Actor } from '../shared/actor.js';
import type { SubjectRef } from '../types/index.js';
import { authorView } from './authors.js';
import { mentionTokens } from './mentions.js';
import type {
  ActivityGetter,
  AuthorProfileReader,
  ChatRepository,
  ChatService,
  ContentAccessReader,
  DiscussionRepository,
  ItemTitle,
  ItemTitles,
  PostService,
} from './ports.js';
import type { Comment } from '../types/index.js';

const COMMENT_EXCERPT = 280;
const MESSAGE_EXCERPT = 140;
const TOKEN = /<@([A-Za-z0-9_-]+)>/g;

export type DiscussionItemTitlesParams = {
  posts: Pick<PostService, 'visibleTitles'>;
  chats: Pick<ChatService, 'titlesFor'>;
  comments: Pick<DiscussionRepository, 'findComment'>;
  messages: Pick<ChatRepository, 'findMessage'>;
  profiles: AuthorProfileReader;
  activities: ActivityGetter;
  access: ContentAccessReader;
};

function idsOf(refs: SubjectRef[], type: SubjectRef['type']): string[] {
  return [...new Set(refs.filter((ref) => ref.type === type).map((ref) => ref.id))];
}

function excerpt(body: string, names: Record<string, string>, max: number): string {
  const named = body.replace(TOKEN, (_, id: string) => `@${names[id] ?? 'A member'}`);
  const flat = named.replace(/\s+/g, ' ').trim();
  return flat.length <= max ? flat : flat.slice(0, max);
}

export class DiscussionItemTitles implements ItemTitles {
  constructor(private readonly deps: DiscussionItemTitlesParams) {}

  async titlesFor(
    orgId: string,
    actor: Actor,
    refs: SubjectRef[],
  ): Promise<Record<string, ItemTitle>> {
    const [comments, messages] = await Promise.all([
      this.found(idsOf(refs, 'comment'), (id) => this.deps.comments.findComment(orgId, id)),
      this.found(idsOf(refs, 'message'), (id) => this.deps.messages.findMessage(orgId, id)),
    ]);
    const shownComments = comments.filter((comment) => this.seesComment(actor, comment));
    const shownMessages = messages.filter((message) => message.deletedAt === null);
    const postIds = [
      ...idsOf(refs, 'post'),
      ...shownComments.flatMap((comment) => comment.postId ?? []),
    ];
    const chatIds = [...idsOf(refs, 'chat'), ...shownMessages.map((message) => message.chatId)];
    const [posts, chats, activities, names] = await Promise.all([
      postIds.length > 0
        ? this.deps.posts.visibleTitles(orgId, actor, postIds)
        : ({} as Record<string, string>),
      chatIds.length > 0
        ? this.deps.chats.titlesFor(orgId, actor, chatIds)
        : ({} as Record<string, string>),
      this.openActivities(orgId, actor, shownComments),
      this.names(
        orgId,
        [...shownComments, ...shownMessages].map((item) => item.body),
      ),
    ]);
    const titles: Record<string, ItemTitle> = {};
    for (const id of idsOf(refs, 'post')) {
      const title = posts[id];
      if (title !== undefined) {
        titles[`post:${id}`] = { title };
      }
    }
    for (const id of idsOf(refs, 'chat')) {
      const title = chats[id];
      if (title !== undefined) {
        titles[`chat:${id}`] = { title };
      }
    }
    for (const comment of shownComments) {
      const title = comment.postId
        ? posts[comment.postId]
        : comment.activityId
          ? activities[comment.activityId]
          : undefined;
      if (title !== undefined) {
        titles[`comment:${comment.id}`] = {
          title,
          excerpt: excerpt(comment.body, names, COMMENT_EXCERPT),
        };
      }
    }
    for (const message of shownMessages) {
      const title = chats[message.chatId];
      if (title !== undefined) {
        titles[`message:${message.id}`] = {
          title,
          excerpt: excerpt(message.body, names, MESSAGE_EXCERPT),
        };
      }
    }
    return titles;
  }

  private async found<T>(ids: string[], find: (id: string) => Promise<T | null>): Promise<T[]> {
    const rows: (T | null)[] = await Promise.all(ids.map(find));
    return rows.filter((row): row is T => row !== null);
  }

  private seesComment(actor: Actor, comment: Comment): boolean {
    if (comment.status === 'published' || canModerate(actor.role)) {
      return true;
    }
    return comment.orgUserId === actor.id && comment.status === 'pending';
  }

  private async openActivities(
    orgId: string,
    actor: Actor,
    comments: Comment[],
  ): Promise<Record<string, string>> {
    const ids = [
      ...new Set(comments.flatMap((comment) => (comment.postId ? [] : (comment.activityId ?? [])))),
    ];
    const open = await Promise.all(
      ids.map(async (id): Promise<[string, string] | null> => {
        const activity = await this.deps.activities.getActivity(orgId, id);
        if (!activity) {
          return null;
        }
        const opens =
          isStaffRole(actor.role) ||
          (await this.deps.access.hasAccess(orgId, actor.id, activity.courseId));
        return opens ? [id, activityTitle(activity)] : null;
      }),
    );
    return Object.fromEntries(open.filter((entry): entry is [string, string] => entry !== null));
  }

  private async names(orgId: string, bodies: string[]): Promise<Record<string, string>> {
    const ids = mentionTokens(...bodies);
    if (ids.length === 0) {
      return {};
    }
    const records = await this.deps.profiles.authorsOf(orgId, ids);
    return Object.fromEntries(
      Object.entries(records).map(([id, record]) => [
        id,
        authorView(orgId, record, null).displayName || 'A member',
      ]),
    );
  }
}
