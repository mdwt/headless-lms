import { z } from 'zod';
import {
  flaggedCommentSchema,
  jsonValueSchema,
  postFlagSchema,
  postViewSchema,
} from '@headless-lms/core/schemas';
import { CommentView } from './discussion.js';
import { PageQuery, paginated } from './shared.js';

export const PostView = postViewSchema;
export const PostFlag = postFlagSchema;
export const PostFeedPage = paginated(PostView);
export const PostIdParam = z.object({ postId: z.string() });
export const FeedQuery = PageQuery.extend({ topicId: z.string().optional() }).strict();

export const CreatePost = z
  .object({
    title: z.string().min(1),
    body: z.string(),
    topicId: z.string().nullable(),
    extra: jsonValueSchema.default({}),
    coverAssetId: z.string().nullable(),
    mode: z.enum(['draft', 'submit', 'schedule']),
    scheduledAt: z.coerce.date().nullable(),
  })
  .strict();

export const UpdatePost = z
  .object({
    title: z.string().min(1).optional(),
    body: z.string().optional(),
    topicId: z.string().nullable().optional(),
    extra: jsonValueSchema.optional(),
    coverAssetId: z.string().nullable().optional(),
  })
  .strict();

export const SchedulePost = z.object({ scheduledAt: z.coerce.date() }).strict();
export const SetPostReactions = z.object({ enabled: z.boolean() }).strict();
export const SetReaction = z.object({ emoji: z.string().min(1).max(16).nullable() }).strict();
export const FlagReason = z.object({ reason: z.string().trim().min(1).max(1_000) }).strict();
export const ResolvePostFlags = z.object({ resolution: z.literal('dismissed') }).strict();

export const PostReactions = z.object({
  reactions: z.record(z.string(), z.number().int()),
  viewerReaction: z.string().optional(),
});

export const SpaceQueue = z.object({
  pending: z.array(PostView),
  flags: z.array(PostFlag),
  commentFlags: z.array(flaggedCommentSchema),
});

export const PostComments = z.array(CommentView);
