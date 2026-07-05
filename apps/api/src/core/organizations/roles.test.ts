import { describe, it, expect } from "vitest";
import { ROLES, isRole, parseRole, capability, canForCourse, normalizeRole } from "./roles.js";

describe("roles", () => {
  it("exposes the three roles", () => {
    expect([...ROLES]).toEqual(["owner", "admin", "instructor"]);
  });

  it("parseRole accepts a known role and rejects an unknown one", () => {
    expect(parseRole("instructor")).toBe("instructor");
    expect(isRole("member")).toBe(false);
    expect(() => parseRole("member")).toThrow(/unknown role/);
  });

  it("capability reflects the permission matrix", () => {
    expect(capability("owner", "manage_billing")).toBe(true);
    expect(capability("admin", "manage_billing")).toBe(false);
    expect(capability("instructor", "edit_assigned_course")).toBe("assigned");
    expect(capability("instructor", "manage_users")).toBe(false);
    expect(capability("instructor", "create_course")).toBe(false);
  });

  it("canForCourse resolves unconditional and assigned scopes", () => {
    expect(
      canForCourse("admin", "view_student_progress", { assignedCourseIds: [], courseId: "c1" }),
    ).toBe(true);
    expect(
      canForCourse("instructor", "edit_assigned_course", {
        assignedCourseIds: ["c1"],
        courseId: "c1",
      }),
    ).toBe(true);
    expect(
      canForCourse("instructor", "edit_assigned_course", {
        assignedCourseIds: ["c2"],
        courseId: "c1",
      }),
    ).toBe(false);
    expect(
      canForCourse("instructor", "manage_users", { assignedCourseIds: [], courseId: "c1" }),
    ).toBe(false);
  });
});

describe("normalizeRole", () => {
  it("passes through known single roles", () => {
    expect(normalizeRole("owner")).toBe("owner");
    expect(normalizeRole("instructor")).toBe("instructor");
  });
  it("maps Better Auth's member to instructor", () => {
    expect(normalizeRole("member")).toBe("instructor");
  });
  it("collapses a multi-role string to the highest-privilege role", () => {
    expect(normalizeRole("admin,instructor")).toBe("admin");
    expect(normalizeRole("instructor,owner")).toBe("owner");
  });
  it("maps an unknown role to instructor", () => {
    expect(normalizeRole("superuser")).toBe("instructor");
  });
});
