import { z } from 'zod';
import {
  boundedJsonSchema,
  flaggedCommentSchema,
  idSchema,
  postFlagResolutionSchema,
  postFlagSchema,
  postViewSchema,
} from '@headless-lms/core/schemas';
import { CommentView } from './discussion.js';
import { DateTimeInput, PageQuery, paginated } from './shared.js';

export const PostView = postViewSchema;
export const PostFlag = postFlagSchema;
export const PostFeedPage = paginated(PostView);
export const PostIdParam = z.object({ postId: z.string() });
export const FeedQuery = PageQuery.extend({
  topicId: z.string().optional().describe('Only posts under this topic'),
}).strict();

const PostTitle = z.string().trim().min(1).max(200);
const PostBody = z.string().max(50_000);
const PostExtra = boundedJsonSchema(16 * 1024);

export const CreatePost = z
  .object({
    title: PostTitle,
    body: PostBody,
    topicId: idSchema
      .nullable()
      .describe("One of the space's topics. Required when the space has topics, else null"),
    extra: PostExtra.default({}),
    coverAssetId: idSchema
      .nullable()
      .describe('A finalized image you uploaded through `requestMemberUpload`'),
    mode: z
      .enum(['draft', 'submit', 'schedule'])
      .describe(
        '`draft` keeps the post to yourself. `submit` publishes it, or holds it for review when the space requires review and you are not staff. `schedule` submits it at `scheduledAt`.',
      ),
    scheduledAt: DateTimeInput.nullable().describe(
      'When a scheduled post is submitted. Required, and in the future, when `mode` is `schedule`; ignored otherwise.',
    ),
  })
  .strict();

export const UpdatePost = z
  .object({
    title: PostTitle.optional(),
    body: PostBody.optional(),
    topicId: idSchema.nullable().optional(),
    extra: PostExtra.optional(),
    coverAssetId: idSchema.nullable().optional(),
  })
  .strict();

export const SchedulePost = z
  .object({
    scheduledAt: DateTimeInput.describe('When the post is submitted; must be in the future'),
  })
  .strict();
export const SetPostReactions = z
  .object({ enabled: z.boolean().describe('Whether readers may react to this post') })
  .strict();
export const FlagReason = z.object({ reason: z.string().trim().min(1).max(1_000) }).strict();
export const ResolvePostFlags = z
  .object({
    resolution: postFlagResolutionSchema
      .extract(['dismissed'])
      .describe(
        '`dismissed` closes the open flags and leaves the post up. Removing the post resolves its flags as `removed` instead.',
      ),
  })
  .strict();

export const SpaceQueue = z.object({
  pending: z.array(PostView),
  flags: z.array(PostFlag),
  commentFlags: z.array(flaggedCommentSchema),
});

export const PostCommentsPage = paginated(CommentView);
