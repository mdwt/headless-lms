// HTTP routes for course modules + activities. Write operations return the
// course's full, reordered module list (how the editor re-renders). Nested under
// courses. All require a session with an active organization.
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  ActivityAssetList,
  ActivityList,
  ActivityPathParam,
  CourseIdPathParam,
  CreateModule,
  ModuleList,
  ModulePathParam,
  ReorderInput,
  SaveActivity,
  UpdateModule,
  refusals,
} from '../schemas/index.js';
import type { Container } from '../../app/container.js';
import { resolveActor } from '../scope.js';
import { describeOperation } from '../operations.js';

export async function activitiesRoutes(app: FastifyInstance, container: Container): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  // Modules/activities are part of the content aggregate; grouped under the Courses tag.
  const content = container.content;
  const tags = ['Content'];

  r.route({
    method: 'GET',
    url: '/api/courses/:courseId/modules',
    config: { operation: 'content.listCourseModules' },
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'listModules',
      tags,
      summary: "List a course's modules",
      description: `${describeOperation('content.listCourseModules')} Modules in order, each with its activities.`,
      params: CourseIdPathParam,
      response: { 200: ModuleList, ...refusals(403) },
    },
    handler: async (req) => {
      const actor = await resolveActor(container, req);
      return content.listCourseModules(req.params.courseId, actor);
    },
  });

  r.route({
    method: 'GET',
    url: '/api/courses/:courseId/activities',
    config: { operation: 'content.listCourseActivityViews' },
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'listActivities',
      tags,
      summary: "List a course's activities",
      description: `${describeOperation('content.listCourseActivityViews')} Every activity, published or not.`,
      params: CourseIdPathParam,
      response: { 200: ActivityList, ...refusals(403) },
    },
    handler: async (req) => {
      const actor = await resolveActor(container, req);
      return content.listCourseActivityViews(req.params.courseId, actor);
    },
  });

  r.route({
    method: 'GET',
    url: '/api/courses/:courseId/activity-assets',
    config: { operation: 'content.listCourseActivityAssets' },
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'listActivityAssets',
      tags,
      summary: 'List the library files each activity of a course uses',
      description: `${describeOperation('content.listCourseActivityAssets')} One row per activity and file, as recorded when the activity was saved.`,
      params: CourseIdPathParam,
      response: { 200: ActivityAssetList, ...refusals(403) },
    },
    handler: async (req) => {
      const actor = await resolveActor(container, req);
      return content.listCourseActivityAssets(req.params.courseId, actor);
    },
  });

  r.route({
    method: 'POST',
    url: '/api/courses/:courseId/modules',
    config: { operation: 'content.createModule' },
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'createModule',
      tags,
      summary: 'Add a module',
      description: `${describeOperation('content.createModule')} Added last. Returns the course's modules.`,
      params: CourseIdPathParam,
      body: CreateModule,
      response: { 200: ModuleList, ...refusals(403) },
    },
    handler: async (req) => {
      const actor = await resolveActor(container, req);
      return content.createModule(req.params.courseId, req.body.title, actor);
    },
  });

  r.route({
    method: 'POST',
    url: '/api/courses/:courseId/modules/reorder',
    config: { operation: 'content.reorderModules' },
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'reorderModules',
      tags,
      summary: "Reorder a course's modules",
      description: `${describeOperation('content.reorderModules')} Ids that are not modules of the course are ignored. Returns the course's modules.`,
      params: CourseIdPathParam,
      body: ReorderInput,
      response: { 200: ModuleList, ...refusals(403) },
    },
    handler: async (req) => {
      const actor = await resolveActor(container, req);
      return content.reorderModules(req.params.courseId, req.body.orderedIds, actor);
    },
  });

  r.route({
    method: 'PATCH',
    url: '/api/courses/:courseId/modules/:moduleId',
    config: { operation: 'content.updateModule' },
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'updateModule',
      tags,
      summary: 'Rename a module',
      description: `${describeOperation('content.updateModule')} Returns the course's modules.`,
      params: ModulePathParam,
      body: UpdateModule,
      response: { 200: ModuleList, ...refusals(403, 404) },
    },
    handler: async (req) => {
      const actor = await resolveActor(container, req);
      return content.updateModule(req.params.courseId, req.params.moduleId, req.body.title, actor);
    },
  });

  r.route({
    method: 'DELETE',
    url: '/api/courses/:courseId/modules/:moduleId',
    config: { operation: 'content.deleteModule' },
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'deleteModule',
      tags,
      summary: 'Delete a module',
      description: `${describeOperation('content.deleteModule')} Returns the course's modules.`,
      params: ModulePathParam,
      response: { 200: ModuleList, ...refusals(403, 404) },
    },
    handler: async (req) => {
      const actor = await resolveActor(container, req);
      return content.deleteModule(req.params.courseId, req.params.moduleId, actor);
    },
  });

  r.route({
    method: 'POST',
    url: '/api/courses/:courseId/modules/:moduleId/activities/reorder',
    config: { operation: 'content.reorderActivities' },
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'reorderActivities',
      tags,
      summary: 'Reorder the activities in a module',
      description: `${describeOperation('content.reorderActivities')} Send every activity id of the module once (409 otherwise). Returns the course's modules.`,
      params: ModulePathParam,
      body: ReorderInput,
      response: { 200: ModuleList, ...refusals(403, 404, 409) },
    },
    handler: async (req) => {
      const actor = await resolveActor(container, req);
      return content.reorderActivities(
        req.params.courseId,
        req.params.moduleId,
        req.body.orderedIds,
        actor,
      );
    },
  });

  r.route({
    method: 'POST',
    url: '/api/courses/:courseId/modules/:moduleId/activities',
    config: { operation: 'content.saveActivity' },
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'createActivity',
      tags,
      summary: 'Add an activity',
      description: `${describeOperation('content.saveActivity')} Records the library files the activity uses; each must be a ready library file (409 otherwise). A file the course does not already use must be uploaded for the course, or the caller needs \`media:read\` (403 otherwise). Returns the course's modules.`,
      params: ModulePathParam,
      body: SaveActivity,
      response: { 200: ModuleList, ...refusals(403, 404, 409) },
    },
    handler: async (req) => {
      const actor = await resolveActor(container, req);
      return content.saveActivity(req.params.courseId, req.params.moduleId, req.body, null, actor);
    },
  });

  r.route({
    method: 'PATCH',
    url: '/api/courses/:courseId/modules/:moduleId/activities/:activityId',
    config: { operation: 'content.saveActivity' },
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'updateActivity',
      tags,
      summary: 'Update an activity',
      description: `${describeOperation('content.saveActivity')} Replaces its content and records the library files it uses; each must be a ready library file (409 otherwise). A file the course does not already use must be uploaded for the course, or the caller needs \`media:read\` (403 otherwise). Returns the course's modules.`,
      params: ActivityPathParam,
      body: SaveActivity,
      response: { 200: ModuleList, ...refusals(403, 404, 409) },
    },
    handler: async (req) => {
      const actor = await resolveActor(container, req);
      return content.saveActivity(
        req.params.courseId,
        req.params.moduleId,
        req.body,
        req.params.activityId,
        actor,
      );
    },
  });

  r.route({
    method: 'DELETE',
    url: '/api/courses/:courseId/modules/:moduleId/activities/:activityId',
    config: { operation: 'content.deleteActivity' },
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'deleteActivity',
      tags,
      summary: 'Delete an activity',
      description: `${describeOperation('content.deleteActivity')} Returns the course's modules.`,
      params: ActivityPathParam,
      response: { 200: ModuleList, ...refusals(403, 404) },
    },
    handler: async (req) => {
      const actor = await resolveActor(container, req);
      return content.deleteActivity(
        req.params.courseId,
        req.params.moduleId,
        req.params.activityId,
        actor,
      );
    },
  });
}
