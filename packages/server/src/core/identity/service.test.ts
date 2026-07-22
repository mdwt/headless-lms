import { describe, it, expect } from 'vitest';
import { IdentityServiceImpl } from './service.js';
import { ConflictError } from '../shared/errors.js';
import type { IdentityRepository } from './ports.js';
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
        inviteId: null,
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
        inviteId: null,
        createdAt: new Date(0),
        updatedAt: new Date(0),
        ...input,
      };
      students.push(row);
      return row;
    },
    async setInviteIdByEmail(orgId: string, email: string, inviteId: string) {
      for (let i = 0; i < students.length; i++) {
        const row = students[i];
        if (row && row.orgId === orgId && row.email === email) {
          students[i] = { ...row, inviteId };
        }
      }
    },
    async linkPendingStudents(inviteId: string, email: string, externalId: string) {
      let count = 0;
      for (let i = 0; i < students.length; i++) {
        const row = students[i];
        if (row && row.externalId === null && (row.inviteId === inviteId || row.email === email)) {
          students[i] = { ...row, externalId, inviteId: null };
          count++;
        }
      }
      return count;
    },
  };
  return { repo, rows: students };
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

describe('linkStudentByInvite', () => {
  it('links the row carrying the invite id', async () => {
    const { repo } = fakeRepo();
    const svc = new IdentityServiceImpl(repo);
    await svc.createStudent({ orgId: 'org1', email: 'jane@example.com', firstName: 'Jane', lastName: 'Doe' });
    await svc.recordStudentInvite('org1', 'jane@example.com', 'inv_1');
    await svc.linkStudentByInvite('inv_1', 'jane@example.com', 'usr_ext_9');
    const linked = await repo.findStudentByEmail('org1', 'jane@example.com');
    expect(linked?.externalId).toBe('usr_ext_9');
  });

  it('falls back to email match for pending rows (resent/old token, second org)', async () => {
    const { repo } = fakeRepo();
    const svc = new IdentityServiceImpl(repo);
    await svc.createStudent({ orgId: 'org2', email: 'jane@example.com', firstName: 'Jane', lastName: 'Doe' });
    // org2 row has a DIFFERENT invite id recorded
    await svc.recordStudentInvite('org2', 'jane@example.com', 'inv_other');
    await svc.linkStudentByInvite('inv_stale', 'jane@example.com', 'usr_ext_9');
    const linked = await repo.findStudentByEmail('org2', 'jane@example.com');
    expect(linked?.externalId).toBe('usr_ext_9');
  });

  it('never touches already-linked rows', async () => {
    const { repo } = fakeRepo();
    const svc = new IdentityServiceImpl(repo);
    const s = await svc.createStudent({ orgId: 'org1', email: 'a@example.com', firstName: 'A', lastName: 'B' });
    await svc.recordStudentInvite('org1', 'a@example.com', 'inv_a');
    await svc.linkStudentByInvite('inv_a', 'a@example.com', 'usr_1');
    await svc.linkStudentByInvite('inv_a', 'a@example.com', 'usr_2');
    const row = await repo.findStudentById('org1', s.id);
    expect(row?.externalId).toBe('usr_1');
  });
});

describe('logging', () => {
  it('logs registrations at info only when a row is inserted', async () => {
    const { createCapturingLogger } = await import('../shared/logger.js');
    const { logger, entries } = createCapturingLogger();
    const { repo } = fakeRepo();
    const svc = new IdentityServiceImpl(repo, logger);

    const input: RegisterUserInput = { externalId: 'auth-1', email: 'a@b.c', displayName: 'A' };
    const user = await svc.registerUser(input);
    await svc.registerUser(input); // idempotent → no second log

    expect(entries).toEqual([
      { level: 'info', msg: 'user registered', meta: { userId: user.id, externalId: 'auth-1' } },
    ]);
  });
});
