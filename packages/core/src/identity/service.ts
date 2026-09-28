import type { IdentityRepository, IdentityService, IdentityUnitOfWork } from './ports.js';
import type { User } from './model.js';
import type { CreateUserInput, UpdateUserInput } from './types.js';
import type { Logger } from '../shared/ports.js';
import { noopLogger } from '../shared/logger.js';
import { genId } from '../shared/id.js';
import { ConflictError, NotFoundError } from '../shared/errors.js';
import type { Mailer } from '../shared/mailer.js';
import { identityEvents } from './events.js';

export class IdentityServiceImpl implements IdentityService {
  private readonly repo: IdentityRepository;
  private readonly logger: Logger;
  private readonly uow: IdentityUnitOfWork;
  private readonly mailer: Pick<Mailer, 'send'>;

  constructor(input: {
    repo: IdentityRepository;
    logger?: Logger;
    mailer: Mailer;
    uow: IdentityUnitOfWork;
  }) {
    this.repo = input.repo;
    this.mailer = input.mailer;
    this.logger = input.logger ?? noopLogger;
    this.uow = input.uow;
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
}
