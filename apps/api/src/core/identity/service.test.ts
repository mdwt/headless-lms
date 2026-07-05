import { describe, it, expect } from "vitest";
import { IdentityServiceImpl } from "./service.js";
import type { IdentityRepository } from "./ports.js";
import type { Student, User } from "./model.js";
import type { RegisterStudentInput, RegisterUserInput } from "./types.js";

function fakeRepo() {
  const students: Student[] = [];
  const users: User[] = [];
  let n = 0;
  const repo: IdentityRepository = {
    async insertUser(input: RegisterUserInput) {
      const row: User = { id: `u${++n}`, createdAt: new Date(0), updatedAt: new Date(0), ...input };
      users.push(row);
      return row;
    },
    async findUserByExternalId(externalId: string) {
      return users.find((r) => r.externalId === externalId) ?? null;
    },
    async insertStudent(input: RegisterStudentInput) {
      const row: Student = {
        id: `s${++n}`,
        createdAt: new Date(0),
        updatedAt: new Date(0),
        ...input,
      };
      students.push(row);
      return row;
    },
    async findStudentByExternalId(externalId: string) {
      return students.find((r) => r.externalId === externalId) ?? null;
    },
  };
  return { repo, rows: students };
}

describe("IdentityService.registerStudent", () => {
  const input: RegisterStudentInput = {
    externalId: "auth_1",
    email: "a@example.com",
    firstName: "Ada",
    lastName: "Lovelace",
  };

  it("creates a student for a new auth user", async () => {
    const { repo, rows } = fakeRepo();
    const student = await new IdentityServiceImpl(repo).registerStudent(input);
    expect(student.externalId).toBe("auth_1");
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
