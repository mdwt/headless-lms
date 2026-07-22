// content — Drizzle repository for the course aggregate root (implements the core
// outbound `ContentRepository` port). Org-scoped: every method takes the domain
// `organizations.id` and constrains its queries to that tenant. The `Course`
// model carries DERIVED fields (module / activity / enrolled counts) computed via
// correlated subqueries.
import { eq, and, sql, count, asc, desc, ilike, or, type SQL, type AnyColumn } from 'drizzle-orm';
import type { DbExecutor } from '../index.js';
import type { ContentRepository } from '../../../core/content/ports.js';
import type { Course, CourseStatus } from '../../../core/content/model.js';
import type {
  CreateCourseInput,
  ListCoursesQuery,
  Page,
  UpdateCourseInput,
} from '../../../core/content/types.js';
import { courses, modules, activities } from '../schema/content.js';
import { enrollments } from '../schema/entitlements.js';
import type { Logger } from '../../../core/shared/ports.js';
import { noopLogger } from '../../../core/shared/logger.js';

// Derived counts as correlated subqueries against the current `courses` row.
// NOTE: Drizzle does NOT table-qualify a Column interpolated into a raw `sql`
// template (`${modules.orgId}` renders bare `"org_id"`), which collides with the
// outer `courses.org_id` and yields a 42702 "ambiguous column" error. Qualify
// every reference explicitly by interpolating the TABLE (`${modules}` → "modules")
// and appending the column name.
const moduleCountExpr = sql<number>`(
  select count(*)::int from ${modules}
  where ${modules}.org_id = ${courses}.org_id and ${modules}.course_id = ${courses}.id
)`;

const activityCountExpr = sql<number>`(
  select count(*)::int from ${activities}
  inner join ${modules}
    on ${modules}.org_id = ${activities}.org_id and ${modules}.id = ${activities}.module_id
  where ${modules}.org_id = ${courses}.org_id
    and ${modules}.course_id = ${courses}.id
)`;

const enrolledCountExpr = sql<number>`(
  select count(*)::int from ${enrollments}
  where ${enrollments}.org_id = ${courses}.org_id
    and ${enrollments}.course_id = ${courses}.id
    and ${enrollments}.status = 'active'
    and (${enrollments}.expires_at is null or ${enrollments}.expires_at >= now())
)`;

const selection = {
  id: courses.id,
  title: courses.title,
  slug: courses.slug,
  description: courses.description,
  status: courses.status,
  category: courses.category,
  moduleCount: moduleCountExpr,
  activityCount: activityCountExpr,
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
  activityCount: number;
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
    activityCount: Number(row.activityCount),
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
  activityCount: activityCountExpr,
  enrolledCount: enrolledCountExpr,
};

export class DrizzleContentRepository implements ContentRepository {
  constructor(
    private readonly db: DbExecutor,
    private readonly logger: Logger = noopLogger,
  ) {}

  async list(orgId: string, query: ListCoursesQuery): Promise<Page<Course>> {
    const conditions: SQL[] = [eq(courses.orgId, orgId)];
    if (query.status) {
      conditions.push(eq(courses.status, query.status));
    }
    if (query.category) {
      conditions.push(eq(courses.category, query.category));
    }

    const search = query.search?.trim();
    if (search) {
      const like = `%${search}%`;
      const match = or(ilike(courses.title, like), ilike(courses.category, like));
      if (match) {
        conditions.push(match);
      }
    }

    const where = and(...conditions);

    // Resolve sort: `-` prefix = desc, default createdAt desc.
    let sortKey = 'createdAt';
    let direction: 'asc' | 'desc' = 'desc';
    if (query.sort) {
      const isDesc = query.sort.startsWith('-');
      const key = isDesc ? query.sort.slice(1) : query.sort;
      if (key in sortColumns) {
        sortKey = key;
        direction = isDesc ? 'desc' : 'asc';
      }
    }
    const sortExpr = sortColumns[sortKey] ?? courses.createdAt;
    const orderBy = direction === 'desc' ? desc(sortExpr) : asc(sortExpr);

    const rows = await this.db
      .select(selection)
      .from(courses)
      .where(where)
      .orderBy(orderBy)
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize);

    const [totalRow] = await this.db.select({ value: count() }).from(courses).where(where);

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
        description: input.description ?? '',
        category: input.category ?? '',
      })
      .returning({ id: courses.id });
    if (!inserted) {
      throw new Error('failed to insert course');
    }
    const created = await this.findById(orgId, inserted.id);
    if (!created) {
      throw new Error('failed to load created course');
    }
    return created;
  }

  async update(orgId: string, id: string, patch: UpdateCourseInput): Promise<Course | null> {
    const set: Record<string, unknown> = { updatedAt: new Date() };
    if (patch.title !== undefined) {
      set.title = patch.title;
    }
    if (patch.description !== undefined) {
      set.description = patch.description;
    }
    if (patch.category !== undefined) {
      set.category = patch.category;
    }
    if (patch.status !== undefined) {
      set.status = patch.status;
    }

    const [updated] = await this.db
      .update(courses)
      .set(set)
      .where(and(eq(courses.orgId, orgId), eq(courses.id, id)))
      .returning({ id: courses.id });
    if (!updated) {
      return null;
    }
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
