import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  ActivityComments,
  Comment,
  CommentIdParam,
  CommentReactions,
  CommentReport,
  CommentView,
  DiscussionActivityParam,
  EditComment,
  ErrorBody,
  PostComment,
  ReportComment,
  SetCommentReaction,
} from '../../schemas/index.js';
import type { Container } from '../../../app/container.js';
import { UnauthorizedError } from '../../plugins/auth.js';

export async function memberCommentsRoutes(
  app: FastifyInstance,
  container: Container,
): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const discussion = container.discussion;

  r.route({
    method: 'GET',
    url: '/api/member/activities/:activityId/comments',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'listActivityComments',
      tags: ['Discussion'],
      summary: "Read an activity's comments",
      params: DiscussionActivityParam,
      response: { 200: ActivityComments, 404: ErrorBody },
    },
    handler: async (req) => {
      const orgId = req.orgId;
      const orgUser = await container.organizations.getOrgUser(req.orgId, req.userId);
      if (!orgUser) {
        throw new UnauthorizedError();
      }
      return discussion.activityComments(orgId, req.params.activityId, orgUser);
    },
  });

  r.route({
    method: 'POST',
    url: '/api/member/activities/:activityId/comments',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'postComment',
      tags: ['Discussion'],
      summary: 'Post a comment or reply on an activity',
      params: DiscussionActivityParam,
      body: PostComment,
      response: { 200: CommentView, 403: ErrorBody, 404: ErrorBody },
    },
    handler: async (req) => {
      const orgId = req.orgId;
      const orgUser = await container.organizations.getOrgUser(req.orgId, req.userId);
      if (!orgUser) {
        throw new UnauthorizedError();
      }
      return discussion.postComment(orgId, {
        actor: orgUser,
        activityId: req.params.activityId,
        parentId: req.body.parentId,
        body: req.body.body,
      });
    },
  });

  r.route({
    method: 'PATCH',
    url: '/api/member/comments/:commentId',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'editComment',
      tags: ['Discussion'],
      summary: 'Revise your own comment',
      params: CommentIdParam,
      body: EditComment,
      response: { 200: CommentView, 403: ErrorBody, 404: ErrorBody },
    },
    handler: async (req) => {
      const orgId = req.orgId;
      const orgUser = await container.organizations.getOrgUser(req.orgId, req.userId);
      if (!orgUser) {
        throw new UnauthorizedError();
      }
      return discussion.edit(orgId, req.params.commentId, orgUser, req.body.body);
    },
  });

  r.route({
    method: 'DELETE',
    url: '/api/member/comments/:commentId',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'deleteComment',
      tags: ['Discussion'],
      summary: 'Delete a comment',
      params: CommentIdParam,
      response: { 200: Comment, 403: ErrorBody, 404: ErrorBody },
    },
    handler: async (req) => {
      const orgId = req.orgId;
      const orgUser = await container.organizations.getOrgUser(req.orgId, req.userId);
      if (!orgUser) {
        throw new UnauthorizedError();
      }
      return discussion.remove(orgId, req.params.commentId, orgUser);
    },
  });

  r.route({
    method: 'PUT',
    url: '/api/member/comments/:commentId/reaction',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'setCommentReaction',
      tags: ['Discussion'],
      summary: 'Set your reaction to a comment, replacing any you already had',
      params: CommentIdParam,
      body: SetCommentReaction,
      response: { 200: CommentReactions, 403: ErrorBody, 404: ErrorBody },
    },
    handler: async (req) => {
      const orgId = req.orgId;
      const orgUser = await container.organizations.getOrgUser(req.orgId, req.userId);
      if (!orgUser) {
        throw new UnauthorizedError();
      }
      return discussion.setReaction(orgId, req.params.commentId, orgUser, req.body.emoji);
    },
  });

  r.route({
    method: 'DELETE',
    url: '/api/member/comments/:commentId/reaction',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'clearCommentReaction',
      tags: ['Discussion'],
      summary: 'Withdraw your reaction from a comment',
      params: CommentIdParam,
      response: { 200: CommentReactions, 403: ErrorBody, 404: ErrorBody },
    },
    handler: async (req) => {
      const orgId = req.orgId;
      const orgUser = await container.organizations.getOrgUser(req.orgId, req.userId);
      if (!orgUser) {
        throw new UnauthorizedError();
      }
      return discussion.setReaction(orgId, req.params.commentId, orgUser, null);
    },
  });

  r.route({
    method: 'POST',
    url: '/api/member/comments/:commentId/reports',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'reportComment',
      tags: ['Discussion'],
      summary: 'Flag a comment for moderator attention',
      params: CommentIdParam,
      body: ReportComment,
      response: { 200: CommentReport, 403: ErrorBody, 404: ErrorBody },
    },
    handler: async (req) => {
      const orgId = req.orgId;
      const orgUser = await container.organizations.getOrgUser(req.orgId, req.userId);
      if (!orgUser) {
        throw new UnauthorizedError();
      }
      return discussion.reportComment(orgId, req.params.commentId, orgUser, req.body.reason);
    },
  });

  r.route({
    method: 'DELETE',
    url: '/api/member/comments/:commentId/reports',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'dismissMemberCommentReports',
      tags: ['Discussion'],
      summary: 'Dismiss every open flag on a comment in a space you moderate',
      params: CommentIdParam,
      response: { 204: z.void(), 401: ErrorBody, 403: ErrorBody, 404: ErrorBody },
    },
    handler: async (req, reply) => {
      const orgUser = await container.organizations.getOrgUser(req.orgId, req.userId);
      if (!orgUser) {
        throw new UnauthorizedError();
      }
      await discussion.resolveReports(req.orgId, req.params.commentId, orgUser);
      return reply.code(204).send();
    },
  });
}
