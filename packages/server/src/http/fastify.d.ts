import 'fastify';
import type { User } from '@headless-lms/core/types';
import type { ResolvedCaller } from '@headless-lms/core/organizations';

/** The session's account as the HTTP layer sees it. Re-exported from the
 *  package entry point so this module — and its augmentation — gets loaded. */
export type AuthUser = User;

declare module 'fastify' {
  interface FastifyContextConfig {
    /** A server-sent event stream; shutdown waits for it to finish. */
    eventStream?: boolean;
  }
  interface FastifyInstance {
    /** Session guard. Populates `authUser` (and `orgId` when the session has an
     *  active org), or throws `UnauthorizedError`. Use for the routes reached
     *  before the caller has an org — org creation, invite acceptance. */
    requireSession(request: FastifyRequest): Promise<void>;
    /** As `requireSession`, but also requires an active org on the session. */
    requireOrgSession(request: FastifyRequest): Promise<void>;
  }
  interface FastifyRequest {
    authUser: User;
    /** Domain `organizations.id` for the session's active org — what every
     *  domain read keys off. Guaranteed set by `requireOrgSession`; absent under
     *  `requireSession` when the session has no active org. */
    orgId: string;
    /** The same org as better-auth knows it (`organizations.external_id`), for
     *  writes that go back through the auth provider. Equal to `orgId` today:
     *  the org-create hook gives better-auth the domain id and records it as
     *  the external id. */
    authOrgId: string;
    /** Domain `users.id` for the session's account — what `org_users.user_id`
     *  and every other domain row references. Not `authUser.id`: the two match
     *  only for a self-signup, never for a person an admin provisioned first. */
    userId: string;
    resolvedCaller?: ResolvedCaller;
  }
}
