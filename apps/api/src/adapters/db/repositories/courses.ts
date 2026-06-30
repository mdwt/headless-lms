// courses — Drizzle repository (implements the core outbound port). Org-scoped:
// every method takes the domain `organizations.id` and constrains its queries to
// that tenant. The `Course` model carries DERIVED fields (module / lesson /
// enrolled counts) computed via correlated subqueries. Courses no longer
// reference an instructor (teaching is `course_assignments` in organizations).
import { eq, and, sql, count, asc, desc, ilike, or, type SQL, type AnyColumn } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { CoursesRepository } from "../../../core/courses/ports.js";
import type { Course, CourseStatus } from "../../../core/courses/model.js";
import type {
  CreateCourseInput,
  ListCoursesQuery,
  Page,
  UpdateCourseInput,
} from "../../../core/courses/types.js";
import { courses, modules, moduleItems } from "../schema/courses.js";
import { enrollments } from "../schema/entitlements.js";

// Derived counts as correlated subqueries against the current `courses` row.
const moduleCountExpr = sql<number>`(
  select count(*)::int from ${modules}
  where ${modules.orgId} = ${courses.orgId} and ${modules.courseId} = ${courses.id}
)`;

const lessonCountExpr = sql<number>`(
  select count(*)::int from ${moduleItems}
  inner join ${modules}
    on ${modules.orgId} = ${moduleItems.orgId} and ${modules.id} = ${moduleItems.moduleId}
  where ${modules.orgId} = ${courses.orgId}
    and ${modules.courseId} = ${courses.id}
    and ${moduleItems.kind} = 'lesson'
)`;

const enrolledCountExpr = sql<number>`(
  select count(*)::int from ${enrollments}
  where ${enrollments.orgId} = ${courses.orgId}
    and ${enrollments.courseId} = ${courses.id}
    and ${enrollments.status} = 'active'
    and (${enrollments.expiresAt} is null or ${enrollments.expiresAt} >= now())
)`;

const selection = {
  id: courses.id,
  title: courses.title,
  slug: courses.slug,
  description: courses.description,
  status: courses.status,
  category: courses.category,
  moduleCount: moduleCountExpr,
  lessonCount: lessonCountExpr,
  enrolledCount: enrolledCountExpr,
  createdAt: courses.createdAt,
  updatedAt: courses.updatedAt,
};

type CourseRow = {
  id: string;
  title: string;
  slug: string;
  description: string;
  status: string;
  category: string;
  moduleCount: number;
  lessonCount: number;
  enrolledCount: number;
  createdAt: Date;
  updatedAt: Date;
};

function toCourse(row: CourseRow): Course {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    description: row.description,
    status: row.status as CourseStatus,
    category: row.category,
    moduleCount: Number(row.moduleCount),
    lessonCount: Number(row.lessonCount),
    enrolledCount: Number(row.enrolledCount),
    updatedAt: row.updatedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

// Columns/expressions a caller may sort by. Default falls back to createdAt desc.
const sortColumns: Record<string, AnyColumn | SQL> = {
  title: courses.title,
  slug: courses.slug,
  status: courses.status,
  category: courses.category,
  createdAt: courses.createdAt,
  updatedAt: courses.updatedAt,
  moduleCount: moduleCountExpr,
  lessonCount: lessonCountExpr,
  enrolledCount: enrolledCountExpr,
};

export class DrizzleCoursesRepository implements CoursesRepository {
  constructor(private readonly db: NodePgDatabase) {}

  async list(orgId: string, query: ListCoursesQuery): Promise<Page<Course>> {
    const conditions: SQL[] = [eq(courses.orgId, orgId)];
    if (query.status) conditions.push(eq(courses.status, query.status));
    if (query.category) conditions.push(eq(courses.category, query.category));

    const search = query.search?.trim();
    if (search) {
      const like = `%${search}%`;
      const match = or(ilike(courses.title, like), ilike(courses.category, like));
      if (match) conditions.push(match);
    }

    const where = and(...conditions);

    // Resolve sort: `-` prefix = desc, default createdAt desc.
    let sortKey = "createdAt";
    let direction: "asc" | "desc" = "desc";
    if (query.sort) {
      const isDesc = query.sort.startsWith("-");
      const key = isDesc ? query.sort.slice(1) : query.sort;
      if (key in sortColumns) {
        sortKey = key;
        direction = isDesc ? "desc" : "asc";
      }
    }
    const sortExpr = sortColumns[sortKey] ?? courses.createdAt;
    const orderBy = direction === "desc" ? desc(sortExpr) : asc(sortExpr);

    const rows = await this.db
      .select(selection)
      .from(courses)
      .where(where)
      .orderBy(orderBy)
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize);

    const [totalRow] = await this.db
      .select({ value: count() })
      .from(courses)
      .where(where);

    return {
      rows: rows.map(toCourse),
      total: totalRow?.value ?? 0,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async findById(orgId: string, id: string): Promise<Course | null> {
    const [row] = await this.db
      .select(selection)
      .from(courses)
      .where(and(eq(courses.orgId, orgId), eq(courses.id, id)))
      .limit(1);
    return row ? toCourse(row) : null;
  }

  async create(orgId: string, input: CreateCourseInput, slug: string): Promise<Course> {
    const [inserted] = await this.db
      .insert(courses)
      .values({
        orgId,
        title: input.title,
        slug,
        description: input.description ?? "",
        category: input.category ?? "",
      })
      .returning({ id: courses.id });
    if (!inserted) throw new Error("failed to insert course");
    const created = await this.findById(orgId, inserted.id);
    if (!created) throw new Error("failed to load created course");
    return created;
  }

  async update(orgId: string, id: string, patch: UpdateCourseInput): Promise<Course | null> {
    const set: Record<string, unknown> = { updatedAt: new Date() };
    if (patch.title !== undefined) set.title = patch.title;
    if (patch.description !== undefined) set.description = patch.description;
    if (patch.category !== undefined) set.category = patch.category;
    if (patch.status !== undefined) set.status = patch.status;

    const [updated] = await this.db
      .update(courses)
      .set(set)
      .where(and(eq(courses.orgId, orgId), eq(courses.id, id)))
      .returning({ id: courses.id });
    if (!updated) return null;
    return this.findById(orgId, id);
  }

  async delete(orgId: string, id: string): Promise<boolean> {
    const deleted = await this.db
      .delete(courses)
      .where(and(eq(courses.orgId, orgId), eq(courses.id, id)))
      .returning({ id: courses.id });
    return deleted.length > 0;
  }
}
