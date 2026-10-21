import { z } from 'zod';
import {
  commentReportSchema,
  jsonValueSchema,
  postFlagResolutionSchema,
  postFlagSchema,
  postSchema,
} from '@headless-lms/core/schemas';
import { ListQuery, paginated } from './shared.js';
import { CommentView } from './discussion.js';

export const Post = postSchema;
export const PostFlag = postFlagSchema;
export const PostsPage = paginated(Post);
export const PostIdParam = z.object({ postId: z.string() });
export const FeedQuery = ListQuery.extend({ topicId: z.string().optional() });

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
export const ResolvePostFlags = z.object({ resolution: postFlagResolutionSchema }).strict();

export const PostReactions = z.object({
  reactions: z.record(z.string(), z.number().int()),
  viewerReaction: z.string().optional(),
});

export const SpaceQueue = z.object({
  pending: z.array(Post),
  flags: z.array(PostFlag),
  commentFlags: z.array(commentReportSchema),
});

export const PostComments = z.array(CommentView);
