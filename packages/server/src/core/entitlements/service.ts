// entitlements context — service implementation (inbound port).
//
// Mutations run inside the context's UnitOfWork: the domain write and the
// outbox append commit in ONE transaction (transactional outbox). This
// service never publishes — the outbox relay dispatches committed events to
// EventBus subscribers at-least-once.
import type { Entitlement, EntitlementsQuery, GrantEnrollmentInput, Page } from "./model.js";
import type {
  EntitlementsRepository,
  EntitlementsService,
  EntitlementsUnitOfWork,
} from "./ports.js";

export class EntitlementsServiceImpl implements EntitlementsService {
  constructor(
    /** Read-only access (list) — runs outside any transaction. */
    private readonly repo: EntitlementsRepository,
    /** Atomic write scope: tx-bound repo + outbox appender. */
    private readonly uow: EntitlementsUnitOfWork,
  ) {}

  list(orgId: string, query: EntitlementsQuery): Promise<Page<Entitlement>> {
    return this.repo.list(orgId, query);
  }

  grant(orgId: string, input: GrantEnrollmentInput): Promise<Entitlement> {
    return this.uow.run(async ({ entitlements, outbox }) => {
      const enrollment = await entitlements.insert(orgId, input);
      await outbox.append([{ type: "enrollment.created", orgId, enrollment }]);
      return enrollment;
    });
  }

  setStatus(
    orgId: string,
    id: string,
    status: "active" | "revoked",
  ): Promise<Entitlement | null> {
    return this.uow.run(async ({ entitlements, outbox }) => {
      const enrollment = await entitlements.setStatus(orgId, id, status);
      if (!enrollment) return null;
      await outbox.append([
        status === "revoked"
          ? { type: "enrollment.deleted", orgId, enrollment }
          : { type: "enrollment.updated", orgId, enrollment },
      ]);
      return enrollment;
    });
  }
}
