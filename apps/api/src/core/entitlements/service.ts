// entitlements context — service implementation (inbound port).
//
// Events are published after the awaited repo call returns. Repo methods are
// single auto-committed statements (no transactions in this codebase), so
// publish always happens after commit. If these writes ever move inside a
// transaction, switch to a transactional outbox (planned with automations).
import type { EventBus } from "../shared/ports.js";
import type { EnrollmentCreated, EnrollmentDeleted, EnrollmentUpdated } from "./events.js";
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

  // Re-granting an existing enrollment (the repo upserts) also emits created.
  async grant(orgId: string, input: GrantEntitlementInput): Promise<Entitlement> {
    const enrollment = await this.repo.insert(orgId, input);
    const event: EnrollmentCreated = { type: "enrollment.created", orgId, enrollment };
    await this.events.publish(event);
    return enrollment;
  }

  async setStatus(
    orgId: string,
    id: string,
    status: "active" | "revoked",
  ): Promise<Entitlement | null> {
    const enrollment = await this.repo.setStatus(orgId, id, status);
    if (!enrollment) return null;
    const event: EnrollmentDeleted | EnrollmentUpdated =
      status === "revoked"
        ? { type: "enrollment.deleted", orgId, enrollment }
        : { type: "enrollment.updated", orgId, enrollment };
    await this.events.publish(event);
    return enrollment;
  }
}
