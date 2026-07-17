// reporting/students — ports.
import type { Page, Student, StudentsQuery } from "./model.js";

export interface StudentsReportService {
  list(orgId: string, query: StudentsQuery): Promise<Page<Student>>;
  get(orgId: string, id: string): Promise<Student | null>;
}

export interface StudentsReportRepository {
  list(orgId: string, query: StudentsQuery): Promise<Page<Student>>;
  findById(orgId: string, id: string): Promise<Student | null>;
}
