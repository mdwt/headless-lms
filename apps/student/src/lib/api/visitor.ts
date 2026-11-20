function first(value: string | null): string | null {
  const head = value?.split(",")[0]?.trim();
  return head ? head : null;
}

export function visitorOrigin(headers: Headers): string {
  const proto = first(headers.get("x-forwarded-proto")) ?? "http";
  const host = first(headers.get("x-forwarded-host")) ?? headers.get("host") ?? "localhost";
  return `${proto}://${host}`;
}

export function visitorHeaders(headers: Headers): Record<string, string> {
  const forwardedFor = headers.get("x-forwarded-for");
  return {
    origin: visitorOrigin(headers),
    ...(forwardedFor && { "x-forwarded-for": forwardedFor }),
  };
}
