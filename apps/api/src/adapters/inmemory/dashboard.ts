// dashboard — in-memory repository. Returns a stable overview snapshot. A real
// implementation would aggregate across the courses/students/enrollments/
// submissions read models.
import type { DashboardRepository } from "../../core/dashboard/ports.js";
import type { OverviewStats } from "../../core/dashboard/model.js";

export class InMemoryDashboardRepository implements DashboardRepository {
  async overview(): Promise<OverviewStats> {
    return {
      publishedCourses: 10,
      draftCourses: 2,
      activeStudents: 42,
      activeEnrollments: 48,
      pendingSubmissions: 18,
      expiringSoon: 6,
    };
  }
}
