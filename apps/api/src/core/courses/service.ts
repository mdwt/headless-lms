// courses context — service implementation (inbound port).
import type { Course } from "./model.js";
import type { Module, SaveItemInput } from "./modules.js";
import type { CoursesService, CoursesRepository, ModulesRepository } from "./ports.js";
import type {
  CreateCourseInput,
  ListCoursesQuery,
  Page,
  UpdateCourseInput,
} from "./types.js";

/** URL-safe slug derived from a title. Domain rule owned by the service. */
function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export class CoursesServiceImpl implements CoursesService {
  constructor(
    private readonly repo: CoursesRepository,
    private readonly modulesRepo: ModulesRepository,
  ) {}

  list(orgId: string, query: ListCoursesQuery): Promise<Page<Course>> {
    return this.repo.list(orgId, query);
  }

  get(orgId: string, id: string): Promise<Course | null> {
    return this.repo.findById(orgId, id);
  }

  create(orgId: string, input: CreateCourseInput, actorStudentId: string): Promise<Course> {
    // Default the instructor to the acting member when the input omits one.
    const instructorId = input.instructorId ?? actorStudentId;
    return this.repo.create(orgId, input, slugify(input.title), instructorId);
  }

  update(orgId: string, id: string, patch: UpdateCourseInput): Promise<Course | null> {
    return this.repo.update(orgId, id, patch);
  }

  remove(orgId: string, id: string): Promise<boolean> {
    return this.repo.delete(orgId, id);
  }

  // --- modules & items (delegated to the modules repository) -------------

  listForCourse(orgId: string, courseId: string): Promise<Module[]> {
    return this.modulesRepo.listForCourse(orgId, courseId);
  }
  reorderModules(orgId: string, courseId: string, orderedIds: string[]): Promise<Module[]> {
    return this.modulesRepo.reorderModules(orgId, courseId, orderedIds);
  }
  createModule(orgId: string, courseId: string, title: string): Promise<Module[]> {
    return this.modulesRepo.createModule(orgId, courseId, title);
  }
  updateModule(
    orgId: string,
    courseId: string,
    moduleId: string,
    title: string,
  ): Promise<Module[]> {
    return this.modulesRepo.updateModule(orgId, courseId, moduleId, title);
  }
  deleteModule(orgId: string, courseId: string, moduleId: string): Promise<Module[]> {
    return this.modulesRepo.deleteModule(orgId, courseId, moduleId);
  }
  reorderItems(
    orgId: string,
    courseId: string,
    moduleId: string,
    orderedIds: string[],
  ): Promise<Module[]> {
    return this.modulesRepo.reorderItems(orgId, courseId, moduleId, orderedIds);
  }
  saveItem(
    orgId: string,
    courseId: string,
    moduleId: string,
    input: SaveItemInput,
    itemId?: string,
  ): Promise<Module[]> {
    return this.modulesRepo.saveItem(orgId, courseId, moduleId, input, itemId);
  }
  deleteItem(
    orgId: string,
    courseId: string,
    moduleId: string,
    itemId: string,
  ): Promise<Module[]> {
    return this.modulesRepo.deleteItem(orgId, courseId, moduleId, itemId);
  }
}
