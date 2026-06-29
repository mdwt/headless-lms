// dashboard context — ports.
import type { OverviewStats } from "./model.js";

export interface DashboardService {
  overview(orgId: string): Promise<OverviewStats>;
}

export interface DashboardRepository {
  overview(orgId: string): Promise<OverviewStats>;
}
