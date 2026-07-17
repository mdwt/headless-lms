// HTTP routes for course modules + activities. Write operations return the
// course's full, reordered module list (how the editor re-renders). Nested under
// courses. All require a session with an active organization; handlers resolve
// the session's active org to the domain org id and scope every call by it.
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import {
  ActivityPathParam,
  CourseIdPathParam,
  CreateModule,
  ModuleList,
  ModulePathParam,
  ReorderInput,
  SaveActivity,
  UpdateModule,
} from "@headless-lms/api-contract";
import type { Container } from "../../composition/container.js";
import { resolveScope } from "../scope.js";

export async function activitiesRoutes(app: FastifyInstance, container: Container): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  // Modules/activities are part of the content aggregate; grouped under the Courses tag.
  const content = container.content;
  const tags = ["Courses"];

  r.route({
    method: "GET",
    url: "/api/courses/:courseId/modules",
    preHandler: app.requireSession,
    schema: {
      operationId: "listModules",
      tags,
      summary: "List a course's modules",
      params: CourseIdPathParam,
      response: { 200: ModuleList },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      return content.listForCourse(scope.orgId, req.params.courseId);
    },
  });

  r.route({
    method: "POST",
    url: "/api/courses/:courseId/modules",
    preHandler: app.requireSession,
    schema: {
      operationId: "createModule",
      tags,
      summary: "Add a module",
      params: CourseIdPathParam,
      body: CreateModule,
      response: { 200: ModuleList },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      return content.createModule(scope.orgId, req.params.courseId, req.body.title);
    },
  });

  r.route({
    method: "POST",
    url: "/api/courses/:courseId/modules/reorder",
    preHandler: app.requireSession,
    schema: {
      operationId: "reorderModules",
      tags,
      summary: "Reorder modules",
      params: CourseIdPathParam,
      body: ReorderInput,
      response: { 200: ModuleList },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      return content.reorderModules(scope.orgId, req.params.courseId, req.body.orderedIds);
    },
  });

  r.route({
    method: "PATCH",
    url: "/api/courses/:courseId/modules/:moduleId",
    preHandler: app.requireSession,
    schema: {
      operationId: "updateModule",
      tags,
      summary: "Rename a module",
      params: ModulePathParam,
      body: UpdateModule,
      response: { 200: ModuleList },
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
    method: "DELETE",
    url: "/api/courses/:courseId/modules/:moduleId",
    preHandler: app.requireSession,
    schema: {
      operationId: "deleteModule",
      tags,
      summary: "Delete a module",
      params: ModulePathParam,
      response: { 200: ModuleList },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      return content.deleteModule(scope.orgId, req.params.courseId, req.params.moduleId);
    },
  });

  r.route({
    method: "POST",
    url: "/api/courses/:courseId/modules/:moduleId/activities/reorder",
    preHandler: app.requireSession,
    schema: {
      operationId: "reorderActivities",
      tags,
      summary: "Reorder activities in a module",
      params: ModulePathParam,
      body: ReorderInput,
      response: { 200: ModuleList },
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
    method: "POST",
    url: "/api/courses/:courseId/modules/:moduleId/activities",
    preHandler: app.requireSession,
    schema: {
      operationId: "createActivity",
      tags,
      summary: "Add an activity",
      params: ModulePathParam,
      body: SaveActivity,
      response: { 200: ModuleList },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      return content.saveActivity(scope.orgId, req.params.courseId, req.params.moduleId, req.body);
    },
  });

  r.route({
    method: "PATCH",
    url: "/api/courses/:courseId/modules/:moduleId/activities/:activityId",
    preHandler: app.requireSession,
    schema: {
      operationId: "updateActivity",
      tags,
      summary: "Update an activity",
      params: ActivityPathParam,
      body: SaveActivity,
      response: { 200: ModuleList },
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
    method: "DELETE",
    url: "/api/courses/:courseId/modules/:moduleId/activities/:activityId",
    preHandler: app.requireSession,
    schema: {
      operationId: "deleteActivity",
      tags,
      summary: "Delete an activity",
      params: ActivityPathParam,
      response: { 200: ModuleList },
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
