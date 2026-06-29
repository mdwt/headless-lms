// HTTP routes for course modules + items. Write operations return the course's
// full, reordered module list (how the editor re-renders). Nested under courses.
// All require a session with an active organization; handlers resolve the
// session's active org to the domain org id and scope every call by it.
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import {
  CourseIdPathParam,
  CreateModule,
  ItemPathParam,
  ModuleList,
  ModulePathParam,
  ReorderInput,
  SaveItem,
  UpdateModule,
} from "@headless-lms/api-contract";
import type { Container } from "../../composition/container.js";
import { resolveScope } from "../scope.js";

export async function modulesRoutes(app: FastifyInstance, container: Container): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const modules = container.modules;
  const tags = ["Modules"];

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
      return modules.listForCourse(scope.orgId, req.params.courseId);
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
      return modules.createModule(scope.orgId, req.params.courseId, req.body.title);
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
      return modules.reorderModules(scope.orgId, req.params.courseId, req.body.orderedIds);
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
      return modules.updateModule(
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
      return modules.deleteModule(scope.orgId, req.params.courseId, req.params.moduleId);
    },
  });

  r.route({
    method: "POST",
    url: "/api/courses/:courseId/modules/:moduleId/items/reorder",
    preHandler: app.requireSession,
    schema: {
      operationId: "reorderItems",
      tags,
      summary: "Reorder items in a module",
      params: ModulePathParam,
      body: ReorderInput,
      response: { 200: ModuleList },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      return modules.reorderItems(
        scope.orgId,
        req.params.courseId,
        req.params.moduleId,
        req.body.orderedIds,
      );
    },
  });

  r.route({
    method: "POST",
    url: "/api/courses/:courseId/modules/:moduleId/items",
    preHandler: app.requireSession,
    schema: {
      operationId: "createItem",
      tags,
      summary: "Add a lesson or assessment",
      params: ModulePathParam,
      body: SaveItem,
      response: { 200: ModuleList },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      return modules.saveItem(scope.orgId, req.params.courseId, req.params.moduleId, req.body);
    },
  });

  r.route({
    method: "PATCH",
    url: "/api/courses/:courseId/modules/:moduleId/items/:itemId",
    preHandler: app.requireSession,
    schema: {
      operationId: "updateItem",
      tags,
      summary: "Update a lesson or assessment",
      params: ItemPathParam,
      body: SaveItem,
      response: { 200: ModuleList },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      return modules.saveItem(
        scope.orgId,
        req.params.courseId,
        req.params.moduleId,
        req.body,
        req.params.itemId,
      );
    },
  });

  r.route({
    method: "DELETE",
    url: "/api/courses/:courseId/modules/:moduleId/items/:itemId",
    preHandler: app.requireSession,
    schema: {
      operationId: "deleteItem",
      tags,
      summary: "Delete a lesson or assessment",
      params: ItemPathParam,
      response: { 200: ModuleList },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      return modules.deleteItem(
        scope.orgId,
        req.params.courseId,
        req.params.moduleId,
        req.params.itemId,
      );
    },
  });
}
