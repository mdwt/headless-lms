// Tests for MCP tools (Slice C).
//
// Strategy: rather than driving the full MCP JSON-RPC protocol (which requires
// a multi-round initialization handshake), we test the registered tool callbacks
// directly. A minimal McpServer stub captures each registerTool call so tests
// can invoke the callbacks in isolation with controlled principals and container
// mocks. This verifies the authorization and delegation logic without requiring
// a live transport or network.
import { describe, it, expect, vi, type Mock } from "vitest";
import { registerTools } from "./tools.js";
import type { McpPrincipal } from "./authz.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Container } from "../../composition/container.js";
import type { Course } from "../../core/content/index.js";
import type { Entitlement } from "../../core/entitlements/model.js";
import type { Student } from "../../reporting/students/model.js";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const COURSE: Course = {
  id: "course-1",
  title: "Intro to TypeScript",
  slug: "intro-to-typescript",
  description: "Learn TypeScript",
  status: "published",
  category: "Engineering",
  moduleCount: 3,
  activityCount: 12,
  enrolledCount: 5,
  updatedAt: "2026-01-01T00:00:00Z",
  createdAt: "2026-01-01T00:00:00Z",
};

const ENROLLMENT: Entitlement = {
  id: "enroll-1",
  studentId: "student-1",
  firstName: "Bob",
  lastName: "Smith",
  studentEmail: "bob@example.com",
  courseId: "course-1",
  courseTitle: "Intro to TypeScript",
  status: "active",
  grantedAt: "2026-01-01T00:00:00Z",
  expiresAt: null,
  source: "manual",
};

const STUDENT: Student = {
  id: "student-1",
  name: "Bob",
  email: "bob@example.com",
  enrollmentCount: 3,
  avgProgress: 65,
  joinedAt: "2026-01-01T00:00:00Z",
  lastActiveAt: "2026-06-01T00:00:00Z",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

type ToolCallback = (args: Record<string, unknown>) => Promise<{
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}>;

/**
 * Creates a minimal McpServer stub that captures tool callbacks keyed by name.
 * Returns both the stub and the callback map so tests can invoke tools directly.
 */
function makeStubServer(): {
  server: McpServer;
  callbacks: Map<string, ToolCallback>;
} {
  const callbacks = new Map<string, ToolCallback>();
  const server = {
    registerTool: (_name: string, _config: unknown, cb: ToolCallback) => {
      callbacks.set(_name, cb);
    },
  } as unknown as McpServer;
  return { server, callbacks };
}

/** Builds a mock container with vi.fn() stubs for courses, entitlements, and the
 *  reporting students read model. */
function makeContainer(overrides?: {
  coursesListResult?: Awaited<ReturnType<Container["content"]["list"]>>;
  coursesGetResult?: Course | null;
  enrollmentsListResult?: Awaited<ReturnType<Container["entitlements"]["list"]>>;
  enrollmentsGrantResult?: Entitlement;
  studentsGetResult?: Student | null;
}): Container {
  // Use explicit key-presence check so callers can pass null intentionally.
  const coursesGetResult =
    overrides && "coursesGetResult" in overrides ? overrides.coursesGetResult : COURSE;
  const studentsGetResult =
    overrides && "studentsGetResult" in overrides ? overrides.studentsGetResult : STUDENT;
  return {
    content: {
      list: vi.fn().mockResolvedValue(
        overrides?.coursesListResult ?? { rows: [COURSE], total: 1, page: 1, pageSize: 20 },
      ),
      get: vi.fn().mockResolvedValue(coursesGetResult),
      create: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
    },
    entitlements: {
      list: vi.fn().mockResolvedValue(
        overrides?.enrollmentsListResult ?? { rows: [ENROLLMENT], total: 1, page: 1, pageSize: 20 },
      ),
      grant: vi.fn().mockResolvedValue(overrides?.enrollmentsGrantResult ?? ENROLLMENT),
      setStatus: vi.fn(),
    },
    reporting: {
      students: {
        list: vi.fn(),
        get: vi.fn().mockResolvedValue(studentsGetResult),
      },
      dashboard: {} as Container["reporting"]["dashboard"],
    },
    // Other services not exercised by these tools
    identity: {} as Container["identity"],
    organizations: {} as Container["organizations"],
    progress: {} as Container["progress"],
    assets: {} as Container["assets"],
    auth: {} as Container["auth"],
    storage: {} as Container["storage"],
  } as unknown as Container;
}

/** Admin principal with all read+write scopes including progress:read. */
const ADMIN_PRINCIPAL: McpPrincipal = {
  studentId: "student-admin",
  orgId: "org-1",
  role: "admin",
  assignedCourseIds: [],
  scopes: ["courses:read", "courses:write", "enrollments:read", "enrollments:write", "progress:read"],
};

/** Low-privilege member (instructor) with only read scopes. */
const STUDENT_PRINCIPAL: McpPrincipal = {
  studentId: "student-1",
  orgId: "org-1",
  role: "instructor",
  assignedCourseIds: [],
  scopes: ["courses:read", "enrollments:read"],
};

/** Instructor principal with read scopes and course assignment. */
const INSTRUCTOR_PRINCIPAL: McpPrincipal = {
  studentId: "student-inst",
  orgId: "org-1",
  role: "instructor",
  assignedCourseIds: ["course-1"],
  scopes: ["courses:read", "enrollments:read"],
};

/** No-scope principal (simulates a token with no scopes granted). */
const NO_SCOPE_PRINCIPAL: McpPrincipal = {
  studentId: "student-noscope",
  orgId: "org-1",
  role: "admin",
  assignedCourseIds: [],
  scopes: [],
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("registerTools — list_courses", () => {
  it("returns course list for an admin with courses:read scope", async () => {
    const container = makeContainer();
    const { server, callbacks } = makeStubServer();
    registerTools(server, container, ADMIN_PRINCIPAL);

    const listCourses = callbacks.get("list_courses")!;
    const result = await listCourses({ page: 1, pageSize: 20 });

    expect(result.isError).toBeFalsy();
    expect(result.content[0]!.type).toBe("text");
    const parsed = JSON.parse(result.content[0]!.text);
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0].id).toBe("course-1");
    expect((container.content.list as Mock)).toHaveBeenCalledWith("org-1", {
      page: 1,
      pageSize: 20,
      search: undefined,
      status: undefined,
    });
  });

  it("returns course list for a student with courses:read scope (scope-only gate)", async () => {
    // After the fix, any org member with courses:read may read the catalog.
    const container = makeContainer();
    const { server, callbacks } = makeStubServer();
    registerTools(server, container, STUDENT_PRINCIPAL);

    const listCourses = callbacks.get("list_courses")!;
    const result = await listCourses({ page: 1, pageSize: 20 });

    expect(result.isError).toBeFalsy();
    expect((container.content.list as Mock)).toHaveBeenCalled();
  });

  it("rejects a principal with no scopes even if role would allow it", async () => {
    const container = makeContainer();
    const { server, callbacks } = makeStubServer();
    registerTools(server, container, NO_SCOPE_PRINCIPAL);

    const listCourses = callbacks.get("list_courses")!;
    const result = await listCourses({ page: 1, pageSize: 20 });

    expect(result.isError).toBe(true);
    expect((container.content.list as Mock)).not.toHaveBeenCalled();
  });
});

describe("registerTools — get_course", () => {
  it("returns a course for an authorized admin", async () => {
    const container = makeContainer();
    const { server, callbacks } = makeStubServer();
    registerTools(server, container, ADMIN_PRINCIPAL);

    const getCourse = callbacks.get("get_course")!;
    const result = await getCourse({ id: "course-1" });

    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(result.content[0]!.text);
    expect(parsed.id).toBe("course-1");
  });

  it("returns isError when course is not found", async () => {
    const container = makeContainer({ coursesGetResult: null });
    const { server, callbacks } = makeStubServer();
    registerTools(server, container, ADMIN_PRINCIPAL);

    const getCourse = callbacks.get("get_course")!;
    const result = await getCourse({ id: "nonexistent" });

    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toMatch(/not found/);
  });

  it("returns a course for a student with courses:read scope (scope-only gate)", async () => {
    // After the fix, any org member with courses:read may read the catalog.
    const container = makeContainer();
    const { server, callbacks } = makeStubServer();
    registerTools(server, container, STUDENT_PRINCIPAL);

    const getCourse = callbacks.get("get_course")!;
    const result = await getCourse({ id: "course-1" });

    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(result.content[0]!.text);
    expect(parsed.id).toBe("course-1");
  });

  it("rejects a principal with no courses:read scope", async () => {
    const container = makeContainer();
    const { server, callbacks } = makeStubServer();
    registerTools(server, container, NO_SCOPE_PRINCIPAL);

    const getCourse = callbacks.get("get_course")!;
    const result = await getCourse({ id: "course-1" });

    expect(result.isError).toBe(true);
    expect((container.content.get as Mock)).not.toHaveBeenCalled();
  });
});

describe("registerTools — enroll_student", () => {
  it("enrolls a student when called by an admin with enrollments:write scope", async () => {
    const container = makeContainer();
    const { server, callbacks } = makeStubServer();
    registerTools(server, container, ADMIN_PRINCIPAL);

    const enroll = callbacks.get("enroll_student")!;
    const result = await enroll({ studentId: "student-1", courseId: "course-1", expiresAt: null });

    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(result.content[0]!.text);
    expect(parsed.id).toBe("enroll-1");
    expect((container.entitlements.grant as Mock)).toHaveBeenCalledWith("org-1", {
      studentId: "student-1",
      courseId: "course-1",
      expiresAt: null,
    });
  });

  it("rejects an instructor role (lacks manage_users permission)", async () => {
    const container = makeContainer();
    const { server, callbacks } = makeStubServer();
    // Give the instructor the right scope but a role lacking manage_users
    const studentWithWriteScope: McpPrincipal = {
      ...STUDENT_PRINCIPAL,
      scopes: [...STUDENT_PRINCIPAL.scopes, "enrollments:write"],
    };
    registerTools(server, container, studentWithWriteScope);

    const enroll = callbacks.get("enroll_student")!;
    const result = await enroll({ studentId: "student-1", courseId: "course-1", expiresAt: null });

    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toMatch(/Forbidden/);
    expect((container.entitlements.grant as Mock)).not.toHaveBeenCalled();
  });

  it("rejects an admin principal that lacks the enrollments:write scope", async () => {
    const container = makeContainer();
    const { server, callbacks } = makeStubServer();
    const adminNoWriteScope: McpPrincipal = {
      ...ADMIN_PRINCIPAL,
      scopes: ["courses:read", "enrollments:read"], // no enrollments:write
    };
    registerTools(server, container, adminNoWriteScope);

    const enroll = callbacks.get("enroll_student")!;
    const result = await enroll({ studentId: "student-1", courseId: "course-1", expiresAt: null });

    expect(result.isError).toBe(true);
    expect((container.entitlements.grant as Mock)).not.toHaveBeenCalled();
  });
});

describe("registerTools — list_enrollments", () => {
  it("allows admin to list all enrollments", async () => {
    const container = makeContainer();
    const { server, callbacks } = makeStubServer();
    registerTools(server, container, ADMIN_PRINCIPAL);

    const listEnrollments = callbacks.get("list_enrollments")!;
    const result = await listEnrollments({ studentId: "student-1", page: 1, pageSize: 20 });

    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(result.content[0]!.text);
    expect(parsed.rows).toHaveLength(1);
  });

  it("allows instructor to list all enrollments (view_student_progress: assigned)", async () => {
    // Instructors have capability "assigned" for view_student_progress which is !== false,
    // so canViewAll is true when enrollments:read scope is present.
    const container = makeContainer();
    const { server, callbacks } = makeStubServer();
    registerTools(server, container, INSTRUCTOR_PRINCIPAL);

    const listEnrollments = callbacks.get("list_enrollments")!;
    const result = await listEnrollments({ page: 1, pageSize: 20 });

    expect(result.isError).toBeFalsy();
    expect((container.entitlements.list as Mock)).toHaveBeenCalled();
  });

  it("lists enrollments org-wide (no studentId filter) when studentId not given", async () => {
    const container = makeContainer();
    const { server, callbacks } = makeStubServer();
    registerTools(server, container, STUDENT_PRINCIPAL);

    const listEnrollments = callbacks.get("list_enrollments")!;
    const result = await listEnrollments({ page: 1, pageSize: 20 });

    expect(result.isError).toBeFalsy();
    expect((container.entitlements.list as Mock)).toHaveBeenCalledWith(
      "org-1",
      expect.objectContaining({ studentId: undefined }),
    );
  });
});

describe("registerTools — get_student_progress", () => {
  it("returns progress summary for an admin with progress:read scope", async () => {
    const container = makeContainer();
    const { server, callbacks } = makeStubServer();
    registerTools(server, container, ADMIN_PRINCIPAL);

    const getProgress = callbacks.get("get_student_progress")!;
    const result = await getProgress({ studentId: "student-1" });

    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(result.content[0]!.text);
    expect(parsed.studentId).toBe("student-1");
    expect(parsed.avgProgress).toBe(65);
    expect(parsed.enrollmentCount).toBe(3);
    expect((container.reporting.students.get as Mock)).toHaveBeenCalledWith("org-1", "student-1");
  });

  it("returns isError when student is not found", async () => {
    const container = makeContainer({ studentsGetResult: null });
    const { server, callbacks } = makeStubServer();
    registerTools(server, container, ADMIN_PRINCIPAL);

    const getProgress = callbacks.get("get_student_progress")!;
    const result = await getProgress({ studentId: "nonexistent" });

    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toMatch(/not found/);
  });

  it("rejects a principal without progress:read scope", async () => {
    const container = makeContainer();
    const { server, callbacks } = makeStubServer();
    const adminNoProgressScope: McpPrincipal = {
      ...ADMIN_PRINCIPAL,
      scopes: ["courses:read", "enrollments:read"], // no progress:read
    };
    registerTools(server, container, adminNoProgressScope);

    const getProgress = callbacks.get("get_student_progress")!;
    const result = await getProgress({ studentId: "student-1" });

    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toMatch(/Forbidden/);
    expect((container.reporting.students.get as Mock)).not.toHaveBeenCalled();
  });

  it("rejects an instructor (view_student_progress is assigned, not true — owner/admin only)", async () => {
    const container = makeContainer();
    const { server, callbacks } = makeStubServer();
    const instructorWithProgressScope: McpPrincipal = {
      ...INSTRUCTOR_PRINCIPAL,
      scopes: [...INSTRUCTOR_PRINCIPAL.scopes, "progress:read"],
    };
    registerTools(server, container, instructorWithProgressScope);

    const getProgress = callbacks.get("get_student_progress")!;
    const result = await getProgress({ studentId: "student-1" });

    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toMatch(/Forbidden/);
    expect((container.reporting.students.get as Mock)).not.toHaveBeenCalled();
  });
});
