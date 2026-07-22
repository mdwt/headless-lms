import { redirect } from "next/navigation";

// The generated SDK returns a `{ data, error, response }` result (its
// `RequestResult` shape) but doesn't re-export the type from the package root,
// so the shape is declared inline here.
export interface SdkResult<T> {
  data?: T;
  error?: unknown;
  response?: { status: number };
}

/**
 * The Learn API answers 401 when the session doesn't resolve to a portal
 * student — a staff login on the shared dev cookie, or a session whose
 * student/org rows no longer exist. That's a routing concern, not an
 * application error: the session is stale/unlinked, so drop it and send the
 * user back to sign in.
 */
export function redirectIfNoStudent(status: number | undefined): void {
  if (status === 401) redirect("/login?reset=1");
}

export function unwrap<T>(result: SdkResult<T>): T {
  if (result.error) {
    redirectIfNoStudent(result.response?.status);
    throw new Error(`API error: ${result.response?.status ?? "unknown"}`);
  }
  return result.data as T;
}
