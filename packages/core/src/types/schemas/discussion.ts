import { z } from 'zod';
import { roleSchema } from './organizations.js';
import { idSchema, emailSchema, jsonValueSchema } from './shared.js';

export const commentStatusSchema = z.enum(['pending', 'published', 'removed']);
export type CommentStatus = z.infer<typeof commentStatusSchema>;

export const reactionEmojiSchema = z.string();
export type ReactionEmoji = z.infer<typeof reactionEmojiSchema>;

export const reactionCountsSchema = z.record(reactionEmojiSchema, z.number().int().min(0));
export type ReactionCounts = z.infer<typeof reactionCountsSchema>;

export const commentSettingsSchema = z
  .object({
    enabled: z.boolean(),
    threaded: z.boolean(),
    requireReview: z.boolean(),
    reactions: z.boolean(),
  })
  .strict();
export type CommentSettings = z.infer<typeof commentSettingsSchema>;

export type CommentsConfig = CommentSettings;

export const activityCommentsRuleSchema = z.enum(['inherit', 'always', 'never']);
export type ActivityCommentsRule = z.infer<typeof activityCommentsRuleSchema>;

export const commentSchema = z
  .object({
    id: idSchema,
    orgId: idSchema,
    activityId: idSchema.nullable(),
    postId: idSchema.nullable(),
    communityId: idSchema.nullable(),
    parentId: idSchema.nullable(),
    orgUserId: idSchema,
    body: z.string(),
    status: commentStatusSchema,
    removedBy: idSchema.nullable(),
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
  })
  .strict();
export type Comment = z.output<typeof commentSchema>;
export type CommentInput = z.input<typeof commentSchema>;

export const commentAuthorSchema = z
  .object({
    id: idSchema,
    firstName: z.string().nullable(),
    lastName: z.string().nullable(),
    displayName: z.string().nullable(),
    headline: z.string().nullable(),
    image: z.string().nullable(),
    imageAssetId: idSchema.nullable(),
    imageUrl: z.string().nullable(),
    role: roleSchema,
  })
  .strict();
export type CommentAuthor = z.infer<typeof commentAuthorSchema>;

export const commentReactionSchema = z
  .object({
    orgId: idSchema,
    commentId: idSchema,
    orgUserId: idSchema,
    emoji: reactionEmojiSchema,
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
  })
  .strict();
export type CommentReaction = z.output<typeof commentReactionSchema>;

export const commentFlagResolutionSchema = z.enum(['dismissed', 'removed']);
export type CommentFlagResolution = z.infer<typeof commentFlagResolutionSchema>;

export const commentReportSchema = z
  .object({
    id: idSchema,
    orgId: idSchema,
    commentId: idSchema,
    orgUserId: idSchema,
    reason: z.string(),
    resolvedAt: z.coerce.date().nullable(),
    resolution: commentFlagResolutionSchema.nullable(),
    resolvedBy: idSchema.nullable(),
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
  })
  .strict();
export type CommentReport = z.output<typeof commentReportSchema>;
export type CommentReportInput = z.input<typeof commentReportSchema>;

export const commentViewSchema = z
  .object({
    id: idSchema,
    activityId: idSchema.nullable(),
    postId: idSchema.nullable(),
    communityId: idSchema.nullable(),
    parentId: idSchema.nullable(),
    author: commentAuthorSchema,
    body: z.string().nullable(),
    status: commentStatusSchema,
    removedBy: commentAuthorSchema.nullable(),
    reactions: reactionCountsSchema,
    viewerReaction: reactionEmojiSchema.optional(),
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
  })
  .strict();
export type CommentView = z.output<typeof commentViewSchema>;

export const commentReportSummarySchema = z
  .object({
    reporter: commentAuthorSchema,
    reason: z.string(),
    createdAt: z.coerce.date(),
  })
  .strict();
export type CommentReportSummary = z.output<typeof commentReportSummarySchema>;

export const commentListItemSchema = z
  .object({
    id: idSchema,
    parentId: idSchema.nullable(),
    activityId: idSchema,
    activityTitle: z.string(),
    courseId: idSchema,
    body: z.string(),
    status: commentStatusSchema,
    author: commentAuthorSchema,
    authorEmail: emailSchema,
    removedBy: idSchema.nullable(),
    reports: z.array(commentReportSummarySchema),
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
  })
  .strict();
export type CommentListItem = z.output<typeof commentListItemSchema>;

export const listCommentsQuerySchema = z
  .object({
    page: z.number().int().min(1),
    pageSize: z.number().int().min(1),
    search: z.string().optional(),
    sort: z.string().optional(),
    status: commentStatusSchema.optional(),
    reported: z.boolean().optional(),
    courseId: idSchema.optional(),
    activityId: idSchema.optional(),
    orgUserId: idSchema.optional(),
  })
  .strict();
export type ListCommentsQuery = z.infer<typeof listCommentsQuerySchema>;

export const postStatusSchema = z.enum(['draft', 'scheduled', 'pending', 'published', 'removed']);
export type PostStatus = z.infer<typeof postStatusSchema>;

export const postSchema = z
  .object({
    orgId: idSchema,
    id: idSchema,
    communityId: idSchema,
    spaceId: idSchema,
    orgUserId: idSchema,
    topicId: idSchema.nullable(),
    title: z.string(),
    body: z.string(),
    extra: jsonValueSchema,
    coverAssetId: idSchema.nullable(),
    status: postStatusSchema,
    scheduledAt: z.coerce.date().nullable(),
    publishedAt: z.coerce.date().nullable(),
    removedBy: idSchema.nullable(),
    pinned: z.boolean(),
    commentsClosed: z.boolean().nullable(),
    reactionsEnabled: z.boolean().nullable(),
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
  })
  .strict();
export type Post = z.output<typeof postSchema>;

export const postViewSchema = postSchema
  .extend({
    coverUrl: z.string().nullable(),
    author: commentAuthorSchema,
    reactions: reactionCountsSchema,
    viewerReaction: reactionEmojiSchema.nullable(),
    commentCount: z.number().int().min(0),
    following: z.boolean(),
    bookmarked: z.boolean(),
  })
  .strict();
export type PostView = z.output<typeof postViewSchema>;

export const flaggedCommentSchema = commentReportSchema
  .extend({
    comment: z
      .object({
        id: idSchema,
        postId: idSchema,
        body: z.string(),
        orgUserId: idSchema,
        status: commentStatusSchema,
      })
      .strict(),
  })
  .strict();
export type FlaggedComment = z.output<typeof flaggedCommentSchema>;

export const postReactionSchema = z
  .object({
    orgId: idSchema,
    postId: idSchema,
    orgUserId: idSchema,
    emoji: reactionEmojiSchema,
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
  })
  .strict();
export type PostReaction = z.output<typeof postReactionSchema>;

export const postFollowSchema = z
  .object({
    orgId: idSchema,
    postId: idSchema,
    orgUserId: idSchema,
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
  })
  .strict();
export type PostFollow = z.output<typeof postFollowSchema>;

export const postBookmarkSchema = z
  .object({
    orgId: idSchema,
    postId: idSchema,
    orgUserId: idSchema,
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
  })
  .strict();
export type PostBookmark = z.output<typeof postBookmarkSchema>;

export const postFlagResolutionSchema = z.enum(['dismissed', 'removed']);
export type PostFlagResolution = z.infer<typeof postFlagResolutionSchema>;

export const postFlagSchema = z
  .object({
    orgId: idSchema,
    id: idSchema,
    postId: idSchema,
    orgUserId: idSchema,
    reason: z.string(),
    resolvedAt: z.coerce.date().nullable(),
    resolution: postFlagResolutionSchema.nullable(),
    resolvedBy: idSchema.nullable(),
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
  })
  .strict();
export type PostFlag = z.output<typeof postFlagSchema>;

export const chatKindSchema = z.enum(['direct', 'group']);
export type ChatKind = z.infer<typeof chatKindSchema>;

export const chatStatusSchema = z.enum(['pending', 'open', 'closed']);
export type ChatStatus = z.infer<typeof chatStatusSchema>;

export const chatSchema = z
  .object({
    orgId: idSchema,
    id: idSchema,
    communityId: idSchema,
    kind: chatKindSchema,
    status: chatStatusSchema,
    createdBy: idSchema.nullable(),
    lockedAt: z.coerce.date().nullable(),
    lockedBy: idSchema.nullable(),
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
  })
  .strict();
export type Chat = z.output<typeof chatSchema>;

export const chatUserSchema = z
  .object({
    orgId: idSchema,
    communityId: idSchema,
    chatId: idSchema,
    orgUserId: idSchema,
    joinedAt: z.coerce.date(),
    leftAt: z.coerce.date().nullable(),
    lastReadMessageId: idSchema.nullable(),
    muted: z.boolean(),
    mutedUntil: z.coerce.date().nullable(),
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
  })
  .strict();
export type ChatUser = z.output<typeof chatUserSchema>;

export const messageSchema = z
  .object({
    orgId: idSchema,
    id: idSchema,
    communityId: idSchema,
    chatId: idSchema,
    orgUserId: idSchema,
    body: z.string(),
    replyToId: idSchema.nullable(),
    editedAt: z.coerce.date().nullable(),
    deletedAt: z.coerce.date().nullable(),
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
  })
  .strict();
export type Message = z.output<typeof messageSchema>;

export const messageFileSchema = z.object({ assetId: idSchema, url: z.string() }).strict();
export type MessageFile = z.output<typeof messageFileSchema>;

export const messageViewSchema = messageSchema
  .extend({
    sender: commentAuthorSchema,
    attachments: z.array(messageFileSchema),
    reactions: reactionCountsSchema,
    viewerReaction: reactionEmojiSchema.nullable(),
  })
  .strict();
export type MessageView = z.output<typeof messageViewSchema>;

export const chatLastMessageSchema = z
  .object({
    id: idSchema,
    orgUserId: idSchema,
    body: z.string(),
    createdAt: z.coerce.date(),
    deletedAt: z.coerce.date().nullable(),
  })
  .strict();
export type ChatLastMessage = z.output<typeof chatLastMessageSchema>;

export const messageAttachmentSchema = z
  .object({
    orgId: idSchema,
    communityId: idSchema,
    messageId: idSchema,
    assetId: idSchema,
    seq: z.number().int(),
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
  })
  .strict();
export type MessageAttachment = z.output<typeof messageAttachmentSchema>;

export const messageReactionSchema = z
  .object({
    orgId: idSchema,
    communityId: idSchema,
    messageId: idSchema,
    orgUserId: idSchema,
    emoji: reactionEmojiSchema,
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
  })
  .strict();
export type MessageReaction = z.output<typeof messageReactionSchema>;

export const messageFlagResolutionSchema = z.enum(['dismissed', 'deleted', 'locked']);
export type MessageFlagResolution = z.infer<typeof messageFlagResolutionSchema>;

export const messageFlagSchema = z
  .object({
    orgId: idSchema,
    id: idSchema,
    communityId: idSchema,
    messageId: idSchema,
    orgUserId: idSchema,
    reason: z.string(),
    resolvedAt: z.coerce.date().nullable(),
    resolution: messageFlagResolutionSchema.nullable(),
    resolvedBy: idSchema.nullable(),
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
  })
  .strict();
export type MessageFlag = z.output<typeof messageFlagSchema>;

export const blockedUserSchema = z
  .object({
    orgId: idSchema,
    communityId: idSchema,
    blockerOrgUserId: idSchema,
    blockedOrgUserId: idSchema,
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
  })
  .strict();
export type BlockedUser = z.output<typeof blockedUserSchema>;
