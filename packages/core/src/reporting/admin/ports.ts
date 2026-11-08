// reporting/admin — ports.
import type { Actor, EffectivePermissions } from '../../shared/actor.js';
import type { OrgUserProfile } from '../../types/index.js';
import type {
  CommunityAnalytics,
  CommunityMember,
  CommunityMembersQuery,
  CourseAnalytics,
  CourseEnrollmentPoint,
  CourseLearner,
  CourseLearnersQuery,
  EnrollmentPoint,
  EventAnalytics,
  EventAttendee,
  EventAttendeeRow,
  OverviewStats,
  Page,
  Student,
  StudentAnalytics,
  StudentRow,
  StudentsQuery,
} from './model.js';

export interface AdminReportService {
  overview(actor: Actor): Promise<OverviewStats>;
  enrollments(days: number, actor: Actor): Promise<EnrollmentPoint[]>;
  courseAnalytics(courseId: string, actor: Actor): Promise<CourseAnalytics>;
  courseEnrollments(courseId: string, days: number, actor: Actor): Promise<CourseEnrollmentPoint[]>;
  courseLearners(
    courseId: string,
    query: CourseLearnersQuery,
    actor: Actor,
  ): Promise<Page<CourseLearner>>;
  listStudents(query: StudentsQuery, actor: Actor): Promise<Page<Student>>;
  getStudent(id: string, actor: Actor): Promise<Student>;
  studentAnalytics(id: string, actor: Actor): Promise<StudentAnalytics>;
  communityAnalytics(communityId: string, actor: Actor): Promise<CommunityAnalytics>;
  communityMembers(
    communityId: string,
    query: CommunityMembersQuery,
    actor: Actor,
  ): Promise<Page<CommunityMember>>;
  eventAttendees(
    eventId: string,
    query: { page: number; pageSize: number },
    actor: Actor,
  ): Promise<Page<EventAttendee>>;
  eventAnalytics(eventId: string, actor: Actor): Promise<EventAnalytics>;
}

export interface PermissionsReader {
  permissionsOfMany(
    orgId: string,
    orgUserIds: string[],
  ): Promise<Map<string, EffectivePermissions>>;
}

export interface SpaceOpenersReader {
  everySpaceOpeners(orgId: string, communityId: string): Promise<string[]>;
}

export interface AdminReportRepository {
  overview(orgId: string): Promise<OverviewStats>;
  enrollments(orgId: string, days: number): Promise<EnrollmentPoint[]>;
  courseAnalytics(orgId: string, courseId: string): Promise<CourseAnalytics | null>;
  courseEnrollments(
    orgId: string,
    courseId: string,
    days: number,
  ): Promise<CourseEnrollmentPoint[] | null>;
  courseLearners(
    orgId: string,
    courseId: string,
    query: CourseLearnersQuery,
  ): Promise<Page<CourseLearner> | null>;
  /** Active and invited org users whose org role is `memberRoleKey`: no org assignment,
   *  and for an invited one, a pending invite carrying that key. */
  listStudents(
    orgId: string,
    query: StudentsQuery,
    memberRoleKey: string,
  ): Promise<Page<StudentRow>>;
  getStudent(orgId: string, id: string): Promise<StudentRow | null>;
  studentAnalytics(orgId: string, id: string): Promise<StudentAnalytics | null>;
  communityAnalytics(orgId: string, communityId: string): Promise<CommunityAnalytics | null>;
  communityMembers(
    orgId: string,
    communityId: string,
    query: CommunityMembersQuery,
  ): Promise<Page<OrgUserProfile> | null>;
  /** The people attending an event, directly or through a bundle, by grant date. */
  eventAttendees(
    orgId: string,
    eventId: string,
    page: { page: number; pageSize: number },
  ): Promise<Page<EventAttendeeRow>>;
  /** The event's figures; grants over time counts the grants made before `startsAt`. */
  eventAnalytics(
    orgId: string,
    eventId: string,
    startsAt: Date,
  ): Promise<Omit<EventAnalytics, 'capacity'>>;
}
