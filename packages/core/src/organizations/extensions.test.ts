import { describe, expect, it, vi } from 'vitest';
import type { ContentType, Level, Permission } from '../types/index.js';
import type { NewDomainEvent } from '../shared/ports.js';
import type { AssignmentRow } from './effective-permissions.js';
import type { StoredOrgRole } from './org-roles.js';
import type { OrganizationsRepository, OrganizationsUnitOfWork, RolesRepository } from './ports.js';
import type { IdentityService } from '../identity/index.js';
import { OrganizationServiceImpl } from './service.js';
import { DEFAULT_ROLES, validateRoleSet, type RoleDefinition } from './default-roles.js';
import { ALL_PERMISSIONS, fitsLevels } from './permissions.js';
import { levelSchema } from '../types/schemas/organizations.js';
import { OrganizationRuleError } from './members.js';

vi.mock('../types/schemas/content.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../types/schemas/content.js')>();
  const { z } = await import('zod');
  return {
    ...actual,
    contentTypeSchema: z.enum([...actual.contentTypeSchema.options, 'event']),
  };
});

vi.mock('../types/schemas/organizations.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../types/schemas/organizations.js')>();
  const { z } = await import('zod');
  const keys = [...actual.PERMISSION_KEYS, 'events:read', 'events:write'] as const;
  return { ...actual, PERMISSION_KEYS: keys, permissionSchema: z.enum(keys) };
});

vi.mock('./permissions.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./permissions.js')>();
  Object.assign(actual.PERMISSIONS, {
    'events:read': {
      group: 'content',
      label: 'See events',
      description: 'See the event.',
      about: 'event',
    },
    'events:write': {
      group: 'content',
      label: 'Edit events',
      description: 'Edit the event.',
      about: 'event',
      implies: ['events:read'],
    },
  });
  return actual;
});

const ORG = 'org_1';
const EVENT_READ = 'events:read' as Permission;
const EVENT_WRITE = 'events:write' as Permission;
const EVENT = 'event' as ContentType;

const HOST: RoleDefinition = {
  key: 'host',
  name: 'Host',
  description: 'Runs events.',
  levels: ['org', EVENT as Level],
  team: true,
  permissions: [EVENT_READ, EVENT_WRITE],
};

function service(storedRoles: StoredOrgRole[] = []) {
  const assignments = new Map<string, AssignmentRow[]>([
    ['orm_sarah', [{ roleKey: 'owner', contentId: null, contentType: null }]],
    ['orm_james', []],
  ]);
  const content = new Map<string, ContentType>([
    ['evt_1', EVENT],
    ['evt_2', EVENT],
    ['crs_1', 'course'],
  ]);
  const events: NewDomainEvent[] = [];
  const rowsOf = (id: string) => assignments.get(id) ?? [];
  const roles = {
    actorFacts: async (_orgId: string, id: string) =>
      assignments.has(id)
        ? { orgUserId: id, status: 'active', assignments: rowsOf(id), storedRoles }
        : null,
    storedRoles: async () => storedRoles,
    assignmentsOf: async (_orgId: string, id: string) => rowsOf(id),
    contentTypeOf: async (_orgId: string, id: string) => content.get(id) ?? null,
    lock: async () => {},
    holderCounts: async () => ({}),
    countHolders: async () => 0,
    setItemRole: async (
      _orgId: string,
      id: string,
      contentId: string,
      contentType: ContentType,
      roleKey: string,
    ) => {
      assignments.set(id, [
        ...rowsOf(id).filter((row) => row.contentId !== contentId),
        { roleKey, contentId, contentType },
      ]);
    },
  } as unknown as RolesRepository;
  const repo = {
    findOrgUserById: async (_orgId: string, id: string) =>
      assignments.has(id) ? { id, orgId: ORG, userId: `usr_${id}`, status: 'active' } : null,
  } as unknown as OrganizationsRepository;
  const uow: OrganizationsUnitOfWork = {
    run: (fn) =>
      fn({
        organizations: repo,
        roles,
        outbox: {
          append: async (e) => {
            events.push(...e);
          },
        },
      }),
  };
  const svc = new OrganizationServiceImpl({
    repo,
    roles,
    membersRepo: { teamRows: async () => [] },
    people: {} as IdentityService,
    uow,
    orgAdmin: () => {
      throw new Error('not used');
    },
    defaultRoles: [...DEFAULT_ROLES, HOST],
  });
  const actor = async (id: string) => (await svc.actorFor(ORG, id))!;
  return { svc, actor, events, rowsOf };
}

describe('a permission a release adds', () => {
  it('is held by the owner without any change to the role set', async () => {
    const { actor } = service();
    const sarah = await actor('orm_sarah');
    expect(ALL_PERMISSIONS).toContain(EVENT_WRITE);
    expect(sarah.permissions.has(EVENT_WRITE)).toBe(true);
    expect(sarah.permissions.has(EVENT_WRITE, 'evt_1')).toBe(true);
  });

  it('reaches a stored role never saved with it from its base, and keeps its saved choices', async () => {
    const { svc, actor } = service([
      {
        key: 'admin',
        name: 'Manager',
        description: null,
        base: 'admin',
        levels: null,
        permissions: { 'courses:delete': false },
        team: null,
      },
    ]);
    const admin = await svc.getRole('admin', await actor('orm_sarah'));
    expect(admin.name).toBe('Manager');
    expect(admin.permissions).toContain(EVENT_WRITE);
    expect(admin.permissions).not.toContain('courses:delete');
  });
});

describe('a content type a release adds', () => {
  it('is a valid level, and a permission about it fits only that level or the org', () => {
    expect(levelSchema.safeParse(EVENT).success).toBe(true);
    expect(() => validateRoleSet([...DEFAULT_ROLES, HOST])).not.toThrow();
    expect(fitsLevels(EVENT_WRITE, [EVENT as Level])).toBe(true);
    expect(fitsLevels(EVENT_WRITE, ['course'])).toBe(false);
    expect(fitsLevels('courses:write', [EVENT as Level])).toBe(false);
  });

  it('lets a role that lists it be given on an item of that type, and only there', async () => {
    const { svc, actor, events, rowsOf } = service();
    const sarah = await actor('orm_sarah');
    await svc.assignRole('orm_james', 'evt_1', 'host', sarah);
    await expect(svc.assignRole('orm_james', 'crs_1', 'host', sarah)).rejects.toBeInstanceOf(
      OrganizationRuleError,
    );
    await expect(svc.assignRole('orm_james', 'evt_2', 'instructor', sarah)).rejects.toBeInstanceOf(
      OrganizationRuleError,
    );
    expect(rowsOf('orm_james')).toEqual([
      { roleKey: 'host', contentId: 'evt_1', contentType: EVENT },
    ]);
    expect(events).toEqual([
      expect.objectContaining({
        type: 'organization.role.assigned',
        data: expect.objectContaining({ contentId: 'evt_1', contentType: EVENT, roleKey: 'host' }),
      }),
    ]);
    const james = await actor('orm_james');
    expect(james.permissions.has(EVENT_WRITE, 'evt_1')).toBe(true);
    expect(james.permissions.has(EVENT_WRITE, 'evt_2')).toBe(false);
    expect(james.permissions.roleOn('evt_1')).toEqual({ key: 'host', name: 'Host', team: true });
  });
});
