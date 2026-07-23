// reporting/learn — service implementation. Composes the enrollment reader
// (which published courses the student is actively enrolled in) with the content
// service (the Course/Module payload). Activities are filtered to published;
// `settings.published === false` is the only draft signal (missing ⇒ published).
import type { ContentService } from '../../core/content/index.js';
import type { ProgressService } from '../../core/progress/index.js';
import type { Course, Module, CourseProgressView } from './model.js';
import type { LearnEntitlementReader, LearnReportService } from './ports.js';
import type { Logger } from '../../core/shared/ports.js';
import { noopLogger } from '../../core/shared/logger.js';

function isActivityPublished(settings: unknown): boolean {
  return (settings as { published?: boolean } | null)?.published !== false;
}

export class LearnReportServiceImpl implements LearnReportService {
  constructor(
    private readonly reader: LearnEntitlementReader,
    private readonly content: ContentService,
    private readonly progress: ProgressService,
    private readonly logger: Logger = noopLogger,
  ) {}

  async listCourses(orgId: string, studentId: string): Promise<Course[]> {
    const refs = await this.reader.activeRefs(orgId, studentId);
    const courses = await Promise.all(refs.map((ref) => this.content.get(ref.orgId, ref.courseId)));
    return courses.filter((c): c is Course => c !== null && c.status === 'published');
  }

  async getCourse(orgId: string, studentId: string, courseId: string): Promise<Course | null> {
    const ref = await this.reader.activeRef(orgId, studentId, courseId);
    if (!ref) {
      return null;
    }
    const course = await this.content.get(ref.orgId, courseId);
    return course && course.status === 'published' ? course : null;
  }

  async listModules(orgId: string, studentId: string, courseId: string): Promise<Module[] | null> {
    const ref = await this.reader.activeRef(orgId, studentId, courseId);
    if (!ref) {
      return null;
    }
    const modules = await this.content.listForCourse(ref.orgId, courseId);
    return modules.map((m) => ({
      ...m,
      activities: m.activities.filter((a) => isActivityPublished(a.settings)),
    }));
  }

  async courseProgress(
    orgId: string,
    studentId: string,
    courseId: string,
  ): Promise<CourseProgressView | null> {
    const ref = await this.reader.activeRef(orgId, studentId, courseId);
    if (!ref) {
      return null;
    }
    const modules = await this.content.listForCourse(ref.orgId, courseId);
    const ids = modules.flatMap((m) =>
      m.activities.filter((a) => isActivityPublished(a.settings)).map((a) => a.id),
    );
    const records = await this.progress.listByTargets(ref.orgId, studentId, ids);
    const activities: CourseProgressView['activities'] = {};
    let done = 0;
    for (const r of records) {
      if (r.targetType !== 'activity') {
        continue;
      }
      activities[r.targetId] = r.completedAt ? 'completed' : 'in-progress';
      if (r.completedAt) {
        done += 1;
      }
    }
    const courseRecord = await this.progress.get(ref.orgId, {
      studentId,
      targetType: 'course',
      targetId: courseId,
    });
    return {
      activities,
      percent: ids.length > 0 ? Math.round((done / ids.length) * 100) : 0,
      completed: courseRecord?.completedAt != null,
    };
  }
}
