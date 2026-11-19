import "server-only";

/**
 * Which organization and app the domain of this request is. One deployment
 * serves any organization's domain, so nothing here is configured per
 * organization: the API answers for the visitor's domain.
 *
 * The answer for a domain is kept for a minute, so a page's renders and
 * prefetches cost one lookup between them and stay well inside the API's limit
 * on it. A change to an organization's apps shows here within that minute; the
 * API itself applies it to sign-in and to every request at once.
 */
import { cache } from "react";
import { notFound, unstable_rethrow } from "next/navigation";
import { Organizations, type GetAppResponse } from "@headless-lms/sdk";

import { visitorCallHeaders } from "./api/server-call";
import { statusOf } from "./api/shared";
import { shortLived } from "./api/short-lived";

export type AppAtDomain = GetAppResponse;

const KEPT_FOR_MS = 60_000;
const DOMAINS_KEPT = 1_000;

const kept = shortLived<AppAtDomain | null>({ ttlMs: KEPT_FOR_MS, max: DOMAINS_KEPT });

/** The app at this domain, or `null` when the domain is no app's. */
export const appAtDomain = cache(async (): Promise<AppAtDomain | null> => {
  const call = await visitorCallHeaders();
  return kept(call.headers.origin ?? "", async () => {
    try {
      return await Organizations.getApp(call);
    } catch (e) {
      unstable_rethrow(e);
      if (statusOf(e) === 404) return null;
      throw e;
    }
  });
});

/** The app at this domain; 404 when there is none or it does not serve courses. */
export async function requireCourseApp(): Promise<AppAtDomain> {
  const at = await appAtDomain();
  if (!at || !at.app.courses) notFound();
  return at;
}
