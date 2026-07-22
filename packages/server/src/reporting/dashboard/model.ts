// reporting/dashboard — cross-context overview read model. Framework-free.

export interface OverviewStats {
  publishedCourses: number;
  draftCourses: number;
  activeStudents: number;
  activeEntitlements: number;
  expiringSoon: number;
}
