// entitlements context — service implementation (inbound port).
//
// Mutations run inside the context's UnitOfWork: the domain write and the
// outbox append commit in ONE transaction (transactional outbox). This
// service never publishes — the outbox relay dispatches committed events to
// EventBus subscribers at-least-once.
import type { Entitlement, EntitlementsQuery, GrantEntitlementInput, Page } from './model.js';
import type {
  EntitlementsRepository,
  EntitlementsService,
  EntitlementsUnitOfWork,
} from './ports.js';
import type { Logger } from '../shared/ports.js';
import type { Mailer } from '../shared/mailer.js';
import { noopLogger } from '../shared/logger.js';

export interface EntitlementUrls {
  /** Student portal origin — access-granted emails link into it. */
  studentPortalUrl: string;
}

export class EntitlementsServiceImpl implements EntitlementsService {
  constructor(
    /** Read-only access (list) — runs outside any transaction. */
    private readonly repo: EntitlementsRepository,
    /** Atomic write scope: tx-bound repo + outbox appender. */
    private readonly uow: EntitlementsUnitOfWork,
    private readonly logger: Logger = noopLogger,
    private readonly mailer?: Pick<Mailer, 'send'>,
    private readonly urls?: EntitlementUrls,
  ) {}

  list(orgId: string, query: EntitlementsQuery): Promise<Page<Entitlement>> {
    return this.repo.list(orgId, query);
  }

  async grant(orgId: string, input: GrantEntitlementInput): Promise<Entitlement> {
    const entitlement = await this.uow.run(async ({ entitlements, outbox }) => {
      const created = await entitlements.insert(orgId, input);
      await outbox.append([{ type: 'entitlement.created', orgId, entitlement: created }]);
      return created;
    });
    this.logger.info('entitlement granted', {
      orgId,
      entitlementId: entitlement.id,
      studentId: entitlement.studentId,
      contentId: entitlement.content.id,
      contentType: entitlement.content.type,
    });
    await this.sendAccessGrantedEmail(entitlement);
    return entitlement;
  }

  private async sendAccessGrantedEmail(entitlement: Entitlement): Promise<void> {
    if (!this.mailer || !this.urls) {
      return;
    }
    try {
      await this.mailer.send(entitlement.studentEmail, 'accessGranted', {
        contentTitle: entitlement.content.title,
        contentUrl: `${this.urls.studentPortalUrl}/courses/${entitlement.content.id}`,
      });
    } catch (err) {
      // A failed email must not abort the grant: access is already committed.
      this.logger.error('failed to send access-granted email', {
        entitlementId: entitlement.id,
        studentEmail: entitlement.studentEmail,
        err: err instanceof Error ? err : new Error(String(err)),
      });
    }
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
          ? { type: 'entitlement.deleted', orgId, entitlement: updated }
          : { type: 'entitlement.updated', orgId, entitlement: updated },
      ]);
      return updated;
    });
    if (entitlement) {
      this.logger.info('entitlement status changed', { orgId, entitlementId: id, status });
    }
    return entitlement;
  }
}
