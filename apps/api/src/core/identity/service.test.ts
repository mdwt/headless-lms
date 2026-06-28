import { describe, it, expect } from "vitest";
import { IdentityServiceImpl } from "./service.js";
import type { IdentityRepository } from "./ports.js";
import type { Student } from "./model.js";
import type { RegisterStudentInput } from "./types.js";

function fakeRepo() {
  const rows: Student[] = [];
  let n = 0;
  const repo: IdentityRepository = {
    async insert(input: RegisterStudentInput) {
      const row: Student = { id: `s${++n}`, createdAt: new Date(0), ...input };
      rows.push(row);
      return row;
    },
    async findByAuthUserId(authUserId: string) {
      return rows.find((r) => r.authUserId === authUserId) ?? null;
    },
  };
  return { repo, rows };
}

describe("IdentityService.registerStudent", () => {
  const input: RegisterStudentInput = {
    authUserId: "auth_1",
    email: "a@example.com",
    displayName: "Ada",
  };

  it("creates a student for a new auth user", async () => {
    const { repo, rows } = fakeRepo();
    const student = await new IdentityServiceImpl(repo).registerStudent(input);
    expect(student.authUserId).toBe("auth_1");
    expect(rows).toHaveLength(1);
  });

  it("is idempotent — a repeat sync does not create a duplicate", async () => {
    const { repo, rows } = fakeRepo();
    const svc = new IdentityServiceImpl(repo);
    const first = await svc.registerStudent(input);
    const second = await svc.registerStudent(input);
    expect(second.id).toBe(first.id);
    expect(rows).toHaveLength(1);
  });
});
