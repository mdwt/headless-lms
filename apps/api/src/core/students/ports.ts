// students context — ports.
import type { Page, Student, StudentsQuery } from "./model.js";

export interface StudentsService {
  list(query: StudentsQuery): Promise<Page<Student>>;
  get(id: string): Promise<Student | null>;
}

export interface StudentsRepository {
  list(query: StudentsQuery): Promise<Page<Student>>;
  findById(id: string): Promise<Student | null>;
}
