// courses — in-memory repository. Backs the courses service until the Drizzle
// schema/queries are built out, so the API + generated SDK have a real,
// runnable surface. Seeded deterministically; mutations live for process life.
import { randomUUID } from "node:crypto";
import type { CoursesRepository } from "../../core/courses/ports.js";
import type { Course, CourseStatus } from "../../core/courses/model.js";
import type {
  CreateCourseInput,
  ListCoursesQuery,
  Page,
  UpdateCourseInput,
} from "../../core/courses/types.js";

const CATEGORIES = ["Design", "Engineering", "Product", "Marketing", "Data"];
const TITLES = [
  "Foundations of Type & Layout",
  "Designing Accessible Interfaces",
  "Systems Thinking for Product Teams",
  "Modern CSS Architecture",
  "Editorial Design in Practice",
  "Motion Design Fundamentals",
  "Pricing Strategy Essentials",
  "Data Visualization Craft",
  "Component API Design",
  "Information Architecture",
  "Conversion Copywriting",
  "Design Systems Governance",
];

function slugify(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

const EPOCH = Date.parse("2026-06-28T12:00:00.000Z");
const DAY = 86_400_000;
const iso = (msAgo: number) => new Date(EPOCH - msAgo).toISOString();

function seed(): Course[] {
  return TITLES.map((title, i) => {
    const status: CourseStatus = i % 5 === 0 ? "draft" : "published";
    const moduleCount = 3 + (i % 4);
    return {
      id: `crs_${(i + 1).toString().padStart(3, "0")}`,
      title,
      slug: slugify(title),
      description:
        "A focused, project-based course covering the essentials and the advanced edges of the craft.",
      status,
      category: CATEGORIES[i % CATEGORIES.length] as string,
      instructorId: `usr_inst_${(i % 6) + 1}`,
      instructorName: ["Mira Okonkwo", "Theo Lindqvist", "Priya Nair", "Daniel Mercer"][i % 4] as string,
      moduleCount,
      lessonCount: moduleCount * (3 + (i % 3)),
      enrolledCount: ((i * 37) % 240) + (status === "draft" ? 0 : 12),
      updatedAt: iso(((i * 3) % 90) * DAY),
      createdAt: iso((120 + i * 4) * DAY),
    } satisfies Course;
  });
}

export class InMemoryCoursesRepository implements CoursesRepository {
  private courses: Course[] = seed();

  async list(query: ListCoursesQuery): Promise<Page<Course>> {
    let rows = [...this.courses];

    const q = query.search?.trim().toLowerCase();
    if (q) {
      rows = rows.filter((c) =>
        [c.title, c.instructorName, c.category].some((v) => v.toLowerCase().includes(q)),
      );
    }
    if (query.status) rows = rows.filter((c) => c.status === query.status);
    if (query.category) rows = rows.filter((c) => c.category === query.category);

    if (query.sort) {
      const desc = query.sort.startsWith("-");
      const key = (desc ? query.sort.slice(1) : query.sort) as keyof Course;
      rows.sort((a, b) => {
        const av = a[key];
        const bv = b[key];
        let cmp = 0;
        if (typeof av === "number" && typeof bv === "number") cmp = av - bv;
        else cmp = String(av).localeCompare(String(bv));
        return desc ? -cmp : cmp;
      });
    }

    const total = rows.length;
    const start = (query.page - 1) * query.pageSize;
    return {
      rows: rows.slice(start, start + query.pageSize),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async findById(id: string): Promise<Course | null> {
    return this.courses.find((c) => c.id === id) ?? null;
  }

  async create(input: CreateCourseInput, slug: string): Promise<Course> {
    const now = new Date().toISOString();
    const course: Course = {
      id: `crs_${randomUUID().slice(0, 8)}`,
      title: input.title,
      slug,
      description: input.description ?? "",
      status: "draft",
      category: input.category ?? "Design",
      instructorId: input.instructorId ?? "usr_inst_1",
      instructorName: "Unassigned",
      moduleCount: 0,
      lessonCount: 0,
      enrolledCount: 0,
      updatedAt: now,
      createdAt: now,
    };
    this.courses = [course, ...this.courses];
    return course;
  }

  async update(id: string, patch: UpdateCourseInput): Promise<Course | null> {
    const idx = this.courses.findIndex((c) => c.id === id);
    if (idx === -1) return null;
    const existing = this.courses[idx] as Course;
    const updated: Course = {
      ...existing,
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
      ...(patch.category !== undefined ? { category: patch.category } : {}),
      ...(patch.instructorId !== undefined ? { instructorId: patch.instructorId } : {}),
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      updatedAt: new Date().toISOString(),
    };
    this.courses[idx] = updated;
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    const before = this.courses.length;
    this.courses = this.courses.filter((c) => c.id !== id);
    return this.courses.length < before;
  }
}
