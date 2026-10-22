import { describe, it, expect, vi } from 'vitest';
import { IdentityServiceImpl } from './service.js';
import { ConflictError, NotFoundError } from '../shared/errors.js';
import type { MemberImageReader } from '../assets/index.js';
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
    findProfile: vi.fn().mockResolvedValue(null),
    upsertProfile: vi.fn().mockImplementation((userId, patch) =>
      Promise.resolve({
        userId,
        displayName: patch.displayName ?? null,
        headline: patch.headline ?? null,
        bio: patch.bio ?? null,
        imageAssetOrgId: patch.imageAssetOrgId ?? null,
        imageAssetId: patch.imageAssetId ?? null,
        extra: patch.extra ?? {},
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-01'),
      }),
    ),
    ...over,
  };
}

function build(repo = fakeRepo(), images: MemberImageReader = { ownsImage: async () => true }) {
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
  const service = new IdentityServiceImpl({ repo, uow, mailer, images });
  return { service, repo, appended, mailer, images };
}

describe('password reset emails', () => {
  it('sends the reset link in the passwordReset email', async () => {
    const { service, mailer } = build();

    await service.sendPasswordReset({
      email: 'ada@example.com',
      url: 'http://localhost:8000/api/auth/reset-password/t',
    });

    expect(mailer.send).toHaveBeenCalledWith('ada@example.com', 'passwordReset', {
      resetUrl: 'http://localhost:8000/api/auth/reset-password/t',
    });
  });

  it('confirms a completed reset with the passwordChanged email', async () => {
    const { service, mailer } = build();

    await service.sendPasswordChanged({ email: 'ada@example.com' });

    expect(mailer.send).toHaveBeenCalledWith('ada@example.com', 'passwordChanged', {});
  });
});

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

describe('updateProfile', () => {
  const photo = { imageAssetOrgId: 'org-1', imageAssetId: 'ast_1' };

  it('saves a photo the org user uploaded', async () => {
    const repo = fakeRepo({ findUserById: vi.fn().mockResolvedValue(PROVISIONED) });
    const { service } = build(repo);

    const profile = await service.updateProfile('usr_invited', 'usr_invited', 'ou_1', photo);

    expect(profile.imageAssetId).toBe('ast_1');
    expect(repo.upsertProfile).toHaveBeenCalledWith('usr_invited', photo);
  });

  it('refuses a photo the org user did not upload', async () => {
    const repo = fakeRepo({ findUserById: vi.fn().mockResolvedValue(PROVISIONED) });
    const { service } = build(repo, { ownsImage: async () => false });

    await expect(
      service.updateProfile('usr_invited', 'usr_invited', 'ou_1', photo),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(repo.upsertProfile).not.toHaveBeenCalled();
  });

  it('clears a photo without asking who uploaded it', async () => {
    const repo = fakeRepo({ findUserById: vi.fn().mockResolvedValue(PROVISIONED) });
    const ownsImage = vi.fn(async () => false);
    const { service } = build(repo, { ownsImage });

    await service.updateProfile('usr_invited', 'usr_invited', 'ou_1', {
      imageAssetOrgId: null,
      imageAssetId: null,
    });

    expect(ownsImage).not.toHaveBeenCalled();
    expect(repo.upsertProfile).toHaveBeenCalled();
  });
});
