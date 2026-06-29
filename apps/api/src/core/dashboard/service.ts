// dashboard context — service implementation (inbound port).
import type { OverviewStats } from "./model.js";
import type { DashboardRepository, DashboardService } from "./ports.js";

export class DashboardServiceImpl implements DashboardService {
  constructor(private readonly repo: DashboardRepository) {}

  overview(orgId: string): Promise<OverviewStats> {
    return this.repo.overview(orgId);
  }
}
