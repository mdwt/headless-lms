import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  ActivityComments,
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
import { actorOf } from './actor.js';

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
    schema: {
      operationId: 'listActivityComments',
      tags,
      summary: "Read an activity's comments",
      description:
        "For a student who can open the course, and staff. Returns the activity's resolved comment settings with the comments; removed comments keep their place without their body.",
      params: DiscussionActivityParam,
      response: { 200: ActivityComments, ...refusals(403, 404) },
    },
    handler: async (req) => {
      const orgUser = await actorOf(container, req.orgId, req.userId);
      return discussion.activityComments(req.orgId, req.params.activityId, orgUser);
    },
  });

  r.route({
    method: 'POST',
    url: '/api/member/activities/:activityId/comments',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'postComment',
      tags,
      summary: 'Post a comment or reply on an activity',
      description:
        'For a student who can open the course, and staff, while discussion is on for the activity (403 otherwise). Lands pending when the course requires review and you are not staff. Replies nest one level and need threading on.',
      params: DiscussionActivityParam,
      body: PostComment,
      response: { 201: CommentView, ...refusals(403, 404) },
    },
    handler: async (req, reply) => {
      const orgUser = await actorOf(container, req.orgId, req.userId);
      const comment = await discussion.postComment(req.orgId, {
        actor: orgUser,
        activityId: req.params.activityId,
        parentId: req.body.parentId,
        body: req.body.body,
      });
      return reply.code(201).send(comment);
    },
  });

  r.route({
    method: 'PATCH',
    url: '/api/member/comments/:commentId',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'editComment',
      tags,
      summary: 'Revise your own comment',
      description:
        'Author only; not even staff may revise it. Discussion must be open where the comment is, and a removed comment cannot be revised.',
      params: CommentIdParam,
      body: EditComment,
      response: { 200: CommentView, ...refusals(403, 404) },
    },
    handler: async (req) => {
      const orgUser = await actorOf(container, req.orgId, req.userId);
      return discussion.edit(req.orgId, req.params.commentId, orgUser, req.body.body);
    },
  });

  r.route({
    method: 'DELETE',
    url: '/api/member/comments/:commentId',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'deleteComment',
      tags,
      summary: 'Delete your comment, or one you moderate',
      description:
        'For the author, staff on an activity comment, or a moderator on a post comment. The comment is marked removed and keeps its place in the thread. Deleting a removed comment returns it unchanged.',
      params: CommentIdParam,
      response: { 200: CommentView, ...refusals(403, 404) },
    },
    handler: async (req) => {
      const orgUser = await actorOf(container, req.orgId, req.userId);
      return discussion.remove(req.orgId, req.params.commentId, orgUser);
    },
  });

  r.route({
    method: 'PUT',
    url: '/api/member/comments/:commentId/reaction',
    preHandler: app.requireOrgSession,
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
      const orgUser = await actorOf(container, req.orgId, req.userId);
      return discussion.setReaction(req.orgId, req.params.commentId, orgUser, req.body.emoji);
    },
  });

  r.route({
    method: 'DELETE',
    url: '/api/member/comments/:commentId/reaction',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'clearCommentReaction',
      tags,
      summary: 'Withdraw your reaction from a comment',
      description: 'For anyone who can read the comment. Returns the new counts.',
      params: CommentIdParam,
      response: { 200: Reactions, ...refusals(403, 404) },
    },
    handler: async (req) => {
      const orgUser = await actorOf(container, req.orgId, req.userId);
      return discussion.setReaction(req.orgId, req.params.commentId, orgUser, null);
    },
  });

  r.route({
    method: 'POST',
    url: '/api/member/comments/:commentId/reports',
    preHandler: app.requireOrgSession,
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
      const orgUser = await actorOf(container, req.orgId, req.userId);
      return discussion.reportComment(req.orgId, req.params.commentId, orgUser, req.body.reason);
    },
  });

  r.route({
    method: 'POST',
    url: '/api/member/comments/:commentId/flags/resolution',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'resolveCommentFlags',
      tags,
      summary: 'Dismiss the open flags on a comment in a space you moderate',
      description:
        'For a moderator of a post comment, or staff for an activity comment. Closes every open flag and leaves the comment up.',
      params: CommentIdParam,
      body: ResolveCommentFlags,
      response: { 204: z.void(), ...refusals(403, 404) },
    },
    handler: async (req, reply) => {
      const orgUser = await actorOf(container, req.orgId, req.userId);
      await discussion.resolveReports(req.orgId, req.params.commentId, orgUser);
      return reply.code(204).send();
    },
  });
}
