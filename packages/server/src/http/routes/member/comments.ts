import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  ActivityComments,
  Comment,
  CommentIdParam,
  CommentReport,
  CommentView,
  DiscussionActivityParam,
  EditComment,
  PostComment,
  Reactions,
  ReportComment,
  ResolveCommentFlags,
  SetReaction,
  refusals,
} from '../../schemas/index.js';
import type { Container } from '../../../app/container.js';
import { resolveActor } from '../../scope.js';

export async function memberCommentsRoutes(
  app: FastifyInstance,
  container: Container,
): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const discussion = container.discussion;
  const tags = ['Discussion'];

  r.route({
    method: 'GET',
    url: '/api/member/activities/:activityId/comments',
    preHandler: app.requireOrgSession,
    config: { operation: 'discussion.activityComments' },
    schema: {
      operationId: 'listActivityComments',
      tags,
      summary: "Read an activity's comments",
      description:
        "For anyone who can open the course: through a grant, or with `courses:read` on it. Returns the activity's resolved comment settings with the comments; removed comments keep their place without their body.",
      params: DiscussionActivityParam,
      response: { 200: ActivityComments, ...refusals(403, 404) },
    },
    handler: async (req) => {
      const actor = await resolveActor(container, req);
      return discussion.activityComments(req.params.activityId, actor);
    },
  });

  r.route({
    method: 'POST',
    url: '/api/member/activities/:activityId/comments',
    preHandler: app.requireOrgSession,
    config: { operation: 'discussion.postComment' },
    schema: {
      operationId: 'postComment',
      tags,
      summary: 'Post a comment or reply on an activity',
      description:
        'For anyone who can open the course, while discussion is on for the activity (403 otherwise). Lands pending when the course requires review and you do not hold `courses:moderate` on it. Replies nest one level and need threading on.',
      params: DiscussionActivityParam,
      body: PostComment,
      response: { 201: CommentView, ...refusals(403, 404) },
    },
    handler: async (req, reply) => {
      const actor = await resolveActor(container, req);
      const comment = await discussion.postComment(
        { activityId: req.params.activityId, parentId: req.body.parentId, body: req.body.body },
        actor,
      );
      return reply.code(201).send(comment);
    },
  });

  r.route({
    method: 'PATCH',
    url: '/api/member/comments/:commentId',
    preHandler: app.requireOrgSession,
    config: { operation: 'discussion.edit' },
    schema: {
      operationId: 'editComment',
      tags,
      summary: 'Revise your own comment',
      description:
        'Author only; not even a moderator may revise it. Discussion must be open where the comment is, and a removed comment cannot be revised.',
      params: CommentIdParam,
      body: EditComment,
      response: { 200: CommentView, ...refusals(403, 404) },
    },
    handler: async (req) => {
      const actor = await resolveActor(container, req);
      return discussion.edit(req.params.commentId, req.body.body, actor);
    },
  });

  r.route({
    method: 'DELETE',
    url: '/api/member/comments/:commentId',
    preHandler: app.requireOrgSession,
    config: { operation: 'discussion.remove' },
    schema: {
      operationId: 'deleteComment',
      tags,
      summary: 'Delete your comment, or one you moderate',
      description:
        'The author can delete their own comment; anyone else needs `communities:moderate` on the community for a post comment, or `courses:moderate` on the course for a lesson comment. The comment is marked removed and keeps its place in the thread. Deleting a removed comment returns it unchanged.',
      params: CommentIdParam,
      response: { 200: CommentView, ...refusals(403, 404) },
    },
    handler: async (req) => {
      const actor = await resolveActor(container, req);
      return discussion.remove(req.params.commentId, 'any', actor);
    },
  });

  r.route({
    method: 'PUT',
    url: '/api/member/comments/:commentId/reaction',
    preHandler: app.requireOrgSession,
    config: { operation: 'discussion.setReaction' },
    schema: {
      operationId: 'setCommentReaction',
      tags,
      summary: 'Set your reaction on a comment',
      description:
        'For anyone who can read the comment, while reactions are on where it is (403 otherwise). Replaces any reaction you already had and returns the new counts.',
      params: CommentIdParam,
      body: SetReaction,
      response: { 200: Reactions, ...refusals(403, 404) },
    },
    handler: async (req) => {
      const actor = await resolveActor(container, req);
      return discussion.setReaction(req.params.commentId, req.body.emoji, actor);
    },
  });

  r.route({
    method: 'DELETE',
    url: '/api/member/comments/:commentId/reaction',
    preHandler: app.requireOrgSession,
    config: { operation: 'discussion.setReaction' },
    schema: {
      operationId: 'clearCommentReaction',
      tags,
      summary: 'Withdraw your reaction from a comment',
      description: 'For anyone who can read the comment. Returns the new counts.',
      params: CommentIdParam,
      response: { 200: Reactions, ...refusals(403, 404) },
    },
    handler: async (req) => {
      const actor = await resolveActor(container, req);
      return discussion.setReaction(req.params.commentId, null, actor);
    },
  });

  r.route({
    method: 'POST',
    url: '/api/member/comments/:commentId/reports',
    preHandler: app.requireOrgSession,
    config: { operation: 'discussion.reportComment' },
    schema: {
      operationId: 'reportComment',
      tags,
      summary: 'Flag a comment for the moderators',
      description:
        'For anyone who can read the comment. Flagging it again while your flag is open returns that flag.',
      params: CommentIdParam,
      body: ReportComment,
      response: { 200: CommentReport, ...refusals(403, 404) },
    },
    handler: async (req) => {
      const actor = await resolveActor(container, req);
      return discussion.reportComment(req.params.commentId, req.body.reason, actor);
    },
  });

  r.route({
    method: 'POST',
    url: '/api/member/comments/:commentId/flags/resolution',
    preHandler: app.requireOrgSession,
    config: { operation: 'discussion.resolveReports' },
    schema: {
      operationId: 'resolveCommentFlags',
      tags,
      summary: 'Dismiss the open flags on a comment in a space you moderate',
      description:
        'Needs `courses:moderate` on the course for an activity comment, or `communities:moderate` on the community for a post comment. Closes every open flag and leaves the comment up.',
      params: CommentIdParam,
      body: ResolveCommentFlags,
      response: { 204: z.void(), ...refusals(403, 404) },
    },
    handler: async (req, reply) => {
      const actor = await resolveActor(container, req);
      await discussion.resolveReports(req.params.commentId, 'any', actor);
      return reply.code(204).send();
    },
  });

  r.route({
    method: 'POST',
    url: '/api/member/comments/:commentId/restoration',
    preHandler: app.requireOrgSession,
    config: { operation: 'discussion.restore' },
    schema: {
      operationId: 'restoreMemberComment',
      tags,
      summary: 'Restore a removed comment where you moderate',
      description:
        'Needs `courses:moderate` on the course for an activity comment, or `communities:moderate` on the community for a post comment. Publishes the comment again; a comment that is not removed is returned unchanged.',
      params: CommentIdParam,
      response: { 200: CommentView, ...refusals(403, 404) },
    },
    handler: async (req) => {
      const actor = await resolveActor(container, req);
      return discussion.restore(req.params.commentId, 'any', actor);
    },
  });

  r.route({
    method: 'POST',
    url: '/api/member/comments/:commentId/approval',
    preHandler: app.requireOrgSession,
    config: { operation: 'discussion.approve' },
    schema: {
      operationId: 'approveMemberComment',
      tags,
      summary: 'Publish a comment awaiting review where you moderate',
      description:
        'Needs `courses:moderate` on the course for an activity comment, or `communities:moderate` on the community for a post comment. 403 when the comment is not awaiting review.',
      params: CommentIdParam,
      response: { 200: Comment, ...refusals(403, 404) },
    },
    handler: async (req) => {
      const actor = await resolveActor(container, req);
      return discussion.approve(req.params.commentId, actor);
    },
  });
}
