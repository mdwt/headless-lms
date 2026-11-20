import type { App, CreateAppInput, UpdateAppInput } from '../types/index.js';
import type { Actor } from '../shared/actor.js';
import { ConflictError, InvalidInputError, NotFoundError } from '../shared/errors.js';
import { genId } from '../shared/id.js';
import { noopLogger } from '../shared/logger.js';
import { webOrigin } from '../shared/network.js';
import type { Logger } from '../shared/ports.js';
import type { AppAt, AppLookup, OrganizationsRepository } from './ports.js';

export type OrgAppsParams = {
  repo: Pick<
    OrganizationsRepository,
    'findById' | 'createApp' | 'listApps' | 'findAppByDomain' | 'updateApp' | 'deleteApp'
  >;
  reservedDomains: readonly string[];
  logger?: Logger;
};

function hostOf(domain: string): string | null {
  const origin = webOrigin(domain);
  return origin ? new URL(origin).host : null;
}

export function servesCourses(apps: readonly App[]): App | null {
  return apps.find((app) => app.courses) ?? null;
}

export function servesCommunity(apps: readonly App[]): App | null {
  return apps.find((app) => app.community) ?? null;
}

export class OrgApps {
  private readonly repo: OrgAppsParams['repo'];
  private readonly reservedHosts: ReadonlySet<string>;
  private readonly logger: Logger;

  constructor(params: OrgAppsParams) {
    this.repo = params.repo;
    this.reservedHosts = new Set(
      params.reservedDomains.map(hostOf).filter((host) => host !== null),
    );
    this.logger = params.logger ?? noopLogger;
  }

  async list(actor: Actor): Promise<App[]> {
    actor.permissions.require('organizations:read');
    return this.repo.listApps(actor.orgId);
  }

  async create(input: CreateAppInput, actor: Actor): Promise<App> {
    actor.permissions.require('organizations:write');
    if (!input.courses && !input.community) {
      throw new InvalidInputError('An app serves courses, the community, or both');
    }
    this.assertNotReserved(input.domain, actor.orgId);
    const app = await this.repo.createApp({ ...input, orgId: actor.orgId, id: genId('app') });
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
    if (input.domain !== undefined) {
      this.assertNotReserved(input.domain, orgId);
    }
    const updated = await this.repo.updateApp(orgId, appId, input);
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
    const deleted = await this.repo.deleteApp(actor.orgId, appId);
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
    return this.repo.listApps(orgId);
  }

  async find(domain: string): Promise<App | null> {
    return this.reserved(domain) ? null : this.repo.findAppByDomain(domain);
  }

  async at(domain: string): Promise<AppAt | null> {
    const app = await this.find(domain);
    const organization = app ? await this.repo.findById(app.orgId) : null;
    return app && organization ? { app, organization } : null;
  }

  lookup(at: AppAt | null): AppLookup {
    if (!at) {
      throw new NotFoundError('App', 'domain');
    }
    return {
      organization: { name: at.organization.name },
      app: { name: at.app.name, courses: at.app.courses, community: at.app.community },
    };
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
