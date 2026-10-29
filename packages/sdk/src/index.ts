// Public surface of the generated SDK.
//
// The contents of ./generated are produced by `pnpm gen` (from the OpenAPI spec
// the api emits off its Zod route schemas) — do not edit them by hand. This file
// is the stable, hand-written entrypoint the frontends import.
export * from "./generated/types.gen";
export type { Options } from "./generated/sdk.gen";
export { client } from "./generated/client.gen";

import { client } from "./generated/client.gen";
import {
  Assets as AssetsGen,
  Automations as AutomationsGen,
  Chats as ChatsGen,
  Communities as CommunitiesGen,
  Content as ContentGen,
  Discussion as DiscussionGen,
  Entitlements as EntitlementsGen,
  Files as FilesGen,
  Integrations as IntegrationsGen,
  Notifications as NotificationsGen,
  Organizations as OrganizationsGen,
  Posts as PostsGen,
  Profile as ProfileGen,
  Progress as ProgressGen,
  Reporting as ReportingGen,
} from "./generated/sdk.gen";

/**
 * Every generated method resolves to `T | undefined`, because hey-api's
 * `ThrowOnError` generic is per-call and defaults to `false` — a setting on the
 * client can't narrow it. `configureSdk` turns `throwOnError` on, so a failed
 * request throws rather than resolving to `undefined`; this remaps the services
 * to the shape they actually have at runtime, and call sites get `T` directly.
 */
type Throwing<S> = {
  [K in keyof S]: S[K] extends (...args: infer A) => Promise<infer R>
    ? (...args: A) => Promise<Exclude<R, undefined>>
    : S[K];
};

export const Assets = AssetsGen as Throwing<typeof AssetsGen>;
export const Automations = AutomationsGen as Throwing<typeof AutomationsGen>;
export const Chats = ChatsGen as Throwing<typeof ChatsGen>;
export const Communities = CommunitiesGen as Throwing<typeof CommunitiesGen>;
export const Content = ContentGen as Throwing<typeof ContentGen>;
export const Discussion = DiscussionGen as Throwing<typeof DiscussionGen>;
export const Entitlements = EntitlementsGen as Throwing<typeof EntitlementsGen>;
export const Files = FilesGen as Throwing<typeof FilesGen>;
export const Integrations = IntegrationsGen as Throwing<typeof IntegrationsGen>;
export const Notifications = NotificationsGen as Throwing<typeof NotificationsGen>;
export const Organizations = OrganizationsGen as Throwing<typeof OrganizationsGen>;
export const Posts = PostsGen as Throwing<typeof PostsGen>;
export const Profile = ProfileGen as Throwing<typeof ProfileGen>;
export const Progress = ProgressGen as Throwing<typeof ProgressGen>;
export const Reporting = ReportingGen as Throwing<typeof ReportingGen>;

export interface ConfigureSdkOptions {
  /** API origin, e.g. `https://api.example.com` or `http://localhost:8000`. */
  baseUrl: string;
  /**
   * Send credentials (the better-auth session cookie) with every request.
   * Defaults to `"include"` so the browser carries the cookie cross-origin.
   */
  credentials?: RequestCredentials;
  /**
   * Map a failed request into the error the app wants to throw. Receives the
   * parsed response body (whatever the API sent) and the `Response` — absent
   * when the request never got one (network error). Whatever it returns is
   * thrown from the call site; without it the raw body is thrown, which is
   * rarely an `Error`.
   */
  onError?: (error: unknown, response: Response | undefined) => unknown;
}

/** Point the SDK at an API origin. Call once at app startup. */
export function configureSdk({
  baseUrl,
  credentials = "include",
  onError,
}: ConfigureSdkOptions): void {
  client.setConfig({ baseUrl, credentials, throwOnError: true });
  if (onError) {
    client.interceptors.error.use((error, response) => onError(error, response));
  }
}
