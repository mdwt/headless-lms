// students context — service implementation (inbound port).
import type { Page, Student, StudentsQuery } from "./model.js";
import type { StudentsRepository, StudentsService } from "./ports.js";

export class StudentsServiceImpl implements StudentsService {
  constructor(private readonly repo: StudentsRepository) {}

  list(query: StudentsQuery): Promise<Page<Student>> {
    return this.repo.list(query);
  }

  get(id: string): Promise<Student | null> {
    return this.repo.findById(id);
  }
}
