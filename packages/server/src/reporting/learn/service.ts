// reporting/learn — service implementation. Composes the enrollment reader
// (which published courses the student is actively enrolled in) with the content
// service (the Course/Module payload). Activities are filtered to published;
// `settings.published === false` is the only draft signal (missing ⇒ published).
import type { ContentService } from "../../core/content/index.js";
import type { Course, Module } from "./model.js";
import type { LearnEnrollmentReader, LearnReportService } from "./ports.js";

function isActivityPublished(settings: unknown): boolean {
  return (settings as { published?: boolean } | null)?.published !== false;
}

export class LearnReportServiceImpl implements LearnReportService {
  constructor(
    private readonly reader: LearnEnrollmentReader,
    private readonly content: ContentService,
  ) {}

  async listCourses(orgId: string, studentId: string): Promise<Course[]> {
    const refs = await this.reader.activeRefs(orgId, studentId);
    const courses = await Promise.all(
      refs.map((ref) => this.content.get(ref.orgId, ref.courseId)),
    );
    return courses.filter((c): c is Course => c !== null && c.status === "published");
  }

  async getCourse(orgId: string, studentId: string, courseId: string): Promise<Course | null> {
    const ref = await this.reader.activeRef(orgId, studentId, courseId);
    if (!ref) return null;
    const course = await this.content.get(ref.orgId, courseId);
    return course && course.status === "published" ? course : null;
  }

  async listModules(orgId: string, studentId: string, courseId: string): Promise<Module[] | null> {
    const ref = await this.reader.activeRef(orgId, studentId, courseId);
    if (!ref) return null;
    const modules = await this.content.listForCourse(ref.orgId, courseId);
    return modules.map((m) => ({
      ...m,
      activities: m.activities.filter((a) => isActivityPublished(a.settings)),
    }));
  }
}
