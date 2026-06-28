// modules context — service implementation (inbound port). Thin delegation;
// ordering/persistence detail lives in the repository.
import type { Module, SaveItemInput } from "./model.js";
import type { ModulesRepository, ModulesService } from "./ports.js";

export class ModulesServiceImpl implements ModulesService {
  constructor(private readonly repo: ModulesRepository) {}

  listForCourse(courseId: string): Promise<Module[]> {
    return this.repo.listForCourse(courseId);
  }
  reorderModules(courseId: string, orderedIds: string[]): Promise<Module[]> {
    return this.repo.reorderModules(courseId, orderedIds);
  }
  createModule(courseId: string, title: string): Promise<Module[]> {
    return this.repo.createModule(courseId, title);
  }
  updateModule(courseId: string, moduleId: string, title: string): Promise<Module[]> {
    return this.repo.updateModule(courseId, moduleId, title);
  }
  deleteModule(courseId: string, moduleId: string): Promise<Module[]> {
    return this.repo.deleteModule(courseId, moduleId);
  }
  reorderItems(courseId: string, moduleId: string, orderedIds: string[]): Promise<Module[]> {
    return this.repo.reorderItems(courseId, moduleId, orderedIds);
  }
  saveItem(
    courseId: string,
    moduleId: string,
    input: SaveItemInput,
    itemId?: string,
  ): Promise<Module[]> {
    return this.repo.saveItem(courseId, moduleId, input, itemId);
  }
  deleteItem(courseId: string, moduleId: string, itemId: string): Promise<Module[]> {
    return this.repo.deleteItem(courseId, moduleId, itemId);
  }
}
