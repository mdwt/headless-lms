import type { App } from '../types/index.js';
import type { Organization } from './model.js';

export function platformOrigin(value: string): URL {
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

export function firstAppOf(
  platform: URL,
  org: Pick<Organization, 'id' | 'name' | 'slug'>,
  at: 'platform' | 'subdomain',
): Omit<App, 'id'> {
  const label = labelOf(org.slug) || labelOf(org.id);
  return {
    orgId: org.id,
    name: org.name,
    slug: label,
    domain: at === 'platform' ? platform.origin : `${platform.protocol}//${label}.${platform.host}`,
    courses: true,
    community: true,
  };
}

export function servesCourses(apps: readonly App[]): App | null {
  return apps.find((app) => app.courses) ?? null;
}

export function servesCommunity(apps: readonly App[]): App | null {
  return apps.find((app) => app.community) ?? null;
}
