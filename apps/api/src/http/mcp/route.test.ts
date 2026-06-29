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
import type { Course } from "../../core/courses/model.js";
import type { Enrollment } from "../../core/enrollments/model.js";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const COURSE: Course = {
  id: "course-1",
  title: "Intro to TypeScript",
  slug: "intro-to-typescript",
  description: "Learn TypeScript",
  status: "published",
  category: "Engineering",
  instructorId: "inst-1",
  instructorName: "Alice",
  moduleCount: 3,
  lessonCount: 12,
  enrolledCount: 5,
  updatedAt: "2026-01-01T00:00:00Z",
  createdAt: "2026-01-01T00:00:00Z",
};

const ENROLLMENT: Enrollment = {
  id: "enroll-1",
  studentId: "student-1",
  studentName: "Bob",
  studentEmail: "bob@example.com",
  courseId: "course-1",
  courseTitle: "Intro to TypeScript",
  status: "active",
  progressPercent: 0,
  grantedAt: "2026-01-01T00:00:00Z",
  expiresAt: null,
  source: "manual",
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

/** Builds a mock container with vi.fn() stubs for courses and enrollments. */
function makeContainer(overrides?: {
  coursesListResult?: Awaited<ReturnType<Container["courses"]["list"]>>;
  coursesGetResult?: Course | null;
  enrollmentsListResult?: Awaited<ReturnType<Container["enrollments"]["list"]>>;
  enrollmentsGrantResult?: Enrollment;
}): Container {
  // Use explicit key-presence check so callers can pass null intentionally.
  const coursesGetResult =
    overrides && "coursesGetResult" in overrides ? overrides.coursesGetResult : COURSE;
  return {
    courses: {
      list: vi.fn().mockResolvedValue(
        overrides?.coursesListResult ?? { rows: [COURSE], total: 1, page: 1, pageSize: 20 },
      ),
      get: vi.fn().mockResolvedValue(coursesGetResult),
      create: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
    },
    enrollments: {
      list: vi.fn().mockResolvedValue(
        overrides?.enrollmentsListResult ?? { rows: [ENROLLMENT], total: 1, page: 1, pageSize: 20 },
      ),
      grant: vi.fn().mockResolvedValue(overrides?.enrollmentsGrantResult ?? ENROLLMENT),
      setStatus: vi.fn(),
    },
    // Other services not exercised by these tools
    identity: {} as Container["identity"],
    organizations: {} as Container["organizations"],
    students: {} as Container["students"],
    entitlements: {} as Container["entitlements"],
    offers: {} as Container["offers"],
    billing: {} as Container["billing"],
    progress: {} as Container["progress"],
    team: {} as Container["team"],
    dashboard: {} as Container["dashboard"],
    modules: {} as Container["modules"],
    assets: {} as Container["assets"],
    auth: {} as Container["auth"],
    storage: {} as Container["storage"],
  } as unknown as Container;
}

/** Admin principal with all read+write scopes. */
const ADMIN_PRINCIPAL: McpPrincipal = {
  studentId: "student-admin",
  orgId: "org-1",
  role: "admin",
  assignedCourseIds: [],
  scopes: ["courses:read", "courses:write", "enrollments:read", "enrollments:write"],
};

/** Student principal with only read scopes. */
const STUDENT_PRINCIPAL: McpPrincipal = {
  studentId: "student-1",
  orgId: "org-1",
  role: "student",
  assignedCourseIds: [],
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
    expect((container.courses.list as Mock)).toHaveBeenCalledWith({
      page: 1,
      pageSize: 20,
      search: undefined,
      status: undefined,
    });
  });

  it("rejects a student principal (lacks view_student_progress permission)", async () => {
    const container = makeContainer();
    const { server, callbacks } = makeStubServer();
    registerTools(server, container, STUDENT_PRINCIPAL);

    const listCourses = callbacks.get("list_courses")!;
    const result = await listCourses({ page: 1, pageSize: 20 });

    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toMatch(/Forbidden/);
    expect((container.courses.list as Mock)).not.toHaveBeenCalled();
  });

  it("rejects a principal with no scopes even if role would allow it", async () => {
    const container = makeContainer();
    const { server, callbacks } = makeStubServer();
    registerTools(server, container, NO_SCOPE_PRINCIPAL);

    const listCourses = callbacks.get("list_courses")!;
    const result = await listCourses({ page: 1, pageSize: 20 });

    expect(result.isError).toBe(true);
    expect((container.courses.list as Mock)).not.toHaveBeenCalled();
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

  it("rejects unauthorized student", async () => {
    const container = makeContainer();
    const { server, callbacks } = makeStubServer();
    registerTools(server, container, STUDENT_PRINCIPAL);

    const getCourse = callbacks.get("get_course")!;
    const result = await getCourse({ id: "course-1" });

    expect(result.isError).toBe(true);
    expect((container.courses.get as Mock)).not.toHaveBeenCalled();
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
    expect((container.enrollments.grant as Mock)).toHaveBeenCalledWith({
      studentId: "student-1",
      courseId: "course-1",
      expiresAt: null,
    });
  });

  it("rejects a student role (lacks manage_users permission)", async () => {
    const container = makeContainer();
    const { server, callbacks } = makeStubServer();
    // Give student the right scope but wrong role
    const studentWithWriteScope: McpPrincipal = {
      ...STUDENT_PRINCIPAL,
      scopes: [...STUDENT_PRINCIPAL.scopes, "enrollments:write"],
    };
    registerTools(server, container, studentWithWriteScope);

    const enroll = callbacks.get("enroll_student")!;
    const result = await enroll({ studentId: "student-1", courseId: "course-1", expiresAt: null });

    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toMatch(/Forbidden/);
    expect((container.enrollments.grant as Mock)).not.toHaveBeenCalled();
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
    expect((container.enrollments.grant as Mock)).not.toHaveBeenCalled();
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

  it("scopes student to their own enrollments when studentId not given", async () => {
    const container = makeContainer();
    const { server, callbacks } = makeStubServer();
    // Student has consume_content via enrolled, and enrollments:read scope
    registerTools(server, container, STUDENT_PRINCIPAL);

    const listEnrollments = callbacks.get("list_enrollments")!;
    const result = await listEnrollments({ page: 1, pageSize: 20 });

    expect(result.isError).toBeFalsy();
    expect((container.enrollments.list as Mock)).toHaveBeenCalledWith(
      expect.objectContaining({ studentId: "student-1" }),
    );
  });
});
