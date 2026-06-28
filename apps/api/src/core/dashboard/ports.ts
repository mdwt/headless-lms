// dashboard context — ports.
import type { OverviewStats } from "./model.js";

export interface DashboardService {
  overview(): Promise<OverviewStats>;
}

export interface DashboardRepository {
  overview(): Promise<OverviewStats>;
}
