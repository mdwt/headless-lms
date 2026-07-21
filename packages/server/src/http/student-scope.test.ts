import { describe, it, expect } from "vitest";
import { resolveStudentScope, NoStudentError } from "./student-scope.js";
import { UnknownPortalOrgError } from "./portal-org.js";
import type { Container } from "../composition/container.js";
import type { FastifyRequest } from "fastify";

function container(opts: {
  student?: { id: string } | null;
  org?: { id: string } | null;
}): Container {
  return {
    identity: { getStudentByExternalId: async () => opts.student ?? null },
    organizations: { getBySlug: async () => opts.org ?? null },
  } as unknown as Container;
}

const req = (authUser: unknown, slug = "acme") =>
  ({ authUser, headers: { "x-portal-org": slug } }) as unknown as FastifyRequest;

describe("resolveStudentScope", () => {
  it("resolves { studentId, orgId } from the session user and portal org", async () => {
    const scope = await resolveStudentScope(
      container({ student: { id: "stu_1" }, org: { id: "org_1" } }),
      req({ id: "ext_1" }),
    );
    expect(scope).toEqual({ studentId: "stu_1", orgId: "org_1" });
  });

  it("throws NoStudentError when there is no session user", async () => {
    await expect(
      resolveStudentScope(container({ org: { id: "org_1" } }), req(undefined)),
    ).rejects.toBeInstanceOf(NoStudentError);
  });

  it("throws UnknownPortalOrgError when the portal org does not resolve", async () => {
    await expect(
      resolveStudentScope(container({ org: null }), req({ id: "ext_1" })),
    ).rejects.toBeInstanceOf(UnknownPortalOrgError);
  });

  it("throws NoStudentError when the user is not a student in the org", async () => {
    await expect(
      resolveStudentScope(container({ student: null, org: { id: "org_1" } }), req({ id: "ext_x" })),
    ).rejects.toBeInstanceOf(NoStudentError);
  });
});
