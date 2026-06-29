// reporting/students — service implementation (inbound port).
import type { Page, Student, StudentsQuery } from "./model.js";
import type { StudentsReportRepository, StudentsReportService } from "./ports.js";

export class StudentsReportServiceImpl implements StudentsReportService {
  constructor(private readonly repo: StudentsReportRepository) {}

  list(orgId: string, query: StudentsQuery): Promise<Page<Student>> {
    return this.repo.list(orgId, query);
  }

  get(orgId: string, id: string): Promise<Student | null> {
    return this.repo.findById(orgId, id);
  }
}
