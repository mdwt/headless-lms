import { describe, it, expect, vi } from 'vitest';
import { IdentityServiceImpl } from './service.js';
import { ConflictError } from '../shared/errors.js';
import type { IdentityRepository, IdentityUnitOfWork } from './ports.js';
import type { User } from './model.js';
import type { NewDomainEvent } from '../shared/ports.js';
import type { Mailer } from '../shared/mailer.js';

const PROVISIONED: User = {
  id: 'usr_invited',
  externalId: null,
  email: 'invited@example.com',
  firstName: 'Ada',
  lastName: 'Lovelace',
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

function fakeRepo(over?: Partial<IdentityRepository>): IdentityRepository {
  return {
    insertUser: vi
      .fn()
      .mockImplementation((input) =>
        Promise.resolve({ ...PROVISIONED, ...input, externalId: input.externalId ?? null }),
      ),
    updateUser: vi
      .fn()
      .mockImplementation((id, input) => Promise.resolve({ ...PROVISIONED, id, ...input })),
    findUserById: vi.fn().mockResolvedValue(null),
    findUserByExternalId: vi.fn().mockResolvedValue(null),
    findUserByEmail: vi.fn().mockResolvedValue(null),
    ...over,
  };
}

function build(repo = fakeRepo()) {
  const appended: NewDomainEvent[] = [];
  const uow: IdentityUnitOfWork = {
    run: (fn) =>
      fn({
        identity: repo,
        outbox: {
          append: async (events) => {
            appended.push(...events);
          },
        },
      }),
  };
  const mailer = { send: vi.fn() } as unknown as Mailer;
  const service = new IdentityServiceImpl({ repo, uow, mailer });
  return { service, repo, appended };
}

describe('linkOrCreateUser', () => {
  it('creates a new user when the email is unknown', async () => {
    const { service, repo, appended } = build();

    const user = await service.linkOrCreateUser({
      id: 'usr_new',
      email: 'new@example.com',
      firstName: 'New',
      lastName: 'Person',
    });

    expect(repo.insertUser).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'usr_new', email: 'new@example.com' }),
    );
    expect(user.id).toBe('usr_new');
    expect(appended.map((e) => e.type)).toEqual(['identity.user.created']);
  });

  it('links a self-signup to its own id via externalId', async () => {
    const { service, repo } = build();

    const user = await service.linkOrCreateUser({
      id: 'usr_new',
      email: 'new@example.com',
    });

    expect(repo.insertUser).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'usr_new', externalId: 'usr_new' }),
    );
    expect(user.externalId).toBe('usr_new');
  });

  it('mints one id for both id and externalId when none is given', async () => {
    const { service, repo } = build();

    const user = await service.linkOrCreateUser({ email: 'new@example.com' });

    const input = vi.mocked(repo.insertUser).mock.calls[0]![0];
    expect(input.id).toMatch(/^usr_/);
    expect(input.externalId).toBe(input.id);
    expect(user.externalId).toBe(user.id);
  });

  it('links a provisioned user instead of inserting a duplicate', async () => {
    const repo = fakeRepo({ findUserByEmail: vi.fn().mockResolvedValue(PROVISIONED) });
    const { service, appended } = build(repo);

    const user = await service.linkOrCreateUser({
      id: 'usr_discarded',
      email: 'invited@example.com',
      firstName: 'Ada',
      lastName: 'King',
    });

    expect(repo.insertUser).not.toHaveBeenCalled();
    expect(repo.updateUser).toHaveBeenCalledWith('usr_invited', {
      externalId: 'usr_invited',
      firstName: 'Ada',
      lastName: 'King',
    });
    expect(user.id).toBe('usr_invited');
    expect(user.externalId).toBe('usr_invited');
    expect(appended.map((e) => e.type)).toEqual(['identity.user.updated']);
  });

  it('rejects an email already linked to an account', async () => {
    const repo = fakeRepo({
      findUserByEmail: vi.fn().mockResolvedValue({ ...PROVISIONED, externalId: 'usr_invited' }),
    });
    const { service } = build(repo);

    await expect(
      service.linkOrCreateUser({ id: 'usr_x', email: 'invited@example.com' }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(repo.insertUser).not.toHaveBeenCalled();
    expect(repo.updateUser).not.toHaveBeenCalled();
  });
});
