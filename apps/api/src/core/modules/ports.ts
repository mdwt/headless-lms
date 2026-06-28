// modules context — ports. Write operations return the course's full module
// list (matching how the editor re-renders after each change).
import type { Module, SaveItemInput } from "./model.js";

export interface ModulesService {
  listForCourse(courseId: string): Promise<Module[]>;
  reorderModules(courseId: string, orderedIds: string[]): Promise<Module[]>;
  createModule(courseId: string, title: string): Promise<Module[]>;
  updateModule(courseId: string, moduleId: string, title: string): Promise<Module[]>;
  deleteModule(courseId: string, moduleId: string): Promise<Module[]>;
  reorderItems(courseId: string, moduleId: string, orderedIds: string[]): Promise<Module[]>;
  saveItem(courseId: string, moduleId: string, input: SaveItemInput, itemId?: string): Promise<Module[]>;
  deleteItem(courseId: string, moduleId: string, itemId: string): Promise<Module[]>;
}

export interface ModulesRepository {
  listForCourse(courseId: string): Promise<Module[]>;
  reorderModules(courseId: string, orderedIds: string[]): Promise<Module[]>;
  createModule(courseId: string, title: string): Promise<Module[]>;
  updateModule(courseId: string, moduleId: string, title: string): Promise<Module[]>;
  deleteModule(courseId: string, moduleId: string): Promise<Module[]>;
  reorderItems(courseId: string, moduleId: string, orderedIds: string[]): Promise<Module[]>;
  saveItem(courseId: string, moduleId: string, input: SaveItemInput, itemId?: string): Promise<Module[]>;
  deleteItem(courseId: string, moduleId: string, itemId: string): Promise<Module[]>;
}
