// students context — ports.
import type { Page, Student, StudentsQuery } from "./model.js";

export interface StudentsService {
  list(orgId: string, query: StudentsQuery): Promise<Page<Student>>;
  get(orgId: string, id: string): Promise<Student | null>;
}

export interface StudentsRepository {
  list(orgId: string, query: StudentsQuery): Promise<Page<Student>>;
  findById(orgId: string, id: string): Promise<Student | null>;
}
