import type { Actor } from '../../shared/actor.js';
import { MEMBER_ROLE_KEY } from '../../organizations/index.js';
import type {
  CommunityAnalytics,
  CommunityMember,
  CommunityMembersQuery,
  CourseAnalytics,
  CourseEnrollmentPoint,
  EnrollmentPoint,
  OverviewStats,
  Page,
  Student,
  StudentAnalytics,
  StudentRow,
  StudentsQuery,
} from './model.js';
import type { AdminReportRepository, AdminReportService, PermissionsReader } from './ports.js';

export type AdminReportServiceParams = {
  repo: AdminReportRepository;
  permissions: PermissionsReader;
};

export class AdminReportServiceImpl implements AdminReportService {
  private readonly repo: AdminReportRepository;
  private readonly permissions: PermissionsReader;

  constructor(params: AdminReportServiceParams) {
    this.repo = params.repo;
    this.permissions = params.permissions;
  }

  async overview(actor: Actor): Promise<OverviewStats> {
    actor.permissions.require('analytics:read');
    return this.repo.overview(actor.orgId);
  }

  async enrollments(days: number, actor: Actor): Promise<EnrollmentPoint[]> {
    actor.permissions.require('analytics:read');
    return this.repo.enrollments(actor.orgId, days);
  }

  async courseAnalytics(courseId: string, actor: Actor): Promise<CourseAnalytics | null> {
    actor.permissions.require('progress:read', courseId);
    return this.repo.courseAnalytics(actor.orgId, courseId);
  }

  async courseEnrollments(
    courseId: string,
    days: number,
    actor: Actor,
  ): Promise<CourseEnrollmentPoint[] | null> {
    actor.permissions.require('progress:read', courseId);
    return this.repo.courseEnrollments(actor.orgId, courseId, days);
  }

  async listStudents(query: StudentsQuery, actor: Actor): Promise<Page<Student>> {
    actor.permissions.require('people:read');
    const page = await this.repo.listStudents(actor.orgId, query, MEMBER_ROLE_KEY);
    return { ...page, rows: await this.withItemRoles(actor.orgId, page.rows) };
  }

  async getStudent(id: string, actor: Actor): Promise<Student | null> {
    actor.permissions.require('people:read');
    const row = await this.repo.getStudent(actor.orgId, id);
    if (!row) {
      return null;
    }
    const [student] = await this.withItemRoles(actor.orgId, [row]);
    return student ?? null;
  }

  async studentAnalytics(id: string, actor: Actor): Promise<StudentAnalytics | null> {
    actor.permissions.require('people:read');
    return this.repo.studentAnalytics(actor.orgId, id);
  }

  async communityAnalytics(communityId: string, actor: Actor): Promise<CommunityAnalytics | null> {
    actor.permissions.require('communities:read', communityId);
    return this.repo.communityAnalytics(actor.orgId, communityId);
  }

  async communityMembers(
    communityId: string,
    query: CommunityMembersQuery,
    actor: Actor,
  ): Promise<Page<CommunityMember> | null> {
    actor.permissions.require('access:read');
    const page = await this.repo.communityMembers(actor.orgId, communityId, query);
    if (!page) {
      return null;
    }
    const held = await this.permissions.permissionsOfMany(
      actor.orgId,
      page.rows.map((row) => row.id),
    );
    return {
      ...page,
      rows: page.rows.map((row) => {
        const role = held.get(row.id)?.roleOn(communityId);
        const team = role?.team ?? false;
        return { ...row, team, roleName: team ? (role?.name ?? null) : null };
      }),
    };
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
