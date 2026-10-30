// Member file proxies. Each route checks access with the context that owns the
// file, then redirects to a short-lived signed storage URL. Every refusal is a
// 404, so a response never confirms that a file exists. A 403 only means the
// caller is not a member of the organization.
import type { FastifyInstance, FastifyReply } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { NotFoundError } from '@headless-lms/core/shared/errors';
import {
  ActivityFileParams,
  CommunityThumbnailParams,
  CourseThumbnailParams,
  DownloadFileParams,
  DownloadThumbnailParams,
  MessageAttachmentParams,
  PersonImageParams,
  PostCoverParams,
  UploadFileParams,
  refusals,
} from '../../schemas/index.js';
import { actorOf as memberOf } from './actor.js';
import type { Container } from '../../../app/container.js';

const tags = ['Files'];
const responses = { 302: z.void(), ...refusals(403, 404) };

function redirect(reply: FastifyReply, url: string | null, what: string, id: string) {
  if (!url) {
    throw new NotFoundError(what, id);
  }
  return reply
    .header('cache-control', 'no-store')
    .header('referrer-policy', 'no-referrer')
    .redirect(url, 302);
}

export async function memberFileRoutes(app: FastifyInstance, container: Container): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const member = container.reporting.member;

  async function actorOf(orgId: string, userId: string) {
    const orgUser = await memberOf(container, orgId, userId);
    return { id: orgUser.id, role: orgUser.role };
  }

  r.route({
    method: 'GET',
    url: '/api/member/courses/:courseId/thumbnail',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'getCourseThumbnail',
      tags,
      summary: "Redirect to a course's thumbnail",
      description:
        'Any org user may fetch the thumbnail of a published course; staff may fetch any. 404 when the course has no thumbnail.',
      params: CourseThumbnailParams,
      response: responses,
    },
    handler: async (req, reply) => {
      const actor = await actorOf(req.orgId, req.userId);
      const url = await member.thumbnailFile(req.orgId, actor, 'course', req.params.courseId);
      return redirect(reply, url, 'Course thumbnail', req.params.courseId);
    },
  });

  r.route({
    method: 'GET',
    url: '/api/member/downloads/:downloadId/thumbnail',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'getDownloadThumbnail',
      tags,
      summary: "Redirect to a download's thumbnail",
      description:
        'Any org user may fetch the thumbnail of a published download; staff may fetch any. 404 when the download has no thumbnail.',
      params: DownloadThumbnailParams,
      response: responses,
    },
    handler: async (req, reply) => {
      const actor = await actorOf(req.orgId, req.userId);
      const url = await member.thumbnailFile(req.orgId, actor, 'download', req.params.downloadId);
      return redirect(reply, url, 'Download thumbnail', req.params.downloadId);
    },
  });

  r.route({
    method: 'GET',
    url: '/api/member/communities/:communityId/thumbnail',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'getCommunityThumbnail',
      tags,
      summary: "Redirect to a community's thumbnail",
      description:
        'Any org user may fetch the thumbnail of a published community; staff may fetch any. 404 when the community has no thumbnail.',
      params: CommunityThumbnailParams,
      response: responses,
    },
    handler: async (req, reply) => {
      const actor = await actorOf(req.orgId, req.userId);
      const url = await member.thumbnailFile(req.orgId, actor, 'community', req.params.communityId);
      return redirect(reply, url, 'Community thumbnail', req.params.communityId);
    },
  });

  r.route({
    method: 'GET',
    url: '/api/member/activities/:activityId/assets/:assetId',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'getActivityFile',
      tags,
      summary: 'Redirect to a file used in a lesson',
      description:
        'Served when the student can open the course, the course and the lesson are published, and the lesson lists the file. Staff may fetch any file a lesson lists. Use the URL as an img, video or audio src.',
      params: ActivityFileParams,
      response: responses,
    },
    handler: async (req, reply) => {
      const actor = await actorOf(req.orgId, req.userId);
      const url = await member.activityFile(
        req.orgId,
        actor,
        req.params.activityId,
        req.params.assetId,
      );
      return redirect(reply, url, 'Lesson file', req.params.assetId);
    },
  });

  r.route({
    method: 'GET',
    url: '/api/member/downloads/:downloadId/assets/:assetId',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'getDownloadFile',
      tags,
      summary: 'Redirect to a file in a download, saved under its display name',
      description:
        'Served when the student can open the download, it is published, and it lists the file. Staff may fetch any file a download lists. The storage link lives DELIVERY_URL_EXPIRY seconds.',
      params: DownloadFileParams,
      response: responses,
    },
    handler: async (req, reply) => {
      const actor = await actorOf(req.orgId, req.userId);
      const url = await member.downloadFile(
        req.orgId,
        actor,
        req.params.downloadId,
        req.params.assetId,
      );
      return redirect(reply, url, 'Download file', req.params.assetId);
    },
  });

  r.route({
    method: 'GET',
    url: '/api/member/posts/:postId/cover',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'getPostCover',
      tags,
      summary: "Redirect to a post's cover image",
      description: 'Served to whoever can read the post. 404 when the post has no cover.',
      params: PostCoverParams,
      response: responses,
    },
    handler: async (req, reply) => {
      const actor = await actorOf(req.orgId, req.userId);
      const url = await container.posts.coverFile(req.orgId, actor, req.params.postId);
      return redirect(reply, url, 'Post cover', req.params.postId);
    },
  });

  r.route({
    method: 'GET',
    url: '/api/member/chats/:chatId/messages/:messageId/attachments/:assetId',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'getMessageAttachment',
      tags,
      summary: 'Redirect to an image attached to a chat message',
      description:
        "Served to the chat's participants while the message stands (staff also after it is deleted), and to moderators while the message is flagged.",
      params: MessageAttachmentParams,
      response: responses,
    },
    handler: async (req, reply) => {
      const actor = await actorOf(req.orgId, req.userId);
      const url = await container.chats.attachmentFile(
        req.orgId,
        actor,
        req.params.chatId,
        req.params.messageId,
        req.params.assetId,
      );
      return redirect(reply, url, 'Message attachment', req.params.assetId);
    },
  });

  r.route({
    method: 'GET',
    url: '/api/member/people/:orgUserId/image',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'getPersonImage',
      tags,
      summary: "Redirect to an org user's profile photo",
      description:
        'Served to org users of the same organization when the photo belongs to it. 404 when the person has no photo here.',
      params: PersonImageParams,
      response: responses,
    },
    handler: async (req, reply) => {
      await actorOf(req.orgId, req.userId);
      const url = await member.personImage(req.orgId, req.params.orgUserId);
      return redirect(reply, url, 'Profile photo', req.params.orgUserId);
    },
  });

  r.route({
    method: 'GET',
    url: '/api/member/uploads/:id/file',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'getMemberUploadFile',
      tags,
      summary: 'Redirect to an image you uploaded',
      description: 'Served only to the person who uploaded it, once it is finalized.',
      params: UploadFileParams,
      response: responses,
    },
    handler: async (req, reply) => {
      const actor = await actorOf(req.orgId, req.userId);
      const url = await container.assets.ownUploadFile(req.orgId, req.params.id, actor.id);
      return redirect(reply, url, 'Upload', req.params.id);
    },
  });
}
