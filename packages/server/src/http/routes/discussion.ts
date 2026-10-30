// Moderator-facing discussion routes. The learner surface (everything under
// `/api/member`) lives in routes/member/comments.ts.
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  Comment,
  CommentIdParam,
  CommentsPage,
  CommentsQuery,
  CommentView,
  PatchComment,
  ReplyToComment,
  refusals,
} from '../schemas/index.js';
import { NotFoundError } from '@headless-lms/core/shared/errors';
import type { Container } from '../../app/container.js';
import { resolveScope } from '../scope.js';

export async function discussionRoutes(app: FastifyInstance, container: Container): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const discussion = container.discussion;
  const staff = async (req: FastifyRequest) => {
    await resolveScope(container, req);
  };

  r.route({
    method: 'GET',
    url: '/api/comments',
    preHandler: staff,
    schema: {
      operationId: 'listComments',
      tags: ['Discussion'],
      summary: 'List course comments for moderation (staff)',
      description:
        "Staff only (owner, admin, instructor). Comments on course activities, filtered by course, activity, author, status or open reports; each row carries the author's email and the open reports.",
      querystring: CommentsQuery,
      response: { 200: CommentsPage, ...refusals(403) },
    },
    handler: async (req) => {
      return discussion.listComments(req.orgId, req.query);
    },
  });

  r.route({
    method: 'DELETE',
    url: '/api/comments/:commentId',
    preHandler: staff,
    schema: {
      operationId: 'moderateRemoveComment',
      tags: ['Discussion'],
      summary: 'Remove a course comment (staff)',
      description:
        'Staff only (owner, admin, instructor). Hides the comment and resolves its open reports as `removed`. Removing a removed comment returns it unchanged.',
      params: CommentIdParam,
      response: { 200: CommentView, ...refusals(403, 404) },
    },
    handler: async (req) => {
      const orgUser = await container.organizations.getOrgUser(req.orgId, req.userId);
      return discussion.remove(req.orgId, req.params.commentId, orgUser!);
    },
  });

  r.route({
    method: 'PATCH',
    url: '/api/comments/:commentId',
    preHandler: staff,
    schema: {
      operationId: 'publishComment',
      tags: ['Discussion'],
      summary: 'Publish a course comment (staff)',
      description:
        'Staff only (owner, admin, instructor). Approves a pending comment or restores a removed one; a published comment is returned unchanged.',
      params: CommentIdParam,
      body: PatchComment,
      response: { 200: Comment, ...refusals(403, 404) },
    },
    handler: async (req) => {
      const orgUser = await container.organizations.getOrgUser(req.orgId, req.userId);
      if (!orgUser) {
        throw new NotFoundError('OrgUser', req.userId);
      }
      return discussion.publish(req.orgId, req.params.commentId, orgUser);
    },
  });

  r.route({
    method: 'DELETE',
    url: '/api/comments/:commentId/reports',
    preHandler: staff,
    schema: {
      operationId: 'dismissCommentReports',
      tags: ['Discussion'],
      summary: 'Dismiss every open report on a course comment (staff)',
      description: 'Staff only (owner, admin, instructor). The comment stays up.',
      params: CommentIdParam,
      response: { 204: z.void(), ...refusals(403, 404) },
    },
    handler: async (req, reply) => {
      const orgUser = await container.organizations.getOrgUser(req.orgId, req.userId);
      if (!orgUser) {
        throw new NotFoundError('OrgUser', req.userId);
      }
      await discussion.resolveReports(req.orgId, req.params.commentId, orgUser);
      return reply.code(204).send();
    },
  });

  r.route({
    method: 'POST',
    url: '/api/comments/:commentId/replies',
    preHandler: staff,
    schema: {
      operationId: 'replyToComment',
      tags: ['Discussion'],
      summary: 'Reply to a course comment from the moderation queue (staff)',
      description:
        'Staff only (owner, admin, instructor). Replies nest one level: answering a reply attaches to its root comment.',
      params: CommentIdParam,
      body: ReplyToComment,
      response: { 200: CommentView, ...refusals(403, 404) },
    },
    handler: async (req) => {
      const orgUser = await container.organizations.getOrgUser(req.orgId, req.userId);
      if (!orgUser) {
        throw new NotFoundError('OrgUser', req.userId);
      }
      const parent = await discussion.getComment(req.orgId, req.params.commentId);
      if (!parent || parent.activityId === null) {
        throw new NotFoundError('Comment', req.params.commentId);
      }
      // Replies nest one level: answering a reply attaches to its root.
      return discussion.postComment(req.orgId, {
        actor: orgUser,
        activityId: parent.activityId,
        parentId: parent.parentId ?? parent.id,
        body: req.body.body,
      });
    },
  });
}
