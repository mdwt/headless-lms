// modules context — ports. Write operations return the course's full module
// list (matching how the editor re-renders after each change). Every method is
// org-scoped: the leading `orgId` is the domain organization id.
import type { Module, SaveItemInput } from "./model.js";

export interface ModulesService {
  listForCourse(orgId: string, courseId: string): Promise<Module[]>;
  reorderModules(orgId: string, courseId: string, orderedIds: string[]): Promise<Module[]>;
  createModule(orgId: string, courseId: string, title: string): Promise<Module[]>;
  updateModule(orgId: string, courseId: string, moduleId: string, title: string): Promise<Module[]>;
  deleteModule(orgId: string, courseId: string, moduleId: string): Promise<Module[]>;
  reorderItems(
    orgId: string,
    courseId: string,
    moduleId: string,
    orderedIds: string[],
  ): Promise<Module[]>;
  saveItem(
    orgId: string,
    courseId: string,
    moduleId: string,
    input: SaveItemInput,
    itemId?: string,
  ): Promise<Module[]>;
  deleteItem(orgId: string, courseId: string, moduleId: string, itemId: string): Promise<Module[]>;
}

export interface ModulesRepository {
  listForCourse(orgId: string, courseId: string): Promise<Module[]>;
  reorderModules(orgId: string, courseId: string, orderedIds: string[]): Promise<Module[]>;
  createModule(orgId: string, courseId: string, title: string): Promise<Module[]>;
  updateModule(orgId: string, courseId: string, moduleId: string, title: string): Promise<Module[]>;
  deleteModule(orgId: string, courseId: string, moduleId: string): Promise<Module[]>;
  reorderItems(
    orgId: string,
    courseId: string,
    moduleId: string,
    orderedIds: string[],
  ): Promise<Module[]>;
  saveItem(
    orgId: string,
    courseId: string,
    moduleId: string,
    input: SaveItemInput,
    itemId?: string,
  ): Promise<Module[]>;
  deleteItem(orgId: string, courseId: string, moduleId: string, itemId: string): Promise<Module[]>;
}
