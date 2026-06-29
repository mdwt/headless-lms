// MCP tool registrations — v1 surface.
// Each tool authorizes via authz.ts, then delegates to a core domain service.
// No business logic lives here: the HTTP/MCP layer only translates + guards.
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Container } from "../../composition/container.js";
import { authorize, type McpPrincipal } from "./authz.js";
import { capability } from "../../core/organizations/index.js";

/** Wraps an authorization failure as an MCP error content response. */
function forbidden(): { content: [{ type: "text"; text: string }]; isError: true } {
  return {
    content: [{ type: "text" as const, text: "Forbidden: insufficient scope or role" }],
    isError: true,
  };
}

/** Wraps a not-found result as an MCP error content response. */
function notFound(kind: string, id: string): { content: [{ type: "text"; text: string }]; isError: true } {
  return {
    content: [{ type: "text" as const, text: `${kind} not found: ${id}` }],
    isError: true,
  };
}

/** Returns a generic opaque error — do NOT include thrown message. */
function internalError(): { content: [{ type: "text"; text: string }]; isError: true } {
  return {
    content: [{ type: "text" as const, text: "internal error" }],
    isError: true,
  };
}

/** Serializes a value to a JSON text content block. */
function json(value: unknown): { content: [{ type: "text"; text: string }] } {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
  };
}

export function registerTools(
  server: McpServer,
  container: Container,
  principal: McpPrincipal,
): void {
  // ── list_courses ──────────────────────────────────────────────────────────
  // Lists courses visible to the org. Any org member with courses:read scope
  // may read the course catalog (scope-only gate — no role restriction).
  server.registerTool(
    "list_courses",
    {
      title: "List Courses",
      description: "List courses for the organization",
      inputSchema: z.object({
        page: z.number().int().positive().default(1),
        pageSize: z.number().int().positive().max(100).default(20),
        search: z.string().optional(),
        status: z.enum(["draft", "published"]).optional(),
      }),
    },
    async (args) => {
      if (!principal.scopes.includes("courses:read")) return forbidden();
      try {
        const page = await container.courses.list({
          page: args.page,
          pageSize: args.pageSize,
          search: args.search,
          status: args.status,
        });
        return json(page);
      } catch {
        return internalError();
      }
    },
  );

  // ── get_course ────────────────────────────────────────────────────────────
  // Gets a single course by ID. Any org member with courses:read scope may
  // read the course catalog (scope-only gate — no role restriction).
  server.registerTool(
    "get_course",
    {
      title: "Get Course",
      description: "Get a single course by ID",
      inputSchema: z.object({
        id: z.string().min(1),
      }),
    },
    async (args) => {
      if (!principal.scopes.includes("courses:read")) return forbidden();
      try {
        const course = await container.courses.get(args.id);
        if (!course) return notFound("course", args.id);
        return json(course);
      } catch {
        return internalError();
      }
    },
  );

  // ── list_enrollments ──────────────────────────────────────────────────────
  // Lists enrollments. Requires enrollments:read scope.
  // Owner/admin/instructor (view_student_progress !== false) can see any student.
  // A student (consume_content) is restricted to their own enrollments by
  // defaulting studentId to principal.studentId when not provided.
  server.registerTool(
    "list_enrollments",
    {
      title: "List Enrollments",
      description: "List enrollments for a student",
      inputSchema: z.object({
        studentId: z.string().optional(),
        courseId: z.string().optional(),
        page: z.number().int().positive().default(1),
        pageSize: z.number().int().positive().max(100).default(20),
      }),
    },
    async (args) => {
      // Owner/admin (cap === true) and instructor (cap === "assigned") may
      // view all enrollments; false means the role has no grant at all.
      const cap = capability(principal.role, "view_student_progress");
      const canViewAll = principal.scopes.includes("enrollments:read") && cap !== false;
      // Students can list their own enrollments when they have the read scope —
      // consume_content is enrollment-scoped ("enrolled"), so we check scope +
      // role directly rather than going through authorize().
      const scopeOk = principal.scopes.includes("enrollments:read");
      const isOwnEnrollments =
        scopeOk &&
        principal.role === "student" &&
        (args.studentId === undefined || args.studentId === principal.studentId);

      if (!canViewAll && !isOwnEnrollments) {
        return forbidden();
      }

      // Students are scoped to their own enrollments.
      const resolvedStudentId = canViewAll ? args.studentId : principal.studentId;

      try {
        const page = await container.enrollments.list({
          page: args.page,
          pageSize: args.pageSize,
          studentId: resolvedStudentId,
          courseId: args.courseId,
        });
        return json(page);
      } catch {
        return internalError();
      }
    },
  );

  // ── enroll_student ────────────────────────────────────────────────────────
  // Enrolls a student in a course. Requires enrollments:write scope and
  // manage_users capability (admin or owner).
  server.registerTool(
    "enroll_student",
    {
      title: "Enroll Student",
      description: "Enroll a student in a course",
      inputSchema: z.object({
        studentId: z.string().min(1),
        courseId: z.string().min(1),
        expiresAt: z.string().nullable().optional(),
      }),
    },
    async (args) => {
      if (!authorize(principal, "enrollments:write", "manage_users")) {
        return forbidden();
      }
      try {
        const enrollment = await container.enrollments.grant({
          studentId: args.studentId,
          courseId: args.courseId,
          expiresAt: args.expiresAt ?? null,
        });
        return json(enrollment);
      } catch {
        return internalError();
      }
    },
  );

  // ── get_student_progress ──────────────────────────────────────────────────
  // Returns overall progress summary for a student.
  // Requires progress:read scope and view_student_progress capability (owner/admin).
  server.registerTool(
    "get_student_progress",
    {
      title: "Get Student Progress",
      description: "Get overall progress summary for a student",
      inputSchema: z.object({
        studentId: z.string(),
      }),
    },
    async (args) => {
      if (!authorize(principal, "progress:read", "view_student_progress")) {
        return forbidden();
      }
      try {
        const student = await container.students.get(args.studentId);
        if (!student) return notFound("student", args.studentId);
        return json({
          studentId: args.studentId,
          avgProgress: student.avgProgress,
          enrollmentCount: student.enrollmentCount,
        });
      } catch {
        return internalError();
      }
    },
  );
}
