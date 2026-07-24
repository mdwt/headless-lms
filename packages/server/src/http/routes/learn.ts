// HTTP routes for the student-facing Learn surface (read-only; served by the
// reporting layer). Session-guarded like every back-office route, but scoped by
// the student's enrollments via `resolveStudentScope` — never by org.
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  ProgressStatus,
  AssetIdParam,
  Course,
  CourseProgress,
  DownloadTicket,
  ErrorBody,
    LearnCourseIdParam,
  LearnCourses,
  LearnModules,
  LearnOrg,
  ReportProgress,
  RequestDownload,
} from '@headless-lms/api-contract';
import { NotFoundError } from '../../core/shared/errors.js';
import type { Container } from '../../app/container.js';
import { resolveStudentScope } from '../student-scope.js';

export async function learnRoutes(app: FastifyInstance, container: Container): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const learn = container.reporting.learn;

  r.route({
    method: 'GET',
    url: '/api/learn/courses',
    preHandler: app.requireSession,
    schema: {
      operationId: 'listLearnCourses',
      tags: ['Learn'],
      summary: "List the student's enrolled courses",
      response: { 200: LearnCourses },
    },
    handler: async (req) => {
      const scope = await resolveStudentScope(container, req);
      return learn.listCourses(scope.orgId, scope.studentId);
    },
  });

  r.route({
    method: 'GET',
    url: '/api/learn/org',
    preHandler: app.requireSession,
    schema: {
      operationId: 'getLearnOrg',
      tags: ['Learn'],
      summary: "Get the portal org's public identity (branding)",
      response: { 200: LearnOrg },
    },
    handler: async (req) => {
      // The session's student + org (from `activeOrganizationId`) — surface the
      // org's display identity for the portal brand.
      const { org } = await resolveStudentScope(container, req);
      return { id: org.id, name: org.name, slug: org.slug };
    },
  });

  r.route({
    method: 'GET',
    url: '/api/learn/courses/:courseId',
    preHandler: app.requireSession,
    schema: {
      operationId: 'getLearnCourse',
      tags: ['Learn'],
      summary: 'Get one enrolled course',
      params: LearnCourseIdParam,
      response: { 200: Course, 404: ErrorBody },
    },
    handler: async (req) => {
      const scope = await resolveStudentScope(container, req);
      const course = await learn.getCourse(scope.orgId, scope.studentId, req.params.courseId);
      if (!course) {
        throw new NotFoundError('Course', req.params.courseId);
      }
      return course;
    },
  });

  r.route({
    method: 'GET',
    url: '/api/learn/courses/:courseId/modules',
    preHandler: app.requireSession,
    schema: {
      operationId: 'listLearnModules',
      tags: ['Learn'],
      summary: "List an enrolled course's module/activity tree",
      params: LearnCourseIdParam,
      response: { 200: LearnModules, 404: ErrorBody },
    },
    handler: async (req) => {
      const scope = await resolveStudentScope(container, req);
      const modules = await learn.listModules(scope.orgId, scope.studentId, req.params.courseId);
      if (!modules) {
        throw new NotFoundError('Course', req.params.courseId);
      }
      return modules;
    },
  });

  // Content embeds assets by stable `assetId`; the URL persisted at authoring
  // time is a long-expired presign. The student surface mints a fresh
  // short-lived ticket here, scoped to the session's portal org.
  r.route({
    method: 'POST',
    url: '/api/learn/assets/:id/download-url',
    preHandler: app.requireSession,
    schema: {
      operationId: 'requestLearnAssetDownload',
      tags: ['Learn'],
      summary: 'Get a short-lived presigned URL to serve an asset to the student',
      params: AssetIdParam,
      body: RequestDownload,
      response: { 200: DownloadTicket, 401: ErrorBody, 404: ErrorBody },
    },
    handler: async (req) => {
      const scope = await resolveStudentScope(container, req);
      const ticket = await container.assets.requestDownload(
        scope.orgId,
        req.params.id,
        req.body.filename,
      );
      if (!ticket) {
        throw new NotFoundError('Asset', req.params.id);
      }
      return ticket;
    },
  });

  r.route({
    method: 'POST',
    url: '/api/learn/progress',
    preHandler: app.requireSession,
    schema: {
      operationId: 'reportProgress',
      tags: ['Learn'],
      summary: 'Report usage on a target; the progress service decides completion',
      body: ReportProgress,
      response: { 200: ProgressStatus, 404: ErrorBody },
    },
    handler: async (req) => {
      const scope = await resolveStudentScope(container, req);
      // Resolve the hierarchy (activity → module → course), then the same
      // enrollment gate as every Learn read.
      const activity = await container.content.getActivity(scope.orgId, req.body.activity);
      const module = activity && (await container.content.getModule(scope.orgId, activity.moduleId));
      if (!module) {
        throw new NotFoundError('Activity', req.body.activity);
      }
      const course = await learn.getCourse(scope.orgId, scope.studentId, module.courseId);
      if (!course) {
        throw new NotFoundError('Activity', req.body.activity);
      }
      const record = await container.progress.report(scope.orgId, {
        studentId: scope.studentId,
        activityId: req.body.activity,
        reports: req.body.reports,
      });
      return { status: record.completedAt ? ('completed' as const) : ('in-progress' as const) };
    },
  });

  r.route({
    method: 'GET',
    url: '/api/learn/courses/:courseId/progress',
    preHandler: app.requireSession,
    schema: {
      operationId: 'getLearnCourseProgress',
      tags: ['Learn'],
      summary: "The student's progress in one course",
      params: LearnCourseIdParam,
      response: { 200: CourseProgress, 404: ErrorBody },
    },
    handler: async (req) => {
      const scope = await resolveStudentScope(container, req);
      const view = await learn.courseProgress(scope.orgId, scope.studentId, req.params.courseId);
      if (!view) {
        throw new NotFoundError('Course', req.params.courseId);
      }
      return view;
    },
  });
}
