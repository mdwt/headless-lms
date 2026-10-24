import type { IdentityRepository, IdentityService, IdentityUnitOfWork } from './ports.js';
import type { User, UserProfile, UserProfileView } from './model.js';
import type { UpdateProfileInput } from './ports.js';
import type { CreateUserInput, UpdateUserInput } from './types.js';
import type { Logger } from '../shared/ports.js';
import { noopLogger } from '../shared/logger.js';
import { genId } from '../shared/id.js';
import { ConflictError, ForbiddenError, NotFoundError } from '../shared/errors.js';
import type { Mailer } from '../shared/mailer.js';
import type { AssetUrlSigner, MemberImageReader } from '../assets/index.js';
import { identityEvents } from './events.js';

const UNNAMED = 'A member';

export class IdentityServiceImpl implements IdentityService {
  private readonly repo: IdentityRepository;
  private readonly logger: Logger;
  private readonly uow: IdentityUnitOfWork;
  private readonly mailer: Pick<Mailer, 'send'>;
  private readonly images: MemberImageReader;
  private readonly assetUrls: AssetUrlSigner;

  constructor(input: {
    repo: IdentityRepository;
    logger?: Logger;
    mailer: Mailer;
    uow: IdentityUnitOfWork;
    images: MemberImageReader;
    assetUrls: AssetUrlSigner;
  }) {
    this.repo = input.repo;
    this.mailer = input.mailer;
    this.logger = input.logger ?? noopLogger;
    this.uow = input.uow;
    this.images = input.images;
    this.assetUrls = input.assetUrls;
  }

  async createUser(input: CreateUserInput): Promise<User> {
    const created = await this.uow.run(async ({ identity, outbox }) => {
      const user = await identity.insertUser(input);
      await outbox.append([identityEvents.userCreated.make({ orgId: '-', data: user })]);
      return user;
    });
    this.logger.info('user created', { user: created });
    return created;
  }

  async linkOrCreateUser(input: CreateUserInput): Promise<User> {
    const existing = await this.repo.findUserByEmail(input.email);
    if (!existing) {
      const id = input.id ?? genId('user');
      return this.createUser({ ...input, id, externalId: id });
    }
    if (existing.externalId !== null) {
      throw new ConflictError('That email already has an account');
    }
    // Existing user without external link, so invited. update the user with the
    // id.
    const linked = await this.uow.run(async ({ identity, outbox }) => {
      const user = await identity.updateUser(existing.id, {
        externalId: existing.id,
        ...(input.firstName !== undefined && { firstName: input.firstName }),
        ...(input.lastName !== undefined && { lastName: input.lastName }),
      });
      await outbox.append([identityEvents.userUpdated.make({ orgId: '-', data: user! })]);
      return user!;
    });
    this.logger.info('user linked to auth account', { user: linked });
    return linked;
  }

  async updateUser(id: string, input: UpdateUserInput): Promise<User> {
    const person = await this.repo.findUserById(id);
    if (!person) {
      throw new NotFoundError('User', id);
    }

    const updated = await this.uow.run(async ({ identity, outbox }) => {
      const user = await identity.updateUser(id, input);
      await outbox.append([identityEvents.userUpdated.make({ orgId: '-', data: user! })]);
      return user!;
    });
    this.logger.info('user updated', { user: updated });
    return updated;
  }

  async getUserByExternalId(externalId: string): Promise<User | null> {
    return this.repo.findUserByExternalId(externalId);
  }

  async getUserByEmail(email: string): Promise<User | null> {
    return this.repo.findUserByEmail(email);
  }

  async getUserById(id: string): Promise<User | null> {
    return this.repo.findUserById(id);
  }

  async sendPasswordReset(input: { email: string; url: string }): Promise<void> {
    await this.mailer.send(input.email, 'passwordReset', { resetUrl: input.url });
  }

  async sendPasswordChanged(input: { email: string }): Promise<void> {
    await this.mailer.send(input.email, 'passwordChanged', {});
  }

  async sendMagicLink(input: { email: string; url: string }): Promise<void> {
    await this.mailer.send(input.email, 'magicLink', { url: input.url });
  }

  async profileOf(orgId: string, userId: string): Promise<UserProfileView> {
    const stored = await this.repo.findProfile(userId);
    if (stored) {
      return this.view(orgId, stored);
    }
    const never = new Date(0);
    return {
      userId,
      displayName: null,
      headline: null,
      bio: null,
      imageAssetOrgId: null,
      imageAssetId: null,
      imageUrl: null,
      extra: {},
      createdAt: never,
      updatedAt: never,
    };
  }

  private async view(orgId: string, profile: UserProfile): Promise<UserProfileView> {
    const imageAssetId = profile.imageAssetOrgId === orgId ? profile.imageAssetId : null;
    const urls = imageAssetId ? await this.assetUrls.urls(orgId, [imageAssetId]) : {};
    return { ...profile, imageUrl: imageAssetId ? (urls[imageAssetId] ?? null) : null };
  }

  async displayName(userId: string | null): Promise<string> {
    if (userId === null) {
      return UNNAMED;
    }
    const [profile, user] = await Promise.all([
      this.repo.findProfile(userId),
      this.repo.findUserById(userId),
    ]);
    const named = profile?.displayName?.trim();
    if (named) {
      return named;
    }
    const composed = [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim();
    return composed || UNNAMED;
  }

  async updateProfile(
    orgId: string,
    userId: string,
    actorUserId: string,
    orgUserId: string,
    patch: UpdateProfileInput,
  ): Promise<UserProfileView> {
    if (actorUserId !== userId) {
      throw new ForbiddenError('You can only update your own profile');
    }
    const orgSet = patch.imageAssetOrgId !== undefined;
    const idSet = patch.imageAssetId !== undefined;
    if (
      orgSet !== idSet ||
      (orgSet && (patch.imageAssetOrgId === null) !== (patch.imageAssetId === null))
    ) {
      throw new ConflictError(
        'A profile photo needs both the asset and its organization, or neither',
      );
    }
    const user = await this.repo.findUserById(userId);
    if (!user) {
      throw new NotFoundError('User', userId);
    }
    if (patch.imageAssetId != null && patch.imageAssetOrgId != null) {
      const owned = await this.images.ownsImage(
        patch.imageAssetOrgId,
        patch.imageAssetId,
        orgUserId,
      );
      if (!owned) {
        this.logger.debug('profile photo refused', {
          userId,
          orgUserId,
          assetId: patch.imageAssetId,
        });
        throw new NotFoundError('Asset', patch.imageAssetId);
      }
    }
    const profile = await this.repo.upsertProfile(userId, patch);
    this.logger.info('profile updated', { userId });
    return this.view(orgId, profile);
  }
}
