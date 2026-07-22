// content context — service implementation (inbound port).
//
// Course mutations run inside the context's UnitOfWork: the domain write and
// the outbox append commit in ONE transaction (transactional outbox). This
// service never publishes — the outbox relay dispatches committed events to
// EventBus subscribers at-least-once.
import type { Course, Module, SaveActivityInput } from './model.js';
import type {
  ContentService,
  ContentRepository,
  CourseRepository,
  ContentUnitOfWork,
} from './ports.js';
import type { CreateCourseInput, ListCoursesQuery, Page, UpdateCourseInput } from './types.js';
import type { Logger } from '../shared/ports.js';
import { NotFoundError } from '../shared/errors.js';
import { noopLogger } from '../shared/logger.js';

/** URL-safe slug derived from a title. Domain rule owned by the service. */
function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export class ContentServiceImpl implements ContentService {
  constructor(
    private readonly repo: ContentRepository,
    private readonly structureRepo: CourseRepository,
    private readonly uow: ContentUnitOfWork,
    private readonly logger: Logger = noopLogger,
  ) {}

  list(orgId: string, query: ListCoursesQuery): Promise<Page<Course>> {
    return this.repo.list(orgId, query);
  }

  get(orgId: string, id: string): Promise<Course | null> {
    return this.repo.findById(orgId, id);
  }

  async create(orgId: string, input: CreateCourseInput): Promise<Course> {
    const course = await this.uow.run(async ({ courses, outbox }) => {
      const created = await courses.create(orgId, input, slugify(input.title));
      await outbox.append([{ type: 'course.created', orgId, course: created }]);
      return created;
    });
    this.logger.info('course created', { orgId, courseId: course.id });
    return course;
  }

  async update(orgId: string, id: string, patch: UpdateCourseInput): Promise<Course> {
    const course = await this.uow.run(async ({ courses, outbox }) => {
      const updated = await courses.update(orgId, id, patch);
      if (!updated) {
        throw new NotFoundError('Course', id);
      }
      await outbox.append([{ type: 'course.updated', orgId, course: updated }]);
      return updated;
    });
    this.logger.info('course updated', { orgId, courseId: id });
    return course;
  }

  async remove(orgId: string, id: string): Promise<void> {
    await this.uow.run(async ({ courses, outbox }) => {
      // Snapshot before the delete — the event carries the last known state.
      const course = await courses.findById(orgId, id);
      if (!course) {
        throw new NotFoundError('Course', id);
      }
      const ok = await courses.delete(orgId, id);
      if (!ok) {
        throw new NotFoundError('Course', id);
      }
      await outbox.append([{ type: 'course.deleted', orgId, course }]);
    });
    this.logger.info('course deleted', { orgId, courseId: id });
  }

  // --- modules & activities (delegated to the structure repository) -------

  listForCourse(orgId: string, courseId: string): Promise<Module[]> {
    return this.structureRepo.listForCourse(orgId, courseId);
  }
  async reorderModules(orgId: string, courseId: string, orderedIds: string[]): Promise<Module[]> {
    const modules = await this.structureRepo.reorderModules(orgId, courseId, orderedIds);
    this.logger.debug('modules reordered', { orgId, courseId });
    return modules;
  }
  async createModule(orgId: string, courseId: string, title: string): Promise<Module[]> {
    const modules = await this.structureRepo.createModule(orgId, courseId, title);
    this.logger.info('module created', { orgId, courseId });
    return modules;
  }
  async updateModule(
    orgId: string,
    courseId: string,
    moduleId: string,
    title: string,
  ): Promise<Module[]> {
    const modules = await this.structureRepo.updateModule(orgId, courseId, moduleId, title);
    this.logger.info('module updated', { orgId, courseId, moduleId });
    return modules;
  }
  async deleteModule(orgId: string, courseId: string, moduleId: string): Promise<Module[]> {
    const modules = await this.structureRepo.deleteModule(orgId, courseId, moduleId);
    this.logger.info('module deleted', { orgId, courseId, moduleId });
    return modules;
  }
  async reorderActivities(
    orgId: string,
    courseId: string,
    moduleId: string,
    orderedIds: string[],
  ): Promise<Module[]> {
    const modules = await this.structureRepo.reorderActivities(
      orgId,
      courseId,
      moduleId,
      orderedIds,
    );
    this.logger.debug('activities reordered', { orgId, courseId, moduleId });
    return modules;
  }
  async saveActivity(
    orgId: string,
    courseId: string,
    moduleId: string,
    input: SaveActivityInput,
    activityId?: string,
  ): Promise<Module[]> {
    const modules = await this.structureRepo.saveActivity(
      orgId,
      courseId,
      moduleId,
      input,
      activityId,
    );
    this.logger.info('activity saved', {
      orgId,
      courseId,
      moduleId,
      activityId: activityId ?? null,
    });
    return modules;
  }
  async deleteActivity(
    orgId: string,
    courseId: string,
    moduleId: string,
    activityId: string,
  ): Promise<Module[]> {
    const modules = await this.structureRepo.deleteActivity(orgId, courseId, moduleId, activityId);
    this.logger.info('activity deleted', { orgId, courseId, moduleId, activityId });
    return modules;
  }
}
