import type { Actor } from '../../shared/actor.js';
import { NotFoundError } from '../../shared/errors.js';
import { MEMBER_ROLE_KEY } from '../../organizations/index.js';
import type { EventsService } from '../../content/index.js';
import type { FileUrls } from '../../assets/index.js';
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
  OverviewStats,
  Page,
  Student,
  StudentAnalytics,
  StudentRow,
  StudentsQuery,
} from './model.js';
import type {
  AdminReportRepository,
  AdminReportService,
  PermissionsReader,
  SpaceOpenersReader,
} from './ports.js';
import { attendeeView } from '../events/index.js';

export type AdminReportServiceParams = {
  repo: AdminReportRepository;
  permissions: PermissionsReader;
  spaces: SpaceOpenersReader;
  events: Pick<EventsService, 'findEvent'>;
  fileUrls: Pick<FileUrls, 'personImage'>;
};

export class AdminReportServiceImpl implements AdminReportService {
  private readonly repo: AdminReportRepository;
  private readonly permissions: PermissionsReader;
  private readonly spaces: SpaceOpenersReader;
  private readonly events: Pick<EventsService, 'findEvent'>;
  private readonly fileUrls: Pick<FileUrls, 'personImage'>;

  constructor(params: AdminReportServiceParams) {
    this.repo = params.repo;
    this.permissions = params.permissions;
    this.spaces = params.spaces;
    this.events = params.events;
    this.fileUrls = params.fileUrls;
  }

  async overview(actor: Actor): Promise<OverviewStats> {
    actor.permissions.require('analytics:read');
    return this.repo.overview(actor.orgId);
  }

  async enrollments(days: number, actor: Actor): Promise<EnrollmentPoint[]> {
    actor.permissions.require('analytics:read');
    return this.repo.enrollments(actor.orgId, days);
  }

  async courseAnalytics(courseId: string, actor: Actor): Promise<CourseAnalytics> {
    actor.permissions.require('progress:read', courseId);
    return found(await this.repo.courseAnalytics(actor.orgId, courseId), 'Course', courseId);
  }

  async courseEnrollments(
    courseId: string,
    days: number,
    actor: Actor,
  ): Promise<CourseEnrollmentPoint[]> {
    actor.permissions.require('progress:read', courseId);
    return found(
      await this.repo.courseEnrollments(actor.orgId, courseId, days),
      'Course',
      courseId,
    );
  }

  async courseLearners(
    courseId: string,
    query: CourseLearnersQuery,
    actor: Actor,
  ): Promise<Page<CourseLearner>> {
    actor.permissions.require('progress:read', courseId);
    return found(await this.repo.courseLearners(actor.orgId, courseId, query), 'Course', courseId);
  }

  async listStudents(query: StudentsQuery, actor: Actor): Promise<Page<Student>> {
    actor.permissions.require('people:read');
    const page = await this.repo.listStudents(actor.orgId, query, MEMBER_ROLE_KEY);
    return { ...page, rows: await this.withItemRoles(actor.orgId, page.rows) };
  }

  async getStudent(id: string, actor: Actor): Promise<Student> {
    actor.permissions.require('people:read');
    const row = found(await this.repo.getStudent(actor.orgId, id), 'Student', id);
    const [student] = await this.withItemRoles(actor.orgId, [row]);
    return found(student, 'Student', id);
  }

  async studentAnalytics(id: string, actor: Actor): Promise<StudentAnalytics> {
    actor.permissions.require('people:read');
    return found(await this.repo.studentAnalytics(actor.orgId, id), 'Student', id);
  }

  async communityAnalytics(communityId: string, actor: Actor): Promise<CommunityAnalytics> {
    actor.permissions.require('communities:read', communityId);
    return found(
      await this.repo.communityAnalytics(actor.orgId, communityId),
      'Community',
      communityId,
    );
  }

  async communityMembers(
    communityId: string,
    query: CommunityMembersQuery,
    actor: Actor,
  ): Promise<Page<CommunityMember>> {
    actor.permissions.require('access:read');
    const page = found(
      await this.repo.communityMembers(actor.orgId, communityId, query),
      'Community',
      communityId,
    );
    const [held, openers] = await Promise.all([
      this.permissions.permissionsOfMany(
        actor.orgId,
        page.rows.map((row) => row.id),
      ),
      this.spaces.everySpaceOpeners(actor.orgId, communityId),
    ]);
    const opensEverySpace = new Set(openers);
    return {
      ...page,
      rows: page.rows.map((row) => {
        const permissions = held.get(row.id);
        const item = permissions?.roleOn(communityId);
        const org = permissions?.roleOn();
        const team = (item?.team ?? false) || (org?.team ?? false);
        const roleName = item?.team ? item.name : org?.team ? org.name : null;
        return { ...row, team, roleName, opensEverySpace: opensEverySpace.has(row.id) };
      }),
    };
  }

  async eventAttendees(
    eventId: string,
    query: { page: number; pageSize: number },
    actor: Actor,
  ): Promise<Page<EventAttendee>> {
    actor.permissions.require('events:read', eventId);
    found(await this.events.findEvent(eventId, actor), 'Event', eventId);
    const page = await this.repo.eventAttendees(actor.orgId, eventId, query);
    return {
      ...page,
      rows: page.rows.map((row) => attendeeView(row, this.fileUrls)),
    };
  }

  async eventAnalytics(eventId: string, actor: Actor): Promise<EventAnalytics> {
    actor.permissions.require('events:read', eventId);
    const event = found(await this.events.findEvent(eventId, actor), 'Event', eventId);
    const figures = await this.repo.eventAnalytics(actor.orgId, eventId, event.startsAt);
    return { ...figures, capacity: event.settings.capacity };
  }

  private async withItemRoles(orgId: string, rows: StudentRow[]): Promise<Student[]> {
    const ids = rows.filter((row) => row.items.length > 0).map((row) => row.id);
    const held = ids.length > 0 ? await this.permissions.permissionsOfMany(orgId, ids) : new Map();
    return rows.map((row) => ({
      ...row,
      items: row.items.flatMap((item) => {
        const role = held.get(row.id)?.roleOn(item.contentId);
        return role ? [{ ...item, roleKey: role.key, roleName: role.name }] : [];
      }),
    }));
  }
}

function found<T>(value: T | null | undefined, what: string, id: string): T {
  if (value === null || value === undefined) {
    throw new NotFoundError(what, id);
  }
  return value;
}
