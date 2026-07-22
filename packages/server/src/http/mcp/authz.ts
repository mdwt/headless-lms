// MCP authorization: a tool call is allowed only if the token carries the
// required scope AND the user's role permits the action. Course-scoped tools
// also check the instructor's course assignment.
import { capability, canForCourse } from '../../core/organizations/index.js';
import type { Role, Permission } from '../../core/organizations/index.js';

export interface McpPrincipal {
  studentId: string;
  orgId: string;
  role: Role;
  assignedCourseIds: readonly string[];
  scopes: readonly string[];
}

export function authorize(
  principal: McpPrincipal,
  scope: string,
  permission: Permission,
  courseId?: string,
): boolean {
  if (!principal.scopes.includes(scope)) {
    return false;
  }
  if (courseId !== undefined) {
    return canForCourse(principal.role, permission, {
      assignedCourseIds: principal.assignedCourseIds,
      courseId,
    });
  }
  return capability(principal.role, permission) === true;
}
