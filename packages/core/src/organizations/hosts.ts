import type { Hosts } from '../types/index.js';
import type { Logger } from '../shared/ports.js';
import type { Actor } from '../shared/actor.js';
import { NotFoundError } from '../shared/errors.js';
import { noopLogger } from '../shared/logger.js';
import { SettingsNamespace, type SettingsService } from '../shared/settings.js';

export type OrgHostSettingsParams = {
  settings: SettingsService;
  platformHost: string;
  logger?: Logger;
};

function storedHost(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function platformOrigin(value: string): URL {
  const url = URL.canParse(value) ? new URL(value) : null;
  const web = url?.protocol === 'https:' || url?.protocol === 'http:';
  if (!url || !web || url.pathname !== '/' || url.search !== '' || url.hash !== '') {
    throw new Error(
      `The platform host must be an origin such as https://example.com, got "${value}"`,
    );
  }
  return url;
}

function labelOf(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export class OrgHostSettings {
  private readonly settings: SettingsService;
  private readonly platform: URL;
  private readonly logger: Logger;

  constructor(params: OrgHostSettingsParams) {
    this.settings = params.settings;
    this.platform = platformOrigin(params.platformHost);
    this.logger = params.logger ?? noopLogger;
  }

  async replace(hosts: Hosts, actor: Actor): Promise<Hosts> {
    actor.permissions.require('organizations:write');
    await this.store(actor.orgId, hosts);
    this.logger.info('org hosts replaced', { orgId: actor.orgId, orgUserId: actor.id });
    return { courses: hosts.courses, community: hosts.community };
  }

  async assign(orgId: string, slug: string): Promise<Hosts> {
    const host = `${this.platform.protocol}//${labelOf(slug) || labelOf(orgId)}.${this.platform.host}`;
    const hosts = { courses: host, community: host };
    await this.store(orgId, hosts);
    this.logger.info('org hosts assigned', { orgId, host });
    return hosts;
  }

  async resolve(orgId: string): Promise<Hosts> {
    const value = await this.settings.get<{ hosts?: Record<string, unknown> | null }>(
      orgId,
      SettingsNamespace.organizations,
      orgId,
    );
    const courses = storedHost(value?.hosts?.courses);
    const community = storedHost(value?.hosts?.community);
    if (!courses || !community) {
      throw new NotFoundError('Organization hosts', orgId);
    }
    return { courses, community };
  }

  private async store(orgId: string, hosts: Hosts): Promise<void> {
    await this.settings.patch(orgId, SettingsNamespace.organizations, orgId, {
      hosts: { courses: hosts.courses, community: hosts.community },
    });
  }
}
