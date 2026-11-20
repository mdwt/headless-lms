import "server-only";

import { cache } from "react";
import { notFound, unstable_rethrow } from "next/navigation";
import { Apps, type GetAppResponse } from "@headless-lms/sdk";

import { visitorCallHeaders } from "./api/server-call";
import { statusOf } from "./api/shared";
import { shortLived } from "./api/short-lived";

export type AppAtDomain = GetAppResponse;

const KEPT_FOR_MS = 60_000;
const DOMAINS_KEPT = 1_000;

const kept = shortLived<AppAtDomain | null>({ ttlMs: KEPT_FOR_MS, max: DOMAINS_KEPT });

export const appAtDomain = cache(async (): Promise<AppAtDomain | null> => {
  const call = await visitorCallHeaders();
  return kept(call.headers.origin ?? "", async () => {
    try {
      return await Apps.getApp(call);
    } catch (e) {
      unstable_rethrow(e);
      if (statusOf(e) === 404) return null;
      throw e;
    }
  });
});

export async function requireCourseApp(): Promise<AppAtDomain> {
  const at = await appAtDomain();
  if (!at || !at.app.courses) notFound();
  return at;
}
