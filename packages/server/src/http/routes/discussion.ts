// Moderator-facing discussion routes. The learner surface (everything under
// `/api/member`) lives in routes/member/comments.ts.
import type { FastifyInstance } from 'fastify';
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
import type { Container } from '../../app/container.js';
import { resolveActor } from '../scope.js';

export async function discussionRoutes(app: FastifyInstance, container: Container): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const discussion = container.discussion;

  r.route({
    method: 'GET',
    url: '/api/comments',
    schema: {
      operationId: 'listComments',
      tags: ['Discussion'],
      summary: 'List course comments for moderation',
      description: `Requires \`courses:moderate\`. Comments on the activities of the courses you moderate, filtered by course, activity, author, status or open reports; each row carries the author's email and the open reports.`,
      querystring: CommentsQuery,
      response: { 200: CommentsPage, ...refusals(403) },
    },
    handler: async (req) => {
      const actor = await resolveActor(container, req);
      return discussion.listComments(req.query, actor);
    },
  });

  r.route({
    method: 'DELETE',
    url: '/api/comments/:commentId',
    schema: {
      operationId: 'moderateRemoveComment',
      tags: ['Discussion'],
      summary: 'Remove a course comment',
      description:
        'Needs `courses:moderate` on the course, unless it is your own comment. Hides the comment and resolves its open reports as `removed`. Removing a removed comment returns it unchanged.',
      params: CommentIdParam,
      response: { 200: CommentView, ...refusals(403, 404) },
    },
    handler: async (req) => {
      const actor = await resolveActor(container, req);
      return discussion.remove(req.params.commentId, 'lesson', actor);
    },
  });

  r.route({
    method: 'PATCH',
    url: '/api/comments/:commentId',
    schema: {
      operationId: 'publishComment',
      tags: ['Discussion'],
      summary: 'Publish a course comment',
      description:
        'Needs `courses:moderate` on the course. Approves a pending comment or restores a removed one; a published comment is returned unchanged.',
      params: CommentIdParam,
      body: PatchComment,
      response: { 200: Comment, ...refusals(403, 404) },
    },
    handler: async (req) => {
      const actor = await resolveActor(container, req);
      return discussion.publish(req.params.commentId, 'lesson', actor);
    },
  });

  r.route({
    method: 'DELETE',
    url: '/api/comments/:commentId/reports',
    schema: {
      operationId: 'dismissCommentReports',
      tags: ['Discussion'],
      summary: 'Dismiss every open report on a course comment',
      description: 'Needs `courses:moderate` on the course. The comment stays up.',
      params: CommentIdParam,
      response: { 204: z.void(), ...refusals(403, 404) },
    },
    handler: async (req, reply) => {
      const actor = await resolveActor(container, req);
      await discussion.resolveReports(req.params.commentId, 'lesson', actor);
      return reply.code(204).send();
    },
  });

  r.route({
    method: 'POST',
    url: '/api/comments/:commentId/replies',
    schema: {
      operationId: 'replyToComment',
      tags: ['Discussion'],
      summary: 'Reply to a course comment from the moderation queue',
      description: `Requires \`courses:moderate\`. Needed on the comment's course. Replies nest one level: answering a reply attaches to its root comment.`,
      params: CommentIdParam,
      body: ReplyToComment,
      response: { 200: CommentView, ...refusals(403, 404) },
    },
    handler: async (req) => {
      const actor = await resolveActor(container, req);
      return discussion.replyToComment(req.params.commentId, req.body.body, actor);
    },
  });
}
