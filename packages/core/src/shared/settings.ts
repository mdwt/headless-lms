// Cross-cutting settings: storage, scoping and resolution for every domain's
// configuration. Not a bounded context: it is a leaf every context may import, and it imports
// no context.

export interface SettingsRecord {
  namespace: string;
  scopeId: string;
  value?: Record<string, unknown>;
}

export enum SettingsNamespace {
  content = 'content',
}

export interface SettingsRepository {
  /** Rows for the given scopes, optionally narrowed to one namespace. */
  find(orgId: string, scopeId: string, namespace?: string): Promise<SettingsRecord[]>;
  /** Deep-merges the patch into the row's value, inserting when absent. Nested
   *  objects merge key by key; arrays and scalars are replaced outright. */
  patch(orgId: string, namespace: string, scopeId: string, value: unknown): Promise<SettingsRecord>;
}

export class SettingsService {
  constructor(private readonly repo: SettingsRepository) {}

  async get<T>(
    orgId: string,
    namespace: string,
    scopeId: string,
    defaultIfNull?: T,
  ): Promise<T | undefined> {
    const rows = await this.repo.find(orgId, scopeId, namespace);
    return (rows[0]?.value as T) ?? defaultIfNull;
  }

  async patch<T>(orgId: string, namespace: string, scopeId: string, value: unknown): Promise<T> {
    const row = await this.repo.patch(orgId, namespace, scopeId, value);
    return row.value as T;
  }
}
