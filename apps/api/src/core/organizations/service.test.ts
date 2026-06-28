import { describe, it, expect } from "vitest";
import { OrganizationServiceImpl } from "./service.js";
import type { OrganizationsRepository } from "./ports.js";
import type { Organization, Membership, Invitation } from "./model.js";
import type { Role } from "./roles.js";
import type {
  ProvisionOrganizationInput,
  AddMembershipInput,
  RecordInvitationInput,
} from "./types.js";

function fakeRepo() {
  const orgs: Organization[] = [];
  const members: Membership[] = [];
  const invitations: Invitation[] = [];
  const assignments: { id: string; orgId: string; membershipId: string; courseId: string; createdAt: Date }[] = [];
  let n = 0;
  const repo: OrganizationsRepository = {
    async insertOrganization(input: ProvisionOrganizationInput) {
      const row: Organization = { id: `o${++n}`, createdAt: new Date(0), ...input };
      orgs.push(row);
      return row;
    },
    async findByAuthOrgId(authOrgId: string) {
      return orgs.find((o) => o.authOrgId === authOrgId) ?? null;
    },
    async insertMembership(orgId: string, input: AddMembershipInput) {
      const row: Membership = {
        id: `m${++n}`,
        orgId,
        studentId: input.studentId,
        role: input.role as Role,
        authMemberId: input.authMemberId,
        createdAt: new Date(0),
      };
      members.push(row);
      return row;
    },
    async deleteMembershipByAuthMemberId(authMemberId: string) {
      const i = members.findIndex((m) => m.authMemberId === authMemberId);
      if (i >= 0) members.splice(i, 1);
    },
    async insertInvitation(orgId: string, input: RecordInvitationInput) {
      const row: Invitation = {
        id: `i${++n}`,
        orgId,
        email: input.email,
        role: input.role,
        status: input.status,
        inviterStudentId: input.inviterStudentId,
        authInvitationId: input.authInvitationId,
        expiresAt: input.expiresAt,
        createdAt: new Date(0),
      };
      invitations.push(row);
      return row;
    },
    async setInvitationStatusByAuthId(authInvitationId: string, status: string) {
      const inv = invitations.find((x) => x.authInvitationId === authInvitationId);
      if (inv) (inv as { status: string }).status = status;
    },
    async insertCourseAssignment(orgId, input) {
      const row = { id: `a${++n}`, orgId, membershipId: input.membershipId, courseId: input.courseId, createdAt: new Date(0) };
      assignments.push(row);
      return row;
    },
    async deleteCourseAssignment(orgId, membershipId, courseId) {
      const i = assignments.findIndex((x) => x.orgId === orgId && x.membershipId === membershipId && x.courseId === courseId);
      if (i >= 0) assignments.splice(i, 1);
    },
    async findAssignedCourseIds(orgId, membershipId) {
      return assignments.filter((x) => x.orgId === orgId && x.membershipId === membershipId).map((x) => x.courseId);
    },
  };
  return { repo, orgs, members, invitations };
}

const orgInput: ProvisionOrganizationInput = {
  authOrgId: "org_1",
  name: "Acme",
  slug: "acme",
  ownerStudentId: "s1",
};

describe("OrganizationService", () => {
  it("provisions an org and is idempotent on the auth org id", async () => {
    const { repo, orgs } = fakeRepo();
    const svc = new OrganizationServiceImpl(repo);
    const first = await svc.provisionOrganization(orgInput);
    const second = await svc.provisionOrganization(orgInput);
    expect(second.id).toBe(first.id);
    expect(orgs).toHaveLength(1);
  });

  it("resolves the org by auth id when mirroring a membership", async () => {
    const { repo, members } = fakeRepo();
    const svc = new OrganizationServiceImpl(repo);
    const org = await svc.provisionOrganization(orgInput);
    const m = await svc.addMembership({
      authOrgId: "org_1",
      authMemberId: "mem_1",
      studentId: "s2",
      role: "member",
    });
    expect(m.orgId).toBe(org.id);
    expect(members).toHaveLength(1);
  });

  it("throws when mirroring against an unknown org", async () => {
    const { repo } = fakeRepo();
    const svc = new OrganizationServiceImpl(repo);
    await expect(
      svc.addMembership({
        authOrgId: "missing",
        authMemberId: "mem_1",
        studentId: "s2",
        role: "member",
      }),
    ).rejects.toThrow(/unknown organization/);
  });

  it("stores the membership role as a domain Role", async () => {
    const { repo } = fakeRepo();
    const svc = new OrganizationServiceImpl(repo);
    await svc.provisionOrganization(orgInput);
    const m = await svc.addMembership({
      authOrgId: "org_1",
      authMemberId: "mem_1",
      studentId: "s2",
      role: "instructor",
    });
    expect(m.role).toBe("instructor");
  });

  it("assigns and lists instructor course assignments", async () => {
    const { repo } = fakeRepo();
    const svc = new OrganizationServiceImpl(repo);
    const org = await svc.provisionOrganization(orgInput);
    const a = await svc.assignCourse({ authOrgId: "org_1", membershipId: "m1", courseId: "c1" });
    expect(a.orgId).toBe(org.id);
    expect(a.courseId).toBe("c1");
    expect(await svc.assignedCourseIds(org.id, "m1")).toEqual(["c1"]);
  });

  it("unassigns a course", async () => {
    const { repo } = fakeRepo();
    const svc = new OrganizationServiceImpl(repo);
    const org = await svc.provisionOrganization(orgInput);
    await svc.assignCourse({ authOrgId: "org_1", membershipId: "m1", courseId: "c1" });
    await svc.unassignCourse({ authOrgId: "org_1", membershipId: "m1", courseId: "c1" });
    expect(await svc.assignedCourseIds(org.id, "m1")).toEqual([]);
  });
});
