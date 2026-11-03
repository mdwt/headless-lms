import type { TemplateContext } from "@headless-lms/core/types";
import { defineEmail, portal } from "./community.js";

const activity = (ctx: TemplateContext, courseId: string, activityId: string) =>
  portal(ctx, `/courses/${courseId}?activity=${activityId}`);

export const courseActivityAdded = defineEmail<"courseActivityAdded">({
  subject: (_ctx, params) => `New in ${params.courseTitle}: ${params.activityTitle}`,
  heading: (params) => params.activityTitle,
  lines: (params) => [`${params.courseTitle}, ${params.moduleTitle}`],
  button: (ctx, params) => ({
    href: activity(ctx, params.courseId, params.activityId),
    label: "Open lesson",
  }),
  preview: {
    courseTitle: "Fly Tying 101",
    moduleTitle: "Basics",
    activityTitle: "Choosing hooks",
    courseId: "crs_1",
    activityId: "act_1",
  },
});

export const activityCommentCreated = defineEmail<"activityCommentCreated">({
  subject: (_ctx, params) => `${params.commenterName} commented on ${params.activityTitle}`,
  heading: (params) => params.activityTitle,
  lines: (params) => [params.courseTitle, params.commenterName, params.excerpt],
  button: (ctx, params) => ({
    href: activity(ctx, params.courseId, params.activityId),
    label: "View comment",
  }),
  preview: {
    activityTitle: "Choosing hooks",
    courseTitle: "Fly Tying 101",
    commenterName: "Sam",
    excerpt: "Nice",
    courseId: "crs_1",
    activityId: "act_1",
    commentId: "cmt_1",
  },
});

export const activityCommentRemoved = defineEmail<"activityCommentRemoved">({
  subject: (_ctx, params) => `Your comment was removed from ${params.activityTitle}`,
  heading: (params) => params.activityTitle,
  lines: (params) => [`Your comment in ${params.courseTitle} was removed.`],
  button: (ctx, params) => ({
    href: activity(ctx, params.courseId, params.activityId),
    label: "Open lesson",
  }),
  preview: {
    activityTitle: "Choosing hooks",
    courseTitle: "Fly Tying 101",
    courseId: "crs_1",
    activityId: "act_1",
  },
});

export const activityCommentReacted = defineEmail<"activityCommentReacted">({
  subject: (_ctx, params) => `${params.reactorName} reacted to your comment`,
  heading: (params) => params.activityTitle,
  lines: (params) => [`${params.reactorName} reacted ${params.reaction} to:`, params.excerpt],
  button: (ctx, params) => ({
    href: activity(ctx, params.courseId, params.activityId),
    label: "View comment",
  }),
  preview: {
    activityTitle: "Choosing hooks",
    courseTitle: "Fly Tying 101",
    excerpt: "Nice",
    reactorName: "Sam",
    reaction: "👍",
    courseId: "crs_1",
    activityId: "act_1",
    commentId: "cmt_1",
  },
});

export const activityCommentFlagged = defineEmail<"activityCommentFlagged">({
  subject: (_ctx, params) => `A comment was flagged in ${params.activityTitle}`,
  heading: (params) => params.activityTitle,
  lines: (params) => [params.courseTitle, params.reason, params.excerpt],
  button: (ctx, params) => ({
    href: activity(ctx, params.courseId, params.activityId),
    label: "Review",
  }),
  preview: {
    activityTitle: "Choosing hooks",
    courseTitle: "Fly Tying 101",
    excerpt: "Hello",
    reason: "Spam",
    courseId: "crs_1",
    activityId: "act_1",
  },
});

export const activityMention = defineEmail<"activityMention">({
  subject: (_ctx, params) => `${params.authorName} mentioned you in ${params.activityTitle}`,
  heading: (params) => params.activityTitle,
  lines: (params) => [params.courseTitle, params.authorName, params.excerpt],
  button: (ctx, params) => ({
    href: activity(ctx, params.courseId, params.activityId),
    label: "View",
  }),
  preview: {
    authorName: "Sam",
    excerpt: "Thanks @Ann",
    activityTitle: "Choosing hooks",
    courseTitle: "Fly Tying 101",
    courseId: "crs_1",
    activityId: "act_1",
  },
});
