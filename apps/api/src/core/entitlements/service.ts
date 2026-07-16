// entitlements context — service implementation (inbound port).
import type { EventBus } from "../shared/ports.js";
import type { EntitlementGranted, EntitlementReinstated, EntitlementRevoked } from "./events.js";
import type { Entitlement, EntitlementsQuery, GrantEntitlementInput, Page } from "./model.js";
import type { EntitlementsRepository, EntitlementsService } from "./ports.js";

export class EntitlementsServiceImpl implements EntitlementsService {
  constructor(
    private readonly repo: EntitlementsRepository,
    private readonly events: EventBus,
  ) {}

  list(orgId: string, query: EntitlementsQuery): Promise<Page<Entitlement>> {
    return this.repo.list(orgId, query);
  }

  // Re-granting an existing enrollment (the repo upserts) still emits granted.
  async grant(orgId: string, input: GrantEntitlementInput): Promise<Entitlement> {
    const entitlement = await this.repo.insert(orgId, input);
    const event: EntitlementGranted = { type: "entitlement.granted", orgId, entitlement };
    await this.events.publish(event);
    return entitlement;
  }

  async setStatus(
    orgId: string,
    id: string,
    status: "active" | "revoked",
  ): Promise<Entitlement | null> {
    const entitlement = await this.repo.setStatus(orgId, id, status);
    if (!entitlement) return null;
    const event: EntitlementRevoked | EntitlementReinstated =
      status === "revoked"
        ? { type: "entitlement.revoked", orgId, entitlement }
        : { type: "entitlement.reinstated", orgId, entitlement };
    await this.events.publish(event);
    return entitlement;
  }
}
