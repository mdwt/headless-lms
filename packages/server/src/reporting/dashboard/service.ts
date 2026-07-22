// reporting/dashboard — service implementation (inbound port).
import type { OverviewStats } from "./model.js";
import type { DashboardReportRepository, DashboardReportService } from "./ports.js";
import type { Logger } from "../../core/shared/ports.js";
import { noopLogger } from "../../core/shared/logger.js";

export class DashboardReportServiceImpl implements DashboardReportService {
  constructor(
    private readonly repo: DashboardReportRepository,
    private readonly logger: Logger = noopLogger,
  ) {}

  overview(orgId: string): Promise<OverviewStats> {
    return this.repo.overview(orgId);
  }
}
