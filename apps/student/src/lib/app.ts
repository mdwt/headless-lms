import "server-only";

/**
 * Which organization and app the domain of this request is. One deployment
 * serves any organization's domain, so nothing here is configured per
 * organization: the API answers for the visitor's domain.
 */
import { cache } from "react";
import { notFound, unstable_rethrow } from "next/navigation";
import { Organizations, type GetAppResponse } from "@headless-lms/sdk";

import { authHeaders } from "./api/server-call";
import { statusOf } from "./api/shared";

export type AppAtDomain = GetAppResponse;

/** The app at this domain, or `null` when the domain is no app's. One lookup per request. */
export const appAtDomain = cache(async (): Promise<AppAtDomain | null> => {
  try {
    return await Organizations.getApp(await authHeaders());
  } catch (e) {
    unstable_rethrow(e);
    if (statusOf(e) === 404) return null;
    throw e;
  }
});

/** The app at this domain; 404 when there is none or it does not serve courses. */
export async function requireCourseApp(): Promise<AppAtDomain> {
  const at = await appAtDomain();
  if (!at || !at.app.courses) notFound();
  return at;
}
