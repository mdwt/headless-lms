// content context — service implementation (inbound port).
import type { Course, Module, SaveActivityInput } from "./model.js";
import type { ContentService, ContentRepository, ContentStructureRepository } from "./ports.js";
import type { CreateCourseInput, ListCoursesQuery, Page, UpdateCourseInput } from "./types.js";

/** URL-safe slug derived from a title. Domain rule owned by the service. */
function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export class ContentServiceImpl implements ContentService {
  constructor(
    private readonly repo: ContentRepository,
    private readonly structureRepo: ContentStructureRepository,
  ) {}

  list(orgId: string, query: ListCoursesQuery): Promise<Page<Course>> {
    return this.repo.list(orgId, query);
  }

  get(orgId: string, id: string): Promise<Course | null> {
    return this.repo.findById(orgId, id);
  }

  create(orgId: string, input: CreateCourseInput): Promise<Course> {
    return this.repo.create(orgId, input, slugify(input.title));
  }

  update(orgId: string, id: string, patch: UpdateCourseInput): Promise<Course | null> {
    return this.repo.update(orgId, id, patch);
  }

  remove(orgId: string, id: string): Promise<boolean> {
    return this.repo.delete(orgId, id);
  }

  // --- modules & activities (delegated to the structure repository) -------

  listForCourse(orgId: string, courseId: string): Promise<Module[]> {
    return this.structureRepo.listForCourse(orgId, courseId);
  }
  reorderModules(orgId: string, courseId: string, orderedIds: string[]): Promise<Module[]> {
    return this.structureRepo.reorderModules(orgId, courseId, orderedIds);
  }
  createModule(orgId: string, courseId: string, title: string): Promise<Module[]> {
    return this.structureRepo.createModule(orgId, courseId, title);
  }
  updateModule(
    orgId: string,
    courseId: string,
    moduleId: string,
    title: string,
  ): Promise<Module[]> {
    return this.structureRepo.updateModule(orgId, courseId, moduleId, title);
  }
  deleteModule(orgId: string, courseId: string, moduleId: string): Promise<Module[]> {
    return this.structureRepo.deleteModule(orgId, courseId, moduleId);
  }
  reorderActivities(
    orgId: string,
    courseId: string,
    moduleId: string,
    orderedIds: string[],
  ): Promise<Module[]> {
    return this.structureRepo.reorderActivities(orgId, courseId, moduleId, orderedIds);
  }
  saveActivity(
    orgId: string,
    courseId: string,
    moduleId: string,
    input: SaveActivityInput,
    activityId?: string,
  ): Promise<Module[]> {
    return this.structureRepo.saveActivity(orgId, courseId, moduleId, input, activityId);
  }
  deleteActivity(
    orgId: string,
    courseId: string,
    moduleId: string,
    activityId: string,
  ): Promise<Module[]> {
    return this.structureRepo.deleteActivity(orgId, courseId, moduleId, activityId);
  }
}
