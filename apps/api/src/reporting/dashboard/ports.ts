// reporting/dashboard — ports.
import type { OverviewStats } from "./model.js";

export interface DashboardReportService {
  overview(orgId: string): Promise<OverviewStats>;
}

export interface DashboardReportRepository {
  overview(orgId: string): Promise<OverviewStats>;
}
