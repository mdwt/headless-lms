// students context — service implementation (inbound port).
import type { Page, Student, StudentsQuery } from "./model.js";
import type { StudentsRepository, StudentsService } from "./ports.js";

export class StudentsServiceImpl implements StudentsService {
  constructor(private readonly repo: StudentsRepository) {}

  list(orgId: string, query: StudentsQuery): Promise<Page<Student>> {
    return this.repo.list(orgId, query);
  }

  get(orgId: string, id: string): Promise<Student | null> {
    return this.repo.findById(orgId, id);
  }
}
