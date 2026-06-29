// dashboard context — back-office overview read model. Framework-free.

export interface OverviewStats {
  publishedCourses: number;
  draftCourses: number;
  activeStudents: number;
  activeEnrollments: number;
  expiringSoon: number;
}
