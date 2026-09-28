import { type GenericEndpointContext, type Session, type User } from "better-auth";
import { type OrganizationOptions } from "better-auth/plugins";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import type { Logger } from "@headless-lms/core/types";

// The engine's own user/session records, not the domain's — these hooks fire
// inside better-auth, before anything has been mirrored into `users`.
export type Hooks = NonNullable<OrganizationOptions["organizationHooks"]> & {
  beforeUserCreate: (
    user: User & Record<string, unknown>,
    context: GenericEndpointContext | null,
  ) => Promise<
    | boolean
    | void
    | {
        data: User;
      }
  >;
  beforeCreateSession?: (
    session: Session & Record<string, unknown>,
    context: GenericEndpointContext | null,
  ) => Promise<
    | boolean
    | void
    | {
        data: Session & Record<string, unknown>;
      }
  >;
  sendResetPassword: (
    data: { user: User; url: string; token: string },
    request?: Request,
  ) => Promise<void>;
  sendMagicLink: (
    data: {
      email: string;
      url: string;
      token: string;
      metadata?: Record<string, unknown>;
    },
    ctx?: GenericEndpointContext | undefined,
  ) => Promise<void>;
};

export interface CreateAuthOptions {
  db: NodePgDatabase;
  baseUrl: string;
  secret: string;
  trustedOrigins: string[];
  /** Logs failures that must not abort an auth flow (e.g. a failed invite email). */
  logger: Logger;
  /** Handlers for what the engine reports. The adapter owns no rules. */
  hooks: Hooks;
  /** Parent domain for cross-subdomain session cookies (e.g. ".example.com"); undefined → host-only cookie. */
  cookieDomain?: string;
  /** Mark session cookies Secure (set behind HTTPS / in production). */
  secureCookies?: boolean;
}
