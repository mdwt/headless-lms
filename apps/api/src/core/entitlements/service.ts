// entitlements context — service implementation (inbound port).
import type {
  Entitlement,
  EntitlementsQuery,
  GrantEntitlementInput,
  Page,
} from "./model.js";
import type { EntitlementsRepository, EntitlementsService } from "./ports.js";

export class EntitlementsServiceImpl implements EntitlementsService {
  constructor(private readonly repo: EntitlementsRepository) {}

  list(orgId: string, query: EntitlementsQuery): Promise<Page<Entitlement>> {
    return this.repo.list(orgId, query);
  }

  grant(orgId: string, input: GrantEntitlementInput): Promise<Entitlement> {
    return this.repo.insert(orgId, input);
  }

  setStatus(orgId: string, id: string, status: "active" | "revoked"): Promise<Entitlement | null> {
    return this.repo.setStatus(orgId, id, status);
  }
}
