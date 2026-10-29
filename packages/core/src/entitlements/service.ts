// entitlements context — service implementation (inbound port).
//
// Mutations run inside the context's UnitOfWork: the domain write and the
// outbox append commit in ONE transaction (transactional outbox). This
// service never publishes — the outbox relay republishes committed events to
// the EventBus at-least-once.
import type {
  ContentType,
  Entitlement,
  EntitlementsQuery,
  GrantEntitlementInput,
  Page,
} from './model.js';
import type {
  EntitlementsRepository,
  EntitlementsService,
  EntitlementsUnitOfWork,
} from './ports.js';
import type { Logger } from '../shared/ports.js';
import { noopLogger } from '../shared/logger.js';
import { entitlementEvents } from './events.js';

export type EntitlementsServiceParams = {
  /** Read-only access (list) — runs outside any transaction. */
  repo: EntitlementsRepository;
  /** Atomic write scope: tx-bound repo + outbox appender. */
  uow: EntitlementsUnitOfWork;
  logger?: Logger;
};

export class EntitlementsServiceImpl implements EntitlementsService {
  private readonly repo: EntitlementsRepository;
  private readonly uow: EntitlementsUnitOfWork;
  private readonly logger: Logger;

  constructor(params: EntitlementsServiceParams) {
    this.repo = params.repo;
    this.uow = params.uow;
    this.logger = params.logger ?? noopLogger;
  }

  list(orgId: string, query: EntitlementsQuery): Promise<Page<Entitlement>> {
    return this.repo.list(orgId, query);
  }

  async grant(orgId: string, input: GrantEntitlementInput): Promise<Entitlement> {
    const entitlement = await this.uow.run(async ({ entitlements, outbox }) => {
      const created = await entitlements.insert(orgId, input);
      await outbox.append([
        entitlementEvents.entitlementCreated.make({
          orgId,
          data: created,
        }),
      ]);
      return created;
    });
    this.logger.info('entitlement granted', {
      orgId,
      entitlementId: entitlement.id,
      orgUserId: entitlement.orgUserId,
      bundleId: entitlement.bundleId,
      contentId: entitlement.contentId,
    });
    return entitlement;
  }

  async setStatus(
    orgId: string,
    id: string,
    status: 'active' | 'revoked',
  ): Promise<Entitlement | null> {
    const entitlement = await this.uow.run(async ({ entitlements, outbox }) => {
      const updated = await entitlements.setStatus(orgId, id, status);
      if (!updated) {
        return null;
      }
      await outbox.append([
        status === 'revoked'
          ? entitlementEvents.entitlementDeleted.make({
              orgId,
              data: updated,
            })
          : entitlementEvents.entitlementUpdated.make({
              orgId,
              data: updated,
            }),
      ]);
      return updated;
    });
    if (entitlement) {
      this.logger.info('entitlement status changed', { orgId, entitlementId: id, status });
    }
    return entitlement;
  }

  hasAccess(orgId: string, orgUserId: string, contentId: string): Promise<boolean> {
    return this.repo.hasAccess(orgId, orgUserId, contentId);
  }

  listAccessibleContent(orgId: string, orgUserId: string, type?: ContentType): Promise<string[]> {
    return this.repo.listAccessibleContent(orgId, orgUserId, type);
  }
}
