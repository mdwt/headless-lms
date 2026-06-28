// Public surface of the generated SDK.
//
// The contents of ./generated are produced by `pnpm gen` (from the OpenAPI spec
// the api emits off its Zod route schemas) — do not edit them by hand. This file
// is the stable, hand-written entrypoint the frontends import.
export * from "./generated";
export { client } from "./generated/client.gen";

import { client } from "./generated/client.gen";

export interface ConfigureSdkOptions {
  /** API origin, e.g. `https://api.example.com` or `http://localhost:3000`. */
  baseUrl: string;
  /**
   * Send credentials (the better-auth session cookie) with every request.
   * Defaults to `"include"` so the browser carries the cookie cross-origin.
   */
  credentials?: RequestCredentials;
}

/** Point the SDK at an API origin. Call once at app startup. */
export function configureSdk({ baseUrl, credentials = "include" }: ConfigureSdkOptions): void {
  client.setConfig({ baseUrl, credentials });
}
