const BASE = "http://app.invalid";

export function sameSitePath(value: string | string[] | null | undefined): string | null {
  if (typeof value !== "string" || !value.startsWith("/") || !URL.canParse(value, BASE)) {
    return null;
  }
  const url = new URL(value, BASE);
  return url.origin === BASE ? `${url.pathname}${url.search}${url.hash}` : null;
}

export function withNext(path: string, next: string | null): string {
  if (!next) return path;
  return `${path}${path.includes("?") ? "&" : "?"}next=${encodeURIComponent(next)}`;
}
