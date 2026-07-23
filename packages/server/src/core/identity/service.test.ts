import { describe, it, expect } from 'vitest';
import { IdentityServiceImpl } from './service.js';
import { ConflictError, NotFoundError } from '../shared/errors.js';
import type { IdentityRepository, IdentityUnitOfWork } from './ports.js';
import type { Student, User } from './model.js';
import type { CreateStudentInput, RegisterStudentInput, RegisterUserInput } from './types.js';

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
    async findStudentByExternalId(orgId: string, externalId: string) {
      return students.find((r) => r.orgId === orgId && r.externalId === externalId) ?? null;
    },
    async findStudentOrgExternalId(externalId: string) {
      const matches = students.filter((r) => r.externalId === externalId);
      return matches.length === 1 ? (matches[0]?.orgId ?? null) : null;
    },
    async findStudentByEmail(orgId: string, email: string) {
      return students.find((r) => r.orgId === orgId && r.email === email) ?? null;
    },
    async findStudentById(orgId: string, id: string) {
      return students.find((r) => r.orgId === orgId && r.id === id) ?? null;
    },
    async insertPendingStudent(input: CreateStudentInput) {
      const row: Student = {
        id: `st_${++n}`,
        externalId: null,
        createdAt: new Date(0),
        updatedAt: new Date(0),
        ...input,
      };
      students.push(row);
      return row;
    },
    async deleteStudent(orgId: string, id: string) {
      const i = students.findIndex((r) => r.orgId === orgId && r.id === id);
      if (i === -1) {
        return false;
      }
      students.splice(i, 1);
      return true;
    },
    async linkPendingStudent(orgId: string, email: string, externalId: string) {
      let count = 0;
      for (let i = 0; i < students.length; i++) {
        const row = students[i];
        if (row && row.orgId === orgId && row.email === email && row.externalId === null) {
          students[i] = { ...row, externalId };
          count += 1;
        }
      }
      return count;
    },
  };
  return { repo, rows: students };
}

// A passthrough UoW whose outbox captures appended events, so tests can assert
// what a write emits alongside its row change.
function capturingUow(repo: IdentityRepository) {
  const events: Array<Record<string, unknown>> = [];
  const uow: IdentityUnitOfWork = {
    run: (fn) =>
      fn({
        identity: repo,
        outbox: {
          append: async (batch) => {
            events.push(...(batch as Record<string, unknown>[]));
          },
        },
      }),
  };
  return { uow, events };
}

describe('IdentityService.registerStudent', () => {
  const input: RegisterStudentInput = {
    orgId: 'org_1',
    externalId: 'auth_1',
    email: 'a@example.com',
    firstName: 'Ada',
    lastName: 'Lovelace',
  };

  it('creates a student for a new auth user', async () => {
    const { repo, rows } = fakeRepo();
    const student = await new IdentityServiceImpl(repo).registerStudent(input);
    expect(student.externalId).toBe('auth_1');
    expect(student.orgId).toBe('org_1');
    expect(rows).toHaveLength(1);
  });

  it('is idempotent — a repeat sync does not create a duplicate', async () => {
    const { repo, rows } = fakeRepo();
    const svc = new IdentityServiceImpl(repo);
    const first = await svc.registerStudent(input);
    const second = await svc.registerStudent(input);
    expect(second.id).toBe(first.id);
    expect(rows).toHaveLength(1);
  });

  it('the same external id in two orgs resolves independently', async () => {
    const { repo, rows } = fakeRepo();
    const svc = new IdentityServiceImpl(repo);
    const a = await svc.registerStudent(input);
    const b = await svc.registerStudent({ ...input, orgId: 'org_2' });
    expect(b.id).not.toBe(a.id);
    expect(rows).toHaveLength(2);
    expect((await svc.getStudentByExternalId('org_1', 'auth_1'))?.id).toBe(a.id);
    expect((await svc.getStudentByExternalId('org_2', 'auth_1'))?.id).toBe(b.id);
  });
});

describe('IdentityService.getStudentByExternalId', () => {
  it("returns only the matching org's student", async () => {
    const { repo } = fakeRepo();
    const svc = new IdentityServiceImpl(repo);
    await svc.registerStudent({
      orgId: 'org_1',
      externalId: 'auth_1',
      email: 'a@example.com',
      firstName: 'Ada',
      lastName: 'Lovelace',
    });
    expect(await svc.getStudentByExternalId('org_other', 'auth_1')).toBeNull();
  });
});

describe('createStudent', () => {
  it('inserts a pending student with NULL externalId', async () => {
    const { repo } = fakeRepo();
    const svc = new IdentityServiceImpl(repo);
    const student = await svc.createStudent({
      orgId: 'org1',
      email: 'jane@example.com',
      firstName: 'Jane',
      lastName: 'Doe',
    });
    expect(student.externalId).toBeNull();
    expect(student.email).toBe('jane@example.com');
  });

  it('throws ConflictError when the org already has that email', async () => {
    const { repo } = fakeRepo();
    const svc = new IdentityServiceImpl(repo);
    await svc.createStudent({ orgId: 'org1', email: 'jane@example.com', firstName: 'Jane', lastName: 'Doe' });
    await expect(
      svc.createStudent({ orgId: 'org1', email: 'jane@example.com', firstName: 'J', lastName: 'D' }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('allows the same email in a different org', async () => {
    const { repo } = fakeRepo();
    const svc = new IdentityServiceImpl(repo);
    await svc.createStudent({ orgId: 'org1', email: 'jane@example.com', firstName: 'Jane', lastName: 'Doe' });
    await expect(
      svc.createStudent({ orgId: 'org2', email: 'jane@example.com', firstName: 'Jane', lastName: 'Doe' }),
    ).resolves.toBeTruthy();
  });
});

describe('deleteStudent', () => {
  it('removes the row and appends student.deleted with the last known state', async () => {
    const { repo, rows } = fakeRepo();
    const { uow, events } = capturingUow(repo);
    const svc = new IdentityServiceImpl(repo, uow);
    const student = await svc.createStudent({
      orgId: 'org1',
      email: 'jane@example.com',
      firstName: 'Jane',
      lastName: 'Doe',
    });
    await svc.deleteStudent('org1', student.id);
    expect(rows).toHaveLength(0);
    expect(events).toContainEqual({ type: 'student.deleted', orgId: 'org1', student });
  });

  it('throws NotFoundError and appends nothing for an unknown id', async () => {
    const { repo } = fakeRepo();
    const { uow, events } = capturingUow(repo);
    const svc = new IdentityServiceImpl(repo, uow);
    await expect(svc.deleteStudent('org1', 's_missing')).rejects.toBeInstanceOf(NotFoundError);
    expect(events).toHaveLength(0);
  });

  it("does not delete another org's student with the same id", async () => {
    const { repo, rows } = fakeRepo();
    const svc = new IdentityServiceImpl(repo);
    const student = await svc.createStudent({
      orgId: 'org1',
      email: 'jane@example.com',
      firstName: 'Jane',
      lastName: 'Doe',
    });
    await expect(svc.deleteStudent('org2', student.id)).rejects.toBeInstanceOf(NotFoundError);
    expect(rows).toHaveLength(1);
  });
});

describe('hasPendingStudent', () => {
  it('is true for an unlinked row, false once linked or absent', async () => {
    const { repo } = fakeRepo();
    const svc = new IdentityServiceImpl(repo);
    await svc.createStudent({ orgId: 'org1', email: 'jane@example.com', firstName: 'Jane', lastName: 'Doe' });
    expect(await svc.hasPendingStudent('org1', 'jane@example.com')).toBe(true);
    expect(await svc.hasPendingStudent('org1', 'nobody@example.com')).toBe(false);
    await svc.linkPendingStudent('org1', 'jane@example.com', 'ivt_1', 'usr_ext_9');
    expect(await svc.hasPendingStudent('org1', 'jane@example.com')).toBe(false);
  });
});

describe('linkPendingStudent', () => {
  it("links the org's pending row and reports success", async () => {
    const { repo } = fakeRepo();
    const svc = new IdentityServiceImpl(repo);
    await svc.createStudent({ orgId: 'org1', email: 'jane@example.com', firstName: 'Jane', lastName: 'Doe' });
    const linked = await svc.linkPendingStudent('org1', 'jane@example.com', 'ivt_1', 'usr_ext_9');
    expect(linked).toBe(true);
    const row = await repo.findStudentByEmail('org1', 'jane@example.com');
    expect(row?.externalId).toBe('usr_ext_9');
  });

  it('links only the target org, not another org with the same email', async () => {
    const { repo } = fakeRepo();
    const svc = new IdentityServiceImpl(repo);
    await svc.createStudent({ orgId: 'org1', email: 'jane@example.com', firstName: 'Jane', lastName: 'Doe' });
    await svc.createStudent({ orgId: 'org2', email: 'jane@example.com', firstName: 'Jane', lastName: 'Doe' });
    await svc.linkPendingStudent('org1', 'jane@example.com', 'ivt_1', 'usr_ext_9');
    expect((await repo.findStudentByEmail('org2', 'jane@example.com'))?.externalId).toBeNull();
  });

  it('appends student.linked in the same write scope as the link', async () => {
    const { repo } = fakeRepo();
    const { uow, events } = capturingUow(repo);
    const svc = new IdentityServiceImpl(repo, uow);
    await svc.createStudent({ orgId: 'org1', email: 'jane@example.com', firstName: 'Jane', lastName: 'Doe' });
    events.length = 0;
    await svc.linkPendingStudent('org1', 'jane@example.com', 'ivt_1', 'usr_ext_9');
    expect(events).toEqual([
      {
        type: 'student.linked',
        orgId: 'org1',
        email: 'jane@example.com',
        invitationId: 'ivt_1',
        userExternalId: 'usr_ext_9',
      },
    ]);
  });

  it('appends no event and reports failure when nothing was pending', async () => {
    const { repo } = fakeRepo();
    const { uow, events } = capturingUow(repo);
    const svc = new IdentityServiceImpl(repo, uow);
    const linked = await svc.linkPendingStudent('org1', 'nobody@example.com', 'ivt_1', 'usr_1');
    expect(linked).toBe(false);
    expect(events).toEqual([]);
  });

  it('never touches already-linked rows', async () => {
    const { repo } = fakeRepo();
    const svc = new IdentityServiceImpl(repo);
    const s = await svc.createStudent({ orgId: 'org1', email: 'a@example.com', firstName: 'A', lastName: 'B' });
    await svc.linkPendingStudent('org1', 'a@example.com', 'ivt_a', 'usr_1');
    await svc.linkPendingStudent('org1', 'a@example.com', 'ivt_b', 'usr_2');
    const row = await repo.findStudentById('org1', s.id);
    expect(row?.externalId).toBe('usr_1');
  });
});

describe('logging', () => {
  it('logs registrations at info only when a row is inserted', async () => {
    const { createCapturingLogger } = await import('../shared/logger.js');
    const { logger, entries } = createCapturingLogger();
    const { repo } = fakeRepo();
    const svc = new IdentityServiceImpl(repo, undefined, logger);

    const input: RegisterUserInput = { externalId: 'auth-1', email: 'a@b.c', displayName: 'A' };
    const user = await svc.registerUser(input);
    await svc.registerUser(input); // idempotent → no second log

    expect(entries).toEqual([
      { level: 'info', msg: 'user registered', meta: { userId: user.id, externalId: 'auth-1' } },
    ]);
  });
});
