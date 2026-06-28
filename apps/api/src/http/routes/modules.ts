// HTTP routes for course modules + items. Write operations return the course's
// full, reordered module list (how the editor re-renders). Nested under courses.
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

export async function modulesRoutes(app: FastifyInstance, container: Container): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const modules = container.modules;
  const tags = ["Modules"];

  r.route({
    method: "GET",
    url: "/api/courses/:courseId/modules",
    schema: {
      operationId: "listModules",
      tags,
      summary: "List a course's modules",
      params: CourseIdPathParam,
      response: { 200: ModuleList },
    },
    handler: (req) => modules.listForCourse(req.params.courseId),
  });

  r.route({
    method: "POST",
    url: "/api/courses/:courseId/modules",
    schema: {
      operationId: "createModule",
      tags,
      summary: "Add a module",
      params: CourseIdPathParam,
      body: CreateModule,
      response: { 200: ModuleList },
    },
    handler: (req) => modules.createModule(req.params.courseId, req.body.title),
  });

  r.route({
    method: "POST",
    url: "/api/courses/:courseId/modules/reorder",
    schema: {
      operationId: "reorderModules",
      tags,
      summary: "Reorder modules",
      params: CourseIdPathParam,
      body: ReorderInput,
      response: { 200: ModuleList },
    },
    handler: (req) => modules.reorderModules(req.params.courseId, req.body.orderedIds),
  });

  r.route({
    method: "PATCH",
    url: "/api/courses/:courseId/modules/:moduleId",
    schema: {
      operationId: "updateModule",
      tags,
      summary: "Rename a module",
      params: ModulePathParam,
      body: UpdateModule,
      response: { 200: ModuleList },
    },
    handler: (req) => modules.updateModule(req.params.courseId, req.params.moduleId, req.body.title),
  });

  r.route({
    method: "DELETE",
    url: "/api/courses/:courseId/modules/:moduleId",
    schema: {
      operationId: "deleteModule",
      tags,
      summary: "Delete a module",
      params: ModulePathParam,
      response: { 200: ModuleList },
    },
    handler: (req) => modules.deleteModule(req.params.courseId, req.params.moduleId),
  });

  r.route({
    method: "POST",
    url: "/api/courses/:courseId/modules/:moduleId/items/reorder",
    schema: {
      operationId: "reorderItems",
      tags,
      summary: "Reorder items in a module",
      params: ModulePathParam,
      body: ReorderInput,
      response: { 200: ModuleList },
    },
    handler: (req) =>
      modules.reorderItems(req.params.courseId, req.params.moduleId, req.body.orderedIds),
  });

  r.route({
    method: "POST",
    url: "/api/courses/:courseId/modules/:moduleId/items",
    schema: {
      operationId: "createItem",
      tags,
      summary: "Add a lesson or assessment",
      params: ModulePathParam,
      body: SaveItem,
      response: { 200: ModuleList },
    },
    handler: (req) => modules.saveItem(req.params.courseId, req.params.moduleId, req.body),
  });

  r.route({
    method: "PATCH",
    url: "/api/courses/:courseId/modules/:moduleId/items/:itemId",
    schema: {
      operationId: "updateItem",
      tags,
      summary: "Update a lesson or assessment",
      params: ItemPathParam,
      body: SaveItem,
      response: { 200: ModuleList },
    },
    handler: (req) =>
      modules.saveItem(req.params.courseId, req.params.moduleId, req.body, req.params.itemId),
  });

  r.route({
    method: "DELETE",
    url: "/api/courses/:courseId/modules/:moduleId/items/:itemId",
    schema: {
      operationId: "deleteItem",
      tags,
      summary: "Delete a lesson or assessment",
      params: ItemPathParam,
      response: { 200: ModuleList },
    },
    handler: (req) =>
      modules.deleteItem(req.params.courseId, req.params.moduleId, req.params.itemId),
  });
}
