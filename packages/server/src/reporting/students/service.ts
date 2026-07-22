// reporting/students — service implementation (inbound port).
import type { Page, Student, StudentsQuery } from './model.js';
import type { StudentsReportRepository, StudentsReportService } from './ports.js';
import type { Logger } from '../../core/shared/ports.js';
import { noopLogger } from '../../core/shared/logger.js';

export class StudentsReportServiceImpl implements StudentsReportService {
  constructor(
    private readonly repo: StudentsReportRepository,
    private readonly logger: Logger = noopLogger,
  ) {}

  list(orgId: string, query: StudentsQuery): Promise<Page<Student>> {
    return this.repo.list(orgId, query);
  }

  get(orgId: string, id: string): Promise<Student | null> {
    return this.repo.findById(orgId, id);
  }
}
