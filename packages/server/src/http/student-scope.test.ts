import { describe, it, expect } from "vitest";
import { resolveStudentScope, NotAStudentError } from "./student-scope.js";
import type { Container } from "../composition/container.js";
import type { FastifyRequest } from "fastify";

function container(student: { id: string } | null): Container {
  return {
    identity: { getStudentByExternalId: async () => student },
  } as unknown as Container;
}

const req = (authUser: unknown) => ({ authUser }) as unknown as FastifyRequest;

describe("resolveStudentScope", () => {
  it("resolves the domain student id from the session user", async () => {
    const scope = await resolveStudentScope(container({ id: "stu_1" }), req({ id: "ext_1" }));
    expect(scope.studentId).toBe("stu_1");
  });

  it("throws NotAStudentError when there is no session user", async () => {
    await expect(resolveStudentScope(container(null), req(undefined))).rejects.toBeInstanceOf(
      NotAStudentError,
    );
  });

  it("throws NotAStudentError when the user is not a student", async () => {
    await expect(resolveStudentScope(container(null), req({ id: "ext_x" }))).rejects.toBeInstanceOf(
      NotAStudentError,
    );
  });
});
