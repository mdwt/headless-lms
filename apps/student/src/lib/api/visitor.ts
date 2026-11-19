/**
 * What the API needs to know about the visitor behind a call this app makes or
 * forwards: the domain they are on, which names the organization, and their IP
 * address, which the API's rate limits count.
 */

function first(value: string | null): string | null {
  const head = value?.split(",")[0]?.trim();
  return head ? head : null;
}

/** The origin the visitor's browser is on, from the request this app received. */
export function visitorOrigin(headers: Headers): string {
  const proto = first(headers.get("x-forwarded-proto")) ?? "http";
  const host = first(headers.get("x-forwarded-host")) ?? headers.get("host") ?? "localhost";
  return `${proto}://${host}`;
}

/** Headers for a call this app's server makes on the visitor's behalf. */
export function visitorHeaders(headers: Headers): Record<string, string> {
  const forwardedFor = headers.get("x-forwarded-for");
  return {
    origin: visitorOrigin(headers),
    ...(forwardedFor && { "x-forwarded-for": forwardedFor }),
  };
}
