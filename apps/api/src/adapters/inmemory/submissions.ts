// submissions — in-memory repository (denormalized grading queue).
import type { SubmissionsRepository } from "../../core/submissions/ports.js";
import type {
  GradeSubmissionInput,
  Page,
  Submission,
  SubmissionStatus,
  SubmissionsQuery,
} from "../../core/submissions/model.js";
import { applyList, daysAgo } from "./list.js";

const STATUSES: SubmissionStatus[] = ["pending", "pending", "pending", "graded", "returned"];
const STUDENTS = ["Mira Okonkwo", "Theo Lindqvist", "Priya Nair", "Daniel Mercer"];
const COURSES = ["Foundations of Type & Layout", "Modern CSS Architecture", "Data Visualization Craft"];

function seed(): Submission[] {
  return Array.from({ length: 32 }, (_, i): Submission => {
    const name = STUDENTS[i % STUDENTS.length] as string;
    const status = STATUSES[i % STATUSES.length] as SubmissionStatus;
    return {
      id: `sub_${(i + 1).toString().padStart(3, "0")}`,
      assessmentId: `itm_assess_${i}`,
      assessmentTitle: `Assignment ${(i % 4) + 1}.${(i % 3) + 1}`,
      courseId: `crs_${((i % 3) + 1).toString().padStart(3, "0")}`,
      courseTitle: COURSES[i % COURSES.length] as string,
      studentId: `std_${((i % 48) + 1).toString().padStart(3, "0")}`,
      studentName: name,
      studentEmail: `${name.toLowerCase().replace(/[^a-z]+/g, ".")}@example.com`,
      status,
      submittedAt: daysAgo(i % 18),
      pointsPossible: 100,
      score: status === "pending" ? null : 60 + ((i * 7) % 40),
      feedback: status === "pending" ? null : "Solid work — tighten the spacing rhythm in section two.",
      responsePreview:
        "For this exercise I started from the type scale and worked outward to the grid…",
    };
  });
}

export class InMemorySubmissionsRepository implements SubmissionsRepository {
  private submissions: Submission[] = seed();

  async list(query: SubmissionsQuery): Promise<Page<Submission>> {
    let rows = this.submissions;
    if (query.status) rows = rows.filter((s) => s.status === query.status);
    if (query.courseTitle) rows = rows.filter((s) => s.courseTitle === query.courseTitle);
    return applyList(rows, query, ["studentName", "assessmentTitle", "courseTitle"]);
  }

  async grade(id: string, input: GradeSubmissionInput): Promise<Submission | null> {
    const found = this.submissions.find((s) => s.id === id);
    if (!found) return null;
    found.score = input.score;
    found.feedback = input.feedback;
    found.status = "graded";
    return found;
  }
}
