import { and, asc, desc, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type {
  BookmarkQuery,
  FeedQuery,
  PageQuery,
  PostReactions,
  PostRepository,
  PostPatch,
} from "@headless-lms/core/discussion";
import type {
  Logger,
  Page,
  Post,
  PostFlag,
  PostFlagResolution,
  ReactionEmoji,
} from "@headless-lms/core/types";
import { noopLogger } from "@headless-lms/core/shared/logger";
import { postFlags, postFollows, postBookmarks, postReactions, posts } from "../schema/index.js";
import { translateDbErrors } from "./pg-errors.js";

type PostRow = typeof posts.$inferSelect;
type FlagRow = typeof postFlags.$inferSelect;

function toPost(row: PostRow): Post {
  return {
    orgId: row.orgId,
    id: row.id,
    communityId: row.communityId,
    spaceId: row.spaceId,
    orgUserId: row.orgUserId,
    topicId: row.topicId,
    title: row.title,
    body: row.body,
    extra: row.extra,
    coverAssetId: row.coverAssetId,
    status: row.status,
    scheduledAt: row.scheduledAt,
    publishedAt: row.publishedAt,
    removedBy: row.removedBy,
    pinned: row.pinned,
    commentsClosed: row.commentsClosed,
    reactionsEnabled: row.reactionsEnabled,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toFlag(row: FlagRow): PostFlag {
  return {
    orgId: row.orgId,
    id: row.id,
    postId: row.postId,
    orgUserId: row.orgUserId,
    reason: row.reason,
    resolvedAt: row.resolvedAt,
    resolution: row.resolution,
    resolvedBy: row.resolvedBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class DrizzlePostRepository implements PostRepository {
  constructor(
    private readonly db: NodePgDatabase,
    private readonly logger: Logger = noopLogger,
  ) {}

  async insert(orgId: string, post: Post): Promise<Post> {
    const [row] = await this.db
      .insert(posts)
      .values({
        orgId,
        id: post.id,
        communityId: post.communityId,
        spaceId: post.spaceId,
        orgUserId: post.orgUserId,
        topicId: post.topicId,
        title: post.title,
        body: post.body,
        extra: post.extra,
        coverAssetId: post.coverAssetId,
        status: post.status,
        scheduledAt: post.scheduledAt,
        publishedAt: post.publishedAt,
        removedBy: post.removedBy,
        pinned: post.pinned,
        commentsClosed: post.commentsClosed,
        reactionsEnabled: post.reactionsEnabled,
        createdAt: post.createdAt,
        updatedAt: post.updatedAt,
      })
      .returning();
    this.logger.debug("post inserted", { orgId, postId: post.id });
    return toPost(row!);
  }

  async update(orgId: string, id: string, patch: PostPatch): Promise<Post | null> {
    const [row] = await this.db
      .update(posts)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(posts.orgId, orgId), eq(posts.id, id)))
      .returning();
    return row ? toPost(row) : null;
  }

  async find(orgId: string, id: string): Promise<Post | null> {
    const [row] = await this.db
      .select()
      .from(posts)
      .where(and(eq(posts.orgId, orgId), eq(posts.id, id)))
      .limit(1);
    return row ? toPost(row) : null;
  }

  async findMany(orgId: string, ids: string[]): Promise<Post[]> {
    if (ids.length === 0) {
      return [];
    }
    const rows = await this.db
      .select()
      .from(posts)
      .where(and(eq(posts.orgId, orgId), inArray(posts.id, ids)));
    return rows.map(toPost);
  }

  async listPublished(orgId: string, spaceIds: string[], query: FeedQuery): Promise<Page<Post>> {
    if (spaceIds.length === 0) {
      return { rows: [], total: 0, page: query.page, pageSize: query.pageSize };
    }
    const where = and(
      eq(posts.orgId, orgId),
      inArray(posts.spaceId, spaceIds),
      eq(posts.status, "published"),
      query.topicId ? eq(posts.topicId, query.topicId) : undefined,
    );
    const rows = await this.db
      .select()
      .from(posts)
      .where(where)
      .orderBy(desc(posts.pinned), desc(posts.publishedAt), desc(posts.id))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize);
    const [{ total } = { total: 0 }] = await this.db
      .select({ total: sql<number>`cast(count(*) as int)` })
      .from(posts)
      .where(where);
    return { rows: rows.map(toPost), total, page: query.page, pageSize: query.pageSize };
  }

  async listByAuthor(
    orgId: string,
    orgUserId: string,
    spaceIds: string[],
    query: PageQuery,
  ): Promise<Page<Post>> {
    if (spaceIds.length === 0) {
      return { rows: [], total: 0, page: query.page, pageSize: query.pageSize };
    }
    const where = and(
      eq(posts.orgId, orgId),
      eq(posts.orgUserId, orgUserId),
      inArray(posts.spaceId, spaceIds),
    );
    const rows = await this.db
      .select()
      .from(posts)
      .where(where)
      .orderBy(desc(posts.createdAt), desc(posts.id))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize);
    const [{ total } = { total: 0 }] = await this.db
      .select({ total: sql<number>`cast(count(*) as int)` })
      .from(posts)
      .where(where);
    return { rows: rows.map(toPost), total, page: query.page, pageSize: query.pageSize };
  }

  async listBookmarked(
    orgId: string,
    orgUserId: string,
    spaceIds: string[],
    query: BookmarkQuery,
  ): Promise<Page<Post>> {
    if (spaceIds.length === 0) {
      return { rows: [], total: 0, page: query.page, pageSize: query.pageSize };
    }
    const where = and(
      eq(postBookmarks.orgId, orgId),
      eq(postBookmarks.orgUserId, orgUserId),
      inArray(posts.spaceId, spaceIds),
      or(eq(posts.orgUserId, orgUserId), inArray(posts.status, query.visibleStatuses)),
    );
    const rows = await this.db
      .select({ post: posts })
      .from(postBookmarks)
      .innerJoin(
        posts,
        and(eq(posts.orgId, postBookmarks.orgId), eq(posts.id, postBookmarks.postId)),
      )
      .where(where)
      .orderBy(desc(postBookmarks.createdAt), desc(posts.id))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize);
    const [{ total } = { total: 0 }] = await this.db
      .select({ total: sql<number>`cast(count(*) as int)` })
      .from(postBookmarks)
      .innerJoin(
        posts,
        and(eq(posts.orgId, postBookmarks.orgId), eq(posts.id, postBookmarks.postId)),
      )
      .where(where);
    return {
      rows: rows.map((row) => toPost(row.post)),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async listPending(orgId: string, spaceId: string): Promise<Post[]> {
    const rows = await this.db
      .select()
      .from(posts)
      .where(and(eq(posts.orgId, orgId), eq(posts.spaceId, spaceId), eq(posts.status, "pending")))
      .orderBy(asc(posts.createdAt), asc(posts.id));
    return rows.map(toPost);
  }

  async listDue(orgId: string, now: Date): Promise<Post[]> {
    const rows = await this.db
      .select()
      .from(posts)
      .where(
        and(eq(posts.orgId, orgId), eq(posts.status, "scheduled"), lte(posts.scheduledAt, now)),
      )
      .orderBy(asc(posts.scheduledAt), asc(posts.id));
    return rows.map(toPost);
  }

  async hasDue(orgId: string, now: Date): Promise<boolean> {
    const due = this.db
      .select({ id: posts.id })
      .from(posts)
      .where(
        and(eq(posts.orgId, orgId), eq(posts.status, "scheduled"), lte(posts.scheduledAt, now)),
      )
      .limit(1);
    const result = await this.db.execute<{ due: boolean }>(sql`select exists (${due}) as due`);
    return result.rows[0]?.due === true;
  }

  async reactionsOf(
    orgId: string,
    postIds: string[],
    viewerId: string,
  ): Promise<Record<string, PostReactions>> {
    if (postIds.length === 0) {
      return {};
    }
    const rows = await this.db
      .select({
        postId: postReactions.postId,
        emoji: postReactions.emoji,
        count: sql<number>`cast(count(*) as int)`,
        mine: sql<boolean>`bool_or(${postReactions.orgUserId} = ${viewerId})`,
      })
      .from(postReactions)
      .where(and(eq(postReactions.orgId, orgId), inArray(postReactions.postId, postIds)))
      .groupBy(postReactions.postId, postReactions.emoji);
    const byPost: Record<string, PostReactions> = {};
    for (const row of rows) {
      const entry = (byPost[row.postId] ??= { reactions: {} });
      entry.reactions[row.emoji] = row.count;
      if (row.mine) {
        entry.viewerReaction = row.emoji;
      }
    }
    return byPost;
  }

  async setReaction(
    orgId: string,
    postId: string,
    orgUserId: string,
    emoji: ReactionEmoji | null,
  ): Promise<void> {
    if (emoji === null) {
      await this.db
        .delete(postReactions)
        .where(
          and(
            eq(postReactions.orgId, orgId),
            eq(postReactions.postId, postId),
            eq(postReactions.orgUserId, orgUserId),
          ),
        );
      return;
    }
    await this.db
      .insert(postReactions)
      .values({ orgId, postId, orgUserId, emoji })
      .onConflictDoUpdate({
        target: [postReactions.orgId, postReactions.postId, postReactions.orgUserId],
        set: { emoji },
      });
  }

  async follow(orgId: string, postId: string, orgUserId: string): Promise<void> {
    await this.db.insert(postFollows).values({ orgId, postId, orgUserId }).onConflictDoNothing();
  }

  async followerIds(orgId: string, postId: string): Promise<string[]> {
    const rows = await this.db
      .select({ orgUserId: postFollows.orgUserId })
      .from(postFollows)
      .where(and(eq(postFollows.orgId, orgId), eq(postFollows.postId, postId)));
    return rows.map((row) => row.orgUserId);
  }

  async followedAmong(orgId: string, postIds: string[], orgUserId: string): Promise<string[]> {
    if (postIds.length === 0) {
      return [];
    }
    const rows = await this.db
      .select({ postId: postFollows.postId })
      .from(postFollows)
      .where(
        and(
          eq(postFollows.orgId, orgId),
          eq(postFollows.orgUserId, orgUserId),
          inArray(postFollows.postId, postIds),
        ),
      );
    return rows.map((row) => row.postId);
  }

  async unfollow(orgId: string, postId: string, orgUserId: string): Promise<void> {
    await this.db
      .delete(postFollows)
      .where(
        and(
          eq(postFollows.orgId, orgId),
          eq(postFollows.postId, postId),
          eq(postFollows.orgUserId, orgUserId),
        ),
      );
  }

  async bookmark(orgId: string, postId: string, orgUserId: string): Promise<void> {
    await this.db.insert(postBookmarks).values({ orgId, postId, orgUserId }).onConflictDoNothing();
  }

  async unbookmark(orgId: string, postId: string, orgUserId: string): Promise<void> {
    await this.db
      .delete(postBookmarks)
      .where(
        and(
          eq(postBookmarks.orgId, orgId),
          eq(postBookmarks.postId, postId),
          eq(postBookmarks.orgUserId, orgUserId),
        ),
      );
  }

  async bookmarkedAmong(orgId: string, postIds: string[], orgUserId: string): Promise<string[]> {
    if (postIds.length === 0) {
      return [];
    }
    const rows = await this.db
      .select({ postId: postBookmarks.postId })
      .from(postBookmarks)
      .where(
        and(
          eq(postBookmarks.orgId, orgId),
          eq(postBookmarks.orgUserId, orgUserId),
          inArray(postBookmarks.postId, postIds),
        ),
      );
    return rows.map((row) => row.postId);
  }

  async insertFlag(orgId: string, flag: PostFlag): Promise<PostFlag | null> {
    const [row] = await this.db
      .insert(postFlags)
      .values({
        orgId,
        id: flag.id,
        postId: flag.postId,
        orgUserId: flag.orgUserId,
        reason: flag.reason,
        resolvedAt: flag.resolvedAt,
        resolution: flag.resolution,
        resolvedBy: flag.resolvedBy,
        createdAt: flag.createdAt,
        updatedAt: flag.updatedAt,
      })
      .onConflictDoNothing()
      .returning();
    return row ? toFlag(row) : null;
  }

  async findFlag(orgId: string, postId: string, orgUserId: string): Promise<PostFlag | null> {
    const [row] = await this.db
      .select()
      .from(postFlags)
      .where(
        and(
          eq(postFlags.orgId, orgId),
          eq(postFlags.postId, postId),
          eq(postFlags.orgUserId, orgUserId),
        ),
      )
      .limit(1);
    return row ? toFlag(row) : null;
  }

  async listOpenFlags(orgId: string, spaceId: string): Promise<PostFlag[]> {
    const rows = await this.db
      .select({ flag: postFlags })
      .from(postFlags)
      .innerJoin(posts, and(eq(posts.orgId, postFlags.orgId), eq(posts.id, postFlags.postId)))
      .where(
        and(eq(postFlags.orgId, orgId), eq(posts.spaceId, spaceId), isNull(postFlags.resolvedAt)),
      )
      .orderBy(asc(postFlags.createdAt), asc(postFlags.id));
    return rows.map((row) => toFlag(row.flag));
  }

  async resolveFlags(
    orgId: string,
    postId: string,
    resolved: { resolvedAt: Date; resolvedBy: string; resolution: PostFlagResolution },
  ): Promise<void> {
    await this.db
      .update(postFlags)
      .set({
        resolvedAt: resolved.resolvedAt,
        resolvedBy: resolved.resolvedBy,
        resolution: resolved.resolution,
      })
      .where(
        and(eq(postFlags.orgId, orgId), eq(postFlags.postId, postId), isNull(postFlags.resolvedAt)),
      );
  }
}

translateDbErrors(DrizzlePostRepository);
