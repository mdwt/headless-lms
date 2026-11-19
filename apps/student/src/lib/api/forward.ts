import { visitorOrigin } from "./visitor";

/**
 * Forwards a request under `/api` to the API, so the browser only ever talks to
 * the domain it is on: the session cookie belongs to that domain, and the API
 * reads the domain to know which organization the request is for.
 *
 * The visitor's `Origin` is passed on as sent, since the API's cross-site checks
 * read it. A read carries none, so it gets this app's own domain. The visitor's
 * IP address rides along in `X-Forwarded-For`.
 */

const NOT_FORWARDED = new Set([
  "connection",
  "content-length",
  "host",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

const NOT_RETURNED = new Set([
  "connection",
  "content-encoding",
  "content-length",
  "keep-alive",
  "set-cookie",
  "transfer-encoding",
]);

const BODILESS = new Set([101, 204, 205, 304]);

export async function forwardToApi(
  request: Request,
  apiUrl: string,
  send: typeof fetch = fetch,
): Promise<Response> {
  const { pathname, search } = new URL(request.url);
  const headers = new Headers();
  request.headers.forEach((value, key) => {
    if (!NOT_FORWARDED.has(key)) {
      headers.set(key, value);
    }
  });
  const read = request.method === "GET" || request.method === "HEAD";
  if (read && !headers.has("origin")) {
    headers.set("origin", visitorOrigin(request.headers));
  }

  let answer: Response;
  try {
    answer = await send(`${apiUrl}${pathname}${search}`, {
      method: request.method,
      headers,
      redirect: "manual",
      signal: request.signal,
      ...(!read && { body: request.body, duplex: "half" }),
    } as RequestInit);
  } catch {
    return Response.json(
      { error: "bad_gateway", message: "The API did not answer" },
      { status: 502 },
    );
  }

  const returned = new Headers();
  answer.headers.forEach((value, key) => {
    if (!NOT_RETURNED.has(key)) {
      returned.set(key, value);
    }
  });
  for (const cookie of answer.headers.getSetCookie()) {
    returned.append("set-cookie", cookie);
  }
  return new Response(BODILESS.has(answer.status) ? null : answer.body, {
    status: answer.status,
    statusText: answer.statusText,
    headers: returned,
  });
}
