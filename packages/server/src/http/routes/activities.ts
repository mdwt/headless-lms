// HTTP routes for course modules + activities. Write operations return the
// course's full, reordered module list (how the editor re-renders). Nested under
// courses. All require a session with an active organization; handlers resolve
// the session's active org to the domain org id and scope every call by it.
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
import { resolveScope } from '../scope.js';

export async function activitiesRoutes(app: FastifyInstance, container: Container): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  // Modules/activities are part of the content aggregate; grouped under the Courses tag.
  const content = container.content;
  const tags = ['Content'];

  r.route({
    method: 'GET',
    url: '/api/courses/:courseId/modules',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'listModules',
      tags,
      summary: "List a course's modules (staff)",
      description:
        'Staff only (owner, admin, instructor). Modules in order, each with its activities.',
      params: CourseIdPathParam,
      response: { 200: ModuleList, ...refusals(403) },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      return content.listCourseModules(scope.orgId, req.params.courseId);
    },
  });

  r.route({
    method: 'GET',
    url: '/api/courses/:courseId/activities',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'listActivities',
      tags,
      summary: "List a course's activities (staff)",
      description: 'Staff only (owner, admin, instructor). Every activity, published or not.',
      params: CourseIdPathParam,
      response: { 200: ActivityList, ...refusals(403) },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      return content.listCourseActivityViews(scope.orgId, req.params.courseId);
    },
  });

  r.route({
    method: 'GET',
    url: '/api/courses/:courseId/activity-assets',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'listActivityAssets',
      tags,
      summary: 'List the library files each activity of a course uses (staff)',
      description:
        'Staff only (owner, admin, instructor). One row per activity and file, as recorded when the activity was saved.',
      params: CourseIdPathParam,
      response: { 200: ActivityAssetList, ...refusals(403) },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      return content.listCourseActivityAssets(scope.orgId, req.params.courseId);
    },
  });

  r.route({
    method: 'POST',
    url: '/api/courses/:courseId/modules',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'createModule',
      tags,
      summary: 'Add a module (staff)',
      description:
        "Staff only (owner, admin, instructor). Added last. Returns the course's modules.",
      params: CourseIdPathParam,
      body: CreateModule,
      response: { 200: ModuleList, ...refusals(403) },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      return content.createModule(scope.orgId, req.params.courseId, req.body.title);
    },
  });

  r.route({
    method: 'POST',
    url: '/api/courses/:courseId/modules/reorder',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'reorderModules',
      tags,
      summary: "Reorder a course's modules (staff)",
      description:
        "Staff only (owner, admin, instructor). Ids that are not modules of the course are ignored. Returns the course's modules.",
      params: CourseIdPathParam,
      body: ReorderInput,
      response: { 200: ModuleList, ...refusals(403) },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      return content.reorderModules(scope.orgId, req.params.courseId, req.body.orderedIds);
    },
  });

  r.route({
    method: 'PATCH',
    url: '/api/courses/:courseId/modules/:moduleId',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'updateModule',
      tags,
      summary: 'Rename a module (staff)',
      description: "Staff only (owner, admin, instructor). Returns the course's modules.",
      params: ModulePathParam,
      body: UpdateModule,
      response: { 200: ModuleList, ...refusals(403, 404) },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      return content.updateModule(
        scope.orgId,
        req.params.courseId,
        req.params.moduleId,
        req.body.title,
      );
    },
  });

  r.route({
    method: 'DELETE',
    url: '/api/courses/:courseId/modules/:moduleId',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'deleteModule',
      tags,
      summary: 'Delete a module (staff)',
      description: "Staff only (owner, admin, instructor). Returns the course's modules.",
      params: ModulePathParam,
      response: { 200: ModuleList, ...refusals(403, 404) },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      return content.deleteModule(scope.orgId, req.params.courseId, req.params.moduleId);
    },
  });

  r.route({
    method: 'POST',
    url: '/api/courses/:courseId/modules/:moduleId/activities/reorder',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'reorderActivities',
      tags,
      summary: 'Reorder the activities in a module (staff)',
      description:
        "Staff only (owner, admin, instructor). Send every activity id of the module once (409 otherwise). Returns the course's modules.",
      params: ModulePathParam,
      body: ReorderInput,
      response: { 200: ModuleList, ...refusals(403, 404, 409) },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      return content.reorderActivities(
        scope.orgId,
        req.params.courseId,
        req.params.moduleId,
        req.body.orderedIds,
      );
    },
  });

  r.route({
    method: 'POST',
    url: '/api/courses/:courseId/modules/:moduleId/activities',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'createActivity',
      tags,
      summary: 'Add an activity (staff)',
      description:
        "Staff only (owner, admin, instructor). Records the library files the activity uses; each must be a ready library file (409 otherwise). Returns the course's modules.",
      params: ModulePathParam,
      body: SaveActivity,
      response: { 200: ModuleList, ...refusals(403, 404, 409) },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      return content.saveActivity(scope.orgId, req.params.courseId, req.params.moduleId, req.body);
    },
  });

  r.route({
    method: 'PATCH',
    url: '/api/courses/:courseId/modules/:moduleId/activities/:activityId',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'updateActivity',
      tags,
      summary: 'Update an activity (staff)',
      description:
        "Staff only (owner, admin, instructor). Replaces its content and records the library files it uses; each must be a ready library file (409 otherwise). Returns the course's modules.",
      params: ActivityPathParam,
      body: SaveActivity,
      response: { 200: ModuleList, ...refusals(403, 404, 409) },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      return content.saveActivity(
        scope.orgId,
        req.params.courseId,
        req.params.moduleId,
        req.body,
        req.params.activityId,
      );
    },
  });

  r.route({
    method: 'DELETE',
    url: '/api/courses/:courseId/modules/:moduleId/activities/:activityId',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'deleteActivity',
      tags,
      summary: 'Delete an activity (staff)',
      description: "Staff only (owner, admin, instructor). Returns the course's modules.",
      params: ActivityPathParam,
      response: { 200: ModuleList, ...refusals(403, 404) },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      return content.deleteActivity(
        scope.orgId,
        req.params.courseId,
        req.params.moduleId,
        req.params.activityId,
      );
    },
  });
}
