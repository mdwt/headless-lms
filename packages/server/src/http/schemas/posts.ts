import { z } from 'zod';
import {
  commentReportSchema,
  jsonValueSchema,
  postFeedPageSchema,
  postFlagSchema,
  postSchema,
  postViewSchema,
} from '@headless-lms/core/schemas';
import { CommentView } from './discussion.js';

export const Post = postSchema;
export const PostView = postViewSchema;
export const PostFlag = postFlagSchema;
export const PostFeedPage = postFeedPageSchema;
export const PostViews = z.array(PostView);
export const PostIdParam = z.object({ postId: z.string() });
export const MemberFeedQuery = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export const FeedQuery = MemberFeedQuery.extend({ topicId: z.string().optional() });

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
export const FlagReason = z.object({ reason: z.string() }).strict();
export const ResolvePostFlags = z.object({ resolution: z.literal('dismissed') }).strict();

export const PostReactions = z.object({
  reactions: z.record(z.string(), z.number().int()),
  viewerReaction: z.string().optional(),
});

export const SpaceQueue = z.object({
  pending: z.array(PostView),
  flags: z.array(PostFlag),
  commentFlags: z.array(commentReportSchema),
});

export const PostComments = z.array(CommentView);
