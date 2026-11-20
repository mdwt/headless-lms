import type { App, CreateAppInput, UpdateAppInput } from '../types/index.js';
import type { Actor } from '../shared/actor.js';
import { AppClash, type AppClashKind, type AppsRepository } from '../shared/apps.js';
import { ConflictError, InvalidInputError, NotFoundError } from '../shared/errors.js';
import { genId } from '../shared/id.js';
import { noopLogger } from '../shared/logger.js';
import type { Logger } from '../shared/ports.js';
import type { AppAt, OrganizationsRepository } from './ports.js';

export type OrgAppsParams = {
  repo: AppsRepository;
  organizations: Pick<OrganizationsRepository, 'findById'>;
  reservedDomains?: readonly string[];
  logger?: Logger;
};

function hostOf(domain: string): string | null {
  return URL.canParse(domain) ? new URL(domain).host : null;
}

function refusal(kind: AppClashKind): Error {
  switch (kind) {
    case 'domain':
      return new ConflictError('That domain is already in use', 'domain_taken');
    case 'slug':
      return new ConflictError('That slug is already in use', 'slug_taken');
    case 'courses':
      return new ConflictError(
        'The organization already has an app that serves courses',
        'courses_taken',
      );
    case 'community':
      return new ConflictError(
        'The organization already has an app that serves the community',
        'community_taken',
      );
    case 'serves':
      return new InvalidInputError('An app serves courses, the community, or both');
  }
}

export class OrgApps {
  private readonly repo: AppsRepository;
  private readonly organizations: Pick<OrganizationsRepository, 'findById'>;
  private readonly reservedHosts: ReadonlySet<string>;
  private readonly logger: Logger;

  constructor(params: OrgAppsParams) {
    this.repo = params.repo;
    this.organizations = params.organizations;
    this.reservedHosts = new Set(
      (params.reservedDomains ?? []).map(hostOf).filter((host) => host !== null),
    );
    this.logger = params.logger ?? noopLogger;
  }

  async list(actor: Actor): Promise<App[]> {
    actor.permissions.require('organizations:read');
    return this.repo.list(actor.orgId);
  }

  async create(input: CreateAppInput, actor: Actor): Promise<App> {
    actor.permissions.require('organizations:write');
    const wanted = { ...input, orgId: actor.orgId, id: genId('app') };
    this.assertNotReserved(wanted.domain, actor.orgId);
    await this.assertNoClash(wanted);
    const app = await this.saved(() => this.repo.create(wanted));
    this.logger.info('app created', {
      orgId: actor.orgId,
      appId: app.id,
      domain: app.domain,
      actorId: actor.id,
    });
    return app;
  }

  async update(appId: string, input: UpdateAppInput, actor: Actor): Promise<App> {
    actor.permissions.require('organizations:write');
    const orgId = actor.orgId;
    const current = await this.repo.find(orgId, appId);
    if (!current) {
      throw new NotFoundError('App', appId);
    }
    const wanted: App = {
      ...current,
      ...(input.name !== undefined && { name: input.name }),
      ...(input.slug !== undefined && { slug: input.slug }),
      ...(input.domain !== undefined && { domain: input.domain }),
      ...(input.courses !== undefined && { courses: input.courses }),
      ...(input.community !== undefined && { community: input.community }),
    };
    if (wanted.domain !== current.domain) {
      this.assertNotReserved(wanted.domain, orgId);
    }
    await this.assertNoClash(wanted);
    const updated = await this.saved(() => this.repo.update(orgId, appId, input));
    if (!updated) {
      throw new NotFoundError('App', appId);
    }
    this.logger.info('app updated', {
      orgId,
      appId,
      domain: updated.domain,
      actorId: actor.id,
    });
    return updated;
  }

  async delete(appId: string, actor: Actor): Promise<void> {
    actor.permissions.require('organizations:write');
    const deleted = await this.repo.delete(actor.orgId, appId);
    if (!deleted) {
      throw new NotFoundError('App', appId);
    }
    this.logger.info('app deleted', {
      orgId: actor.orgId,
      appId,
      domain: deleted.domain,
      actorId: actor.id,
    });
  }

  async at(domain: string): Promise<AppAt | null> {
    if (this.reserved(domain)) {
      return null;
    }
    const app = await this.repo.findByDomain(domain);
    const organization = app ? await this.organizations.findById(app.orgId) : null;
    return app && organization
      ? {
          app,
          organization: {
            id: organization.id,
            externalId: organization.externalId ?? null,
            name: organization.name,
            slug: organization.slug,
          },
        }
      : null;
  }

  private async assertNoClash(app: App): Promise<void> {
    const kind = await this.clashOf(app);
    if (kind) {
      this.logger.warn('app refused', { orgId: app.orgId, domain: app.domain, reason: kind });
      throw refusal(kind);
    }
  }

  private async clashOf(app: App): Promise<AppClashKind | null> {
    if (!app.courses && !app.community) {
      return 'serves';
    }
    const [mine, atDomain] = await Promise.all([
      this.repo.list(app.orgId),
      this.repo.findByDomain(app.domain),
    ]);
    const others = mine.filter((other) => other.id !== app.id);
    if (atDomain && atDomain.id !== app.id) {
      return 'domain';
    }
    if (others.some((other) => other.slug === app.slug)) {
      return 'slug';
    }
    if (app.courses && others.some((other) => other.courses)) {
      return 'courses';
    }
    if (app.community && others.some((other) => other.community)) {
      return 'community';
    }
    return null;
  }

  private async saved<T>(write: () => Promise<T>): Promise<T> {
    try {
      return await write();
    } catch (err) {
      if (err instanceof AppClash) {
        throw refusal(err.kind);
      }
      throw err;
    }
  }

  private reserved(domain: string): boolean {
    const host = hostOf(domain);
    return host === null || this.reservedHosts.has(host);
  }

  private assertNotReserved(domain: string, orgId: string): void {
    if (this.reserved(domain)) {
      this.logger.warn('app refused: the domain is one of the installation', { orgId, domain });
      throw new ConflictError(
        "That domain is one of the installation's own addresses",
        'domain_reserved',
      );
    }
  }
}
