// entitlements context — service implementation (inbound port).
//
// Mutations run inside the context's UnitOfWork: the domain write and the
// outbox append commit in ONE transaction (transactional outbox). This
// service never publishes — the outbox relay dispatches committed events to
// EventBus subscribers at-least-once.
import type { Enrollment, EntitlementsQuery, GrantEnrollmentInput, Page } from './model.js';
import type {
  EntitlementsRepository,
  EntitlementsService,
  EntitlementsUnitOfWork,
} from './ports.js';
import type { Logger } from '../shared/ports.js';
import { noopLogger } from '../shared/logger.js';

export class EntitlementsServiceImpl implements EntitlementsService {
  constructor(
    /** Read-only access (list) — runs outside any transaction. */
    private readonly repo: EntitlementsRepository,
    /** Atomic write scope: tx-bound repo + outbox appender. */
    private readonly uow: EntitlementsUnitOfWork,
    private readonly logger: Logger = noopLogger,
  ) {}

  list(orgId: string, query: EntitlementsQuery): Promise<Page<Enrollment>> {
    return this.repo.list(orgId, query);
  }

  async grant(orgId: string, input: GrantEnrollmentInput): Promise<Enrollment> {
    const enrollment = await this.uow.run(async ({ entitlements, outbox }) => {
      const created = await entitlements.insert(orgId, input);
      await outbox.append([{ type: 'enrollment.created', orgId, enrollment: created }]);
      return created;
    });
    this.logger.info('enrollment granted', {
      orgId,
      enrollmentId: enrollment.id,
      studentId: enrollment.studentId,
      courseId: enrollment.courseId,
    });
    return enrollment;
  }

  async setStatus(
    orgId: string,
    id: string,
    status: 'active' | 'revoked',
  ): Promise<Enrollment | null> {
    const enrollment = await this.uow.run(async ({ entitlements, outbox }) => {
      const updated = await entitlements.setStatus(orgId, id, status);
      if (!updated) {
        return null;
      }
      await outbox.append([
        status === 'revoked'
          ? { type: 'enrollment.deleted', orgId, enrollment: updated }
          : { type: 'enrollment.updated', orgId, enrollment: updated },
      ]);
      return updated;
    });
    if (enrollment) {
      this.logger.info('enrollment status changed', { orgId, enrollmentId: id, status });
    }
    return enrollment;
  }
}
