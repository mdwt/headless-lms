// reporting/dashboard — service implementation (inbound port).
import type { OverviewStats } from "./model.js";
import type { DashboardReportRepository, DashboardReportService } from "./ports.js";

export class DashboardReportServiceImpl implements DashboardReportService {
  constructor(private readonly repo: DashboardReportRepository) {}

  overview(orgId: string): Promise<OverviewStats> {
    return this.repo.overview(orgId);
  }
}
