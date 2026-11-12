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
  /** Runs detached from the request; the adapter logs a failure. */
  sendResetPassword: (
    data: { user: User; url: string; token: string },
    request?: Request,
  ) => Promise<void>;
  /** Runs detached from the request, after the new password is stored; the adapter logs a failure. */
  onPasswordReset: (data: { user: User }, request?: Request) => Promise<void>;
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

export interface McpAuthOptions {
  oauthEnabled: boolean;
  resource: string;
  loginPage: string;
  consentPage: string;
  orgPickerPage: string;
}

export interface OrgHosts {
  /** Whether the origin is a host of any organization. */
  has(origin: string): Promise<boolean>;
  /** Whether the origin is a host of an organization the person with this email is active in. */
  hasFor(email: string, origin: string): Promise<boolean>;
}

export interface CreateAuthOptions {
  db: NodePgDatabase;
  baseUrl: string;
  secret: string;
  trustedOrigins: string[];
  /** Organizations' hosts, trusted beside `trustedOrigins` and asked on every request. Absent → only `trustedOrigins`. */
  orgHosts?: OrgHosts;
  /** Logs failures that must not abort an auth flow (e.g. a failed invite email). */
  logger: Logger;
  /** Handlers for what the engine reports. The adapter owns no rules. */
  hooks: Hooks;
  mcp: McpAuthOptions;
  /** Parent domain for cross-subdomain session cookies (e.g. ".example.com"); undefined → host-only cookie, set for whichever host served the request. */
  cookieDomain?: string;
  /** Mark session cookies Secure (set behind HTTPS / in production). */
  secureCookies?: boolean;
  /** IPs or CIDR ranges of the reverse proxies in front of the API; the client IP is the first address in the forwarded chain that is not one of them. */
  trustedProxies?: string[];
  /** Headers read for the client IP, in order. Absent → x-forwarded-for. */
  ipAddressHeaders?: string[];
}
