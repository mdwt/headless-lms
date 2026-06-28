// enrollments — in-memory repository. Rows are denormalized (carry student +
// course display fields) exactly like the API payload.
import { randomUUID } from "node:crypto";
import type { EnrollmentsRepository } from "../../core/enrollments/ports.js";
import type {
  Enrollment,
  EnrollmentSource,
  EnrollmentStatus,
  EnrollmentsQuery,
  GrantEnrollmentInput,
  Page,
} from "../../core/enrollments/model.js";
import { applyList, daysAgo, daysAhead } from "./list.js";

const STATUSES: EnrollmentStatus[] = ["active", "active", "active", "expired", "revoked"];
const SOURCES: EnrollmentSource[] = ["manual", "purchase", "import"];
const STUDENTS = ["Mira Okonkwo", "Theo Lindqvist", "Priya Nair", "Daniel Mercer", "Lena Halvorsen"];
const COURSES = [
  "Foundations of Type & Layout",
  "Modern CSS Architecture",
  "Pricing Strategy Essentials",
  "Data Visualization Craft",
];

function seed(): Enrollment[] {
  return Array.from({ length: 80 }, (_, i): Enrollment => {
    const name = STUDENTS[i % STUDENTS.length] as string;
    const status = STATUSES[i % STATUSES.length] as EnrollmentStatus;
    const expiresOffset = (i * 7) % 120;
    return {
      id: `enr_${(i + 1).toString().padStart(4, "0")}`,
      studentId: `std_${((i % 48) + 1).toString().padStart(3, "0")}`,
      studentName: name,
      studentEmail: `${name.toLowerCase().replace(/[^a-z]+/g, ".")}@example.com`,
      courseId: `crs_${((i % 4) + 1).toString().padStart(3, "0")}`,
      courseTitle: COURSES[i % COURSES.length] as string,
      status,
      progressPercent: status === "revoked" ? (i * 3) % 60 : (i * 17) % 101,
      grantedAt: daysAgo(30 + (i % 200)),
      expiresAt:
        i % 4 === 0 ? null : status === "expired" ? daysAgo(expiresOffset % 30) : daysAhead(expiresOffset),
      source: SOURCES[i % SOURCES.length] as EnrollmentSource,
    };
  });
}

export class InMemoryEnrollmentsRepository implements EnrollmentsRepository {
  private enrollments: Enrollment[] = seed();

  async list(query: EnrollmentsQuery): Promise<Page<Enrollment>> {
    let rows = this.enrollments;
    if (query.status) rows = rows.filter((e) => e.status === query.status);
    if (query.source) rows = rows.filter((e) => e.source === query.source);
    return applyList(rows, query, ["studentName", "studentEmail", "courseTitle"]);
  }

  async insert(input: GrantEnrollmentInput): Promise<Enrollment> {
    const enrollment: Enrollment = {
      id: `enr_${randomUUID().slice(0, 8)}`,
      studentId: input.studentId,
      studentName: `Student ${input.studentId}`,
      studentEmail: `${input.studentId}@example.com`,
      courseId: input.courseId,
      courseTitle: `Course ${input.courseId}`,
      status: "active",
      progressPercent: 0,
      grantedAt: new Date().toISOString(),
      expiresAt: input.expiresAt,
      source: "manual",
    };
    this.enrollments = [enrollment, ...this.enrollments];
    return enrollment;
  }

  async setStatus(id: string, status: "active" | "revoked"): Promise<Enrollment | null> {
    const found = this.enrollments.find((e) => e.id === id);
    if (!found) return null;
    found.status = status;
    return found;
  }
}
