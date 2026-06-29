// modules context — service implementation (inbound port). Thin delegation;
// ordering/persistence detail lives in the repository. Every method is
// org-scoped: the leading `orgId` is threaded through to the repository.
import type { Module, SaveItemInput } from "./model.js";
import type { ModulesRepository, ModulesService } from "./ports.js";

export class ModulesServiceImpl implements ModulesService {
  constructor(private readonly repo: ModulesRepository) {}

  listForCourse(orgId: string, courseId: string): Promise<Module[]> {
    return this.repo.listForCourse(orgId, courseId);
  }
  reorderModules(orgId: string, courseId: string, orderedIds: string[]): Promise<Module[]> {
    return this.repo.reorderModules(orgId, courseId, orderedIds);
  }
  createModule(orgId: string, courseId: string, title: string): Promise<Module[]> {
    return this.repo.createModule(orgId, courseId, title);
  }
  updateModule(
    orgId: string,
    courseId: string,
    moduleId: string,
    title: string,
  ): Promise<Module[]> {
    return this.repo.updateModule(orgId, courseId, moduleId, title);
  }
  deleteModule(orgId: string, courseId: string, moduleId: string): Promise<Module[]> {
    return this.repo.deleteModule(orgId, courseId, moduleId);
  }
  reorderItems(
    orgId: string,
    courseId: string,
    moduleId: string,
    orderedIds: string[],
  ): Promise<Module[]> {
    return this.repo.reorderItems(orgId, courseId, moduleId, orderedIds);
  }
  saveItem(
    orgId: string,
    courseId: string,
    moduleId: string,
    input: SaveItemInput,
    itemId?: string,
  ): Promise<Module[]> {
    return this.repo.saveItem(orgId, courseId, moduleId, input, itemId);
  }
  deleteItem(
    orgId: string,
    courseId: string,
    moduleId: string,
    itemId: string,
  ): Promise<Module[]> {
    return this.repo.deleteItem(orgId, courseId, moduleId, itemId);
  }
}
