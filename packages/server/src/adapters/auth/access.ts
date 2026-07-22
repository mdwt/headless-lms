// Better Auth org-plugin access control. Better Auth is the system of record for
// roles; these four roles mirror the domain Role union (core/organizations/roles).
import { createAccessControl } from 'better-auth/plugins/access';
import { defaultStatements, ownerAc, adminAc } from 'better-auth/plugins/organization/access';

export const statement = {
  ...defaultStatements,
  course: ['create', 'read', 'update', 'delete'],
  progress: ['view'],
} as const;

const ac = createAccessControl(statement);

export const roles = {
  owner: ac.newRole({
    ...ownerAc.statements,
    course: ['create', 'read', 'update', 'delete'],
    progress: ['view'],
  }),
  admin: ac.newRole({
    ...adminAc.statements,
    course: ['create', 'read', 'update', 'delete'],
    progress: ['view'],
  }),
  instructor: ac.newRole({
    course: ['read', 'update'],
    progress: ['view'],
  }),
  student: ac.newRole({
    course: ['read'],
  }),
};

export { ac };
