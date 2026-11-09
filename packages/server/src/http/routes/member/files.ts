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
  EventFileParams,
  EventThumbnailParams,
  MessageAttachmentParams,
  PostCoverParams,
  PostAssetParams,
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
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'getCourseThumbnail',
      tags,
      summary: "Redirect to a course's thumbnail",
      description:
        'For an unpublished course, which only a holder of `courses:read` on it may fetch: a published course carries a public `thumbnailUrl` instead. 404 when the course has no thumbnail.',
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
    url: '/api/member/events/:eventId/thumbnail',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'getEventThumbnail',
      tags,
      summary: "Redirect to an event's cover",
      description:
        'For a draft event, which only a holder of `events:read` on it may fetch: a published or canceled event carries a public `thumbnailUrl` instead. 404 when the event read returns 404 or the event has no cover.',
      params: EventThumbnailParams,
      response: responses,
    },
    handler: async (req, reply) => {
      const actor = await resolveActor(container, req);
      const url = await member.thumbnailFile('event', req.params.eventId, actor);
      return redirect(reply, url);
    },
  });

  r.route({
    method: 'GET',
    url: '/api/member/events/:eventId/assets/:assetId',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'getEventFile',
      tags,
      summary: 'Redirect to a file attached to an event',
      description:
        'For a holder of `events:read` on the event or the org, or an attendee of the published or canceled event. Saved under its display name. 404 otherwise, or when the file is not attached to the event.',
      params: EventFileParams,
      response: responses,
    },
    handler: async (req, reply) => {
      const actor = await resolveActor(container, req);
      const url = await member.eventFile(req.params.eventId, req.params.assetId, actor);
      return redirect(reply, url);
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
        'For an unpublished download, which only a holder of `downloads:read` on it may fetch: a published download carries a public `thumbnailUrl` instead. 404 when the download has no thumbnail.',
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
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'getCommunityThumbnail',
      tags,
      summary: "Redirect to a community's thumbnail",
      description:
        'For an unpublished community, which only a holder of `communities:read` on it may fetch: a published community carries a public `thumbnailUrl` instead. 404 when the community has no thumbnail.',
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
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'getPostCover',
      tags,
      summary: "Redirect to a post's cover image",
      description:
        'For a post that is not published, served to whoever can read it: a published post carries a public `coverUrl` instead. 404 when the post has no cover.',
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
    url: '/api/member/posts/:postId/assets/:assetId',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'getPostAsset',
      tags,
      summary: "Redirect to a file in a post's body",
      description:
        'Served to whoever can read the post while its body shows the file. Images, video, audio and PDFs open in place; any other file downloads under its name.',
      params: PostAssetParams,
      response: responses,
    },
    handler: async (req, reply) => {
      const actor = await resolveActor(container, req);
      const url = await container.posts.assetFile(req.params.postId, req.params.assetId, actor);
      return redirect(reply, url);
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
      const actor = await resolveActor(container, req);
      const url = await container.assets.ownUploadFile(req.params.id, actor);
      return redirect(reply, url);
    },
  });
}
