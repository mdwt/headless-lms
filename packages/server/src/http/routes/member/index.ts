// Student HTTP API under `/api/member`. Session-guarded like every
// back-office route, but scoped by the session's `org_users` row —
// the reads gate on the person's enrollments, not on staff role. One file per
// resource; everything under `/api/member` lives in this directory and nowhere
// else. The course, download, and progress reads call reporting/member.
import type { FastifyInstance } from 'fastify';
import type { Container } from '../../../app/container.js';
import { memberAssetsRoutes } from './assets.js';
import { memberChatRoutes } from './chats.js';
import { memberCommentsRoutes } from './comments.js';
import { memberCommunityRoutes } from './community.js';
import { memberCoursesRoutes } from './courses.js';
import { memberDownloadsRoutes } from './downloads.js';
import { memberOrgRoutes } from './org.js';
import { memberPostRoutes } from './posts.js';
import { memberProfileRoutes } from './profile.js';
import { memberProgressRoutes } from './progress.js';

export async function memberRoutes(app: FastifyInstance, container: Container): Promise<void> {
  await memberOrgRoutes(app, container);
  await memberProfileRoutes(app, container);
  await memberCommunityRoutes(app, container);
  await memberPostRoutes(app, container);
  await memberChatRoutes(app, container);
  await memberCoursesRoutes(app, container);
  await memberProgressRoutes(app, container);
  await memberCommentsRoutes(app, container);
  await memberAssetsRoutes(app, container);
  await memberDownloadsRoutes(app, container);
}
