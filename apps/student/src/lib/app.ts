import "server-only";

import { cache } from "react";
import { headers } from "next/headers";
import { notFound, unstable_rethrow } from "next/navigation";
import { Apps, type GetAppResponse } from "@headless-lms/sdk";

import { statusOf } from "./api/shared";
import { shortLived } from "./api/short-lived";
import { visitorHeaders } from "./api/visitor";

const KEPT_FOR_MS = 60_000;
const DOMAINS_KEPT = 1_000;

const kept = shortLived<GetAppResponse | null>({ ttlMs: KEPT_FOR_MS, max: DOMAINS_KEPT });

export const appAtDomain = cache(async (): Promise<GetAppResponse | null> => {
  const visitor = visitorHeaders(await headers());
  return kept(visitor.origin, async () => {
    try {
      return await Apps.getApp({ headers: visitor });
    } catch (e) {
      unstable_rethrow(e);
      if (statusOf(e) === 404) return null;
      throw e;
    }
  });
});

export async function requireCourseApp(): Promise<GetAppResponse> {
  const at = await appAtDomain();
  if (!at || !at.app.courses) notFound();
  return at;
}
