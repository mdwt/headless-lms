import type { App, UpdateAppInput } from '../types/index.js';

export type AppClashKind = 'domain' | 'slug' | 'courses' | 'community' | 'serves';

export class AppClash extends Error {
  constructor(readonly kind: AppClashKind) {
    super(`an app clashes on ${kind}`);
    this.name = 'AppClash';
  }
}

export interface AppsRepository {
  create(app: App): Promise<App>;
  list(orgId: string): Promise<App[]>;
  find(orgId: string, id: string): Promise<App | null>;
  findByDomain(domain: string): Promise<App | null>;
  update(orgId: string, id: string, patch: UpdateAppInput): Promise<App | null>;
  delete(orgId: string, id: string): Promise<App | null>;
}

export function servesCourses(apps: readonly App[]): App | null {
  return apps.find((app) => app.courses) ?? null;
}

export function servesCommunity(apps: readonly App[]): App | null {
  return apps.find((app) => app.community) ?? null;
}

export class AppsService {
  constructor(private readonly repo: Pick<AppsRepository, 'list' | 'findByDomain'>) {}

  of(orgId: string): Promise<App[]> {
    return this.repo.list(orgId);
  }

  at(domain: string): Promise<App | null> {
    return this.repo.findByDomain(domain);
  }

  async firstAt(domains: readonly string[]): Promise<App | null> {
    for (const domain of new Set(domains)) {
      const app = await this.at(domain);
      if (app) {
        return app;
      }
    }
    return null;
  }
}
