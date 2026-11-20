import type { App, CreateAppInput, UpdateAppInput } from '../types/index.js';
import type { Actor } from './actor.js';
import { ConflictError, InvalidInputError, NotFoundError } from './errors.js';
import { genId } from './id.js';
import { noopLogger } from './logger.js';
import type { Logger } from './ports.js';

export interface AppsRepository {
  create(app: App): Promise<App>;
  list(orgId: string): Promise<App[]>;
  find(orgId: string, id: string): Promise<App | null>;
  findByDomain(domain: string): Promise<App | null>;
  update(orgId: string, id: string, patch: UpdateAppInput): Promise<App | null>;
  delete(orgId: string, id: string): Promise<App | null>;
}

interface AppOrganization {
  id: string;
  externalId: string | null;
  name: string;
  slug: string;
}

export interface AppAt {
  app: App;
  organization: AppOrganization;
}

export type AppsServiceParams = {
  repo: AppsRepository;
  organization: (orgId: string) => Promise<AppOrganization | null>;
  reservedDomains?: readonly string[];
  logger?: Logger;
};

function hostOf(domain: string): string | null {
  return URL.canParse(domain) ? new URL(domain).host : null;
}

export function servesCourses(apps: readonly App[]): App | null {
  return apps.find((app) => app.courses) ?? null;
}

export function servesCommunity(apps: readonly App[]): App | null {
  return apps.find((app) => app.community) ?? null;
}

export class AppsService {
  private readonly repo: AppsRepository;
  private readonly organization: (orgId: string) => Promise<AppOrganization | null>;
  private readonly reservedHosts: ReadonlySet<string>;
  private readonly logger: Logger;

  constructor(params: AppsServiceParams) {
    this.repo = params.repo;
    this.organization = params.organization;
    this.reservedHosts = new Set(
      (params.reservedDomains ?? []).map(hostOf).filter((host) => host !== null),
    );
    this.logger = params.logger ?? noopLogger;
  }

  async create(input: CreateAppInput, actor: Actor): Promise<App> {
    actor.permissions.require('organizations:write');
    if (!input.courses && !input.community) {
      throw new InvalidInputError('An app serves courses, the community, or both');
    }
    this.assertNotReserved(input.domain, actor.orgId);
    const app = await this.repo.create({ ...input, orgId: actor.orgId, id: genId('app') });
    this.logger.info('app created', {
      orgId: actor.orgId,
      appId: app.id,
      domain: app.domain,
      actorId: actor.id,
    });
    return app;
  }

  async list(actor: Actor): Promise<App[]> {
    actor.permissions.require('organizations:read');
    return this.repo.list(actor.orgId);
  }

  async update(appId: string, input: UpdateAppInput, actor: Actor): Promise<App> {
    actor.permissions.require('organizations:write');
    const orgId = actor.orgId;
    const current = await this.repo.find(orgId, appId);
    if (!current) {
      throw new NotFoundError('App', appId);
    }
    if (!(input.courses ?? current.courses) && !(input.community ?? current.community)) {
      throw new InvalidInputError('An app serves courses, the community, or both');
    }
    if (input.domain !== undefined) {
      this.assertNotReserved(input.domain, orgId);
    }
    const updated = await this.repo.update(orgId, appId, input);
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

  of(orgId: string): Promise<App[]> {
    return this.repo.list(orgId);
  }

  async at(domain: string): Promise<AppAt | null> {
    if (this.reserved(domain)) {
      return null;
    }
    const app = await this.repo.findByDomain(domain);
    const organization = app ? await this.organization(app.orgId) : null;
    return app && organization ? { app, organization } : null;
  }

  async firstAt(domains: readonly string[]): Promise<AppAt | null> {
    for (const domain of new Set(domains)) {
      const at = await this.at(domain);
      if (at) {
        return at;
      }
    }
    return null;
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
