// reporting/admin — read models for the admin app. Framework-free.
import type { OrgUserProfile, OrgUserStatus } from '../../types/index.js';

export interface SpacePostCount {
  spaceId: string;
  count: number;
}

export interface PostCommentCount {
  postId: string;
  count: number;
}

export interface CommunityAnalytics {
  memberCount: number;
  activeMembers: number;
  postsPerSpace: SpacePostCount[];
  commentsPerPost: PostCommentCount[];
  messagesSent: number;
  flagsRaised: number;
  flagsResolved: number;
  grantsLapsed: number;
  grantsRenewed: number;
}

export interface OverviewStats {
  publishedCourses: number;
  draftCourses: number;
  activeStudents: number;
  expiringSoon: number;
}

export interface EnrollmentPoint {
  date: string;
  count: number;
}

export interface CourseActivityEngagement {
  activityId: string;
  title: string;
  moduleId: string;
  moduleTitle: string;
  started: number;
  completed: number;
}

export interface CourseAnalytics {
  enrolled: number;
  started: number;
  completed: number;
  /** Mean of each cohort member's completed-activities percentage (0–100). */
  avgProgress: number;
  activities: CourseActivityEngagement[];
}

export interface CourseEnrollmentPoint {
  date: string;
  count: number;
}

export interface Student extends OrgUserProfile {
  /** As typed on the invite form. `name` is the composed rendering name and
   *  drifts once the person edits their own profile; these are what the admin
   *  edits. Null for anyone who arrived by self-signup. */
  firstName: string | null;
  lastName: string | null;
  entitlementCount: number;
  avgProgress: number;
  /** `invited` until they accept — the admin added them, they have not arrived. */
  status: OrgUserStatus;
  joinedAt: string;
  lastActiveAt: string | null;
}

export interface StudentCourseProgress {
  courseId: string;
  title: string;
  /** Published activities in the course. */
  totalActivities: number;
  completedActivities: number;
  /** 0–100, completed published activities over the total. */
  progress: number;
  startedAt: string | null;
  lastActivityAt: string | null;
  completedAt: string | null;
}

export interface StudentAnalytics {
  enrolled: number;
  started: number;
  completed: number;
  /** Mean of the per-course progress percentages (0–100). */
  avgProgress: number;
  courses: StudentCourseProgress[];
}

export interface StudentsQuery {
  page: number;
  pageSize: number;
  search?: string | undefined;
  sort?: string | undefined;
}

export interface Page<T> {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
}
