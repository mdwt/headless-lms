// Member file proxies. Each route asks the context that owns the file, then
// redirects to a short-lived signed storage URL. Every refusal is a 404, so a
// response never confirms that a file exists. A 403 only means the caller is
// not an active member of the organization.
import type { FastifyInstance, FastifyReply } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
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
import { resolveActor } from '../../scope.js';
import type { Container } from '../../../app/container.js';

const tags = ['Files'];
const responses = { 302: z.void(), ...refusals(403, 404) };

function redirect(reply: FastifyReply, url: string) {
  return reply
    .header('cache-control', 'no-store')
    .header('referrer-policy', 'no-referrer')
    .redirect(url, 302);
}

export async function memberFileRoutes(app: FastifyInstance, container: Container): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const member = container.reporting.member;

  r.route({
    method: 'GET',
    url: '/api/member/courses/:courseId/thumbnail',
    config: { operation: 'reporting.member.thumbnailFile' },
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'getCourseThumbnail',
      tags,
      summary: "Redirect to a course's thumbnail",
      description:
        'Any org user may fetch the thumbnail of a published course; a holder of `courses:read` on it may fetch it unpublished. 404 when the course has no thumbnail.',
      params: CourseThumbnailParams,
      response: responses,
    },
    handler: async (req, reply) => {
      const actor = await resolveActor(container, req);
      const url = await member.thumbnailFile('course', req.params.courseId, actor);
      return redirect(reply, url);
    },
  });

  r.route({
    method: 'GET',
    url: '/api/member/downloads/:downloadId/thumbnail',
    config: { operation: 'reporting.member.thumbnailFile' },
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'getDownloadThumbnail',
      tags,
      summary: "Redirect to a download's thumbnail",
      description:
        'Any org user may fetch the thumbnail of a published download; a holder of `downloads:read` on it may fetch it unpublished. 404 when the download has no thumbnail.',
      params: DownloadThumbnailParams,
      response: responses,
    },
    handler: async (req, reply) => {
      const actor = await resolveActor(container, req);
      const url = await member.thumbnailFile('download', req.params.downloadId, actor);
      return redirect(reply, url);
    },
  });

  r.route({
    method: 'GET',
    url: '/api/member/communities/:communityId/thumbnail',
    config: { operation: 'reporting.member.thumbnailFile' },
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'getCommunityThumbnail',
      tags,
      summary: "Redirect to a community's thumbnail",
      description:
        'Any org user may fetch the thumbnail of a published community; a holder of `communities:read` on it may fetch it unpublished. 404 when the community has no thumbnail.',
      params: CommunityThumbnailParams,
      response: responses,
    },
    handler: async (req, reply) => {
      const actor = await resolveActor(container, req);
      const url = await member.thumbnailFile('community', req.params.communityId, actor);
      return redirect(reply, url);
    },
  });

  r.route({
    method: 'GET',
    url: '/api/member/activities/:activityId/assets/:assetId',
    config: { operation: 'reporting.member.activityFile' },
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'getActivityFile',
      tags,
      summary: 'Redirect to a file used in a lesson',
      description:
        'Served when the person can open the course, the course and the lesson are published, and the lesson lists the file. A holder of `courses:read` on the course may fetch any file a lesson lists. Use the URL as an img, video or audio src.',
      params: ActivityFileParams,
      response: responses,
    },
    handler: async (req, reply) => {
      const actor = await resolveActor(container, req);
      const url = await member.activityFile(req.params.activityId, req.params.assetId, actor);
      return redirect(reply, url);
    },
  });

  r.route({
    method: 'GET',
    url: '/api/member/downloads/:downloadId/assets/:assetId',
    config: { operation: 'reporting.member.downloadFile' },
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'getDownloadFile',
      tags,
      summary: 'Redirect to a file in a download, saved under its display name',
      description:
        'Served when the person can open the download, it is published, and it lists the file. A holder of `downloads:read` on the download may fetch it unpublished. The storage link lives DELIVERY_URL_EXPIRY seconds.',
      params: DownloadFileParams,
      response: responses,
    },
    handler: async (req, reply) => {
      const actor = await resolveActor(container, req);
      const url = await member.downloadFile(req.params.downloadId, req.params.assetId, actor);
      return redirect(reply, url);
    },
  });

  r.route({
    method: 'GET',
    url: '/api/member/posts/:postId/cover',
    config: { operation: 'posts.coverFile' },
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
      const actor = await resolveActor(container, req);
      const url = await container.posts.coverFile(req.params.postId, actor);
      return redirect(reply, url);
    },
  });

  r.route({
    method: 'GET',
    url: '/api/member/chats/:chatId/messages/:messageId/attachments/:assetId',
    config: { operation: 'chats.attachmentFile' },
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'getMessageAttachment',
      tags,
      summary: 'Redirect to an image attached to a chat message',
      description:
        "Served to the chat's participants while the message stands, to holders of `communities:moderate` on the community also after it is deleted, and to them while the message is flagged.",
      params: MessageAttachmentParams,
      response: responses,
    },
    handler: async (req, reply) => {
      const actor = await resolveActor(container, req);
      const url = await container.chats.attachmentFile(
        req.params.chatId,
        req.params.messageId,
        req.params.assetId,
        actor,
      );
      return redirect(reply, url);
    },
  });

  r.route({
    method: 'GET',
    url: '/api/member/people/:orgUserId/image',
    config: { operation: 'reporting.member.personImage' },
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
      const actor = await resolveActor(container, req);
      const url = await member.personImage(req.params.orgUserId, actor);
      return redirect(reply, url);
    },
  });

  r.route({
    method: 'GET',
    url: '/api/member/uploads/:id/file',
    config: { operation: 'assets.ownUploadFile' },
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
      const actor = await resolveActor(container, req);
      const url = await container.assets.ownUploadFile(req.params.id, actor);
      return redirect(reply, url);
    },
  });
}
