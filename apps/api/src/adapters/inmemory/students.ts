// students — in-memory repository.
import type { StudentsRepository } from "../../core/students/ports.js";
import type { Page, Student, StudentsQuery } from "../../core/students/model.js";
import { applyList, daysAgo } from "./list.js";

const FIRST = [
  "Mira", "Theo", "Priya", "Daniel", "Lena", "Marco", "Aisha", "Noah", "Sofia",
  "Ezra", "Yuki", "Omar", "Hana", "Liam", "Greta", "Ravi", "Nora", "Felix",
];
const LAST = [
  "Okonkwo", "Lindqvist", "Nair", "Mercer", "Halvorsen", "Bianchi", "Rahman",
  "Whitlock", "Castellano", "Adler", "Tanaka", "Haddad", "Kim", "Brennan",
];

function fullName(i: number): string {
  return `${FIRST[i % FIRST.length]} ${LAST[(i * 7 + 3) % LAST.length]}`;
}

function seed(): Student[] {
  return Array.from({ length: 48 }, (_, i): Student => {
    const name = fullName(i * 3 + 5);
    const handle = name.toLowerCase().replace(/[^a-z]+/g, ".");
    return {
      id: `std_${(i + 1).toString().padStart(3, "0")}`,
      name,
      email: `${handle}${i % 3 === 0 ? "" : i}@example.com`,
      image: null,
      enrollmentCount: 1 + (i % 5),
      avgProgress: (i * 13) % 101,
      joinedAt: daysAgo((i * 5) % 300),
      lastActiveAt: i % 9 === 0 ? null : daysAgo(i % 40),
    };
  });
}

export class InMemoryStudentsRepository implements StudentsRepository {
  private students: Student[] = seed();

  async list(query: StudentsQuery): Promise<Page<Student>> {
    return applyList(this.students, query, ["name", "email"]);
  }

  async findById(id: string): Promise<Student | null> {
    return this.students.find((s) => s.id === id) ?? null;
  }
}
