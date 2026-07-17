// Bridges between Fastify's request/reply and the Web `Request`/`Response` that
// better-auth (and the MCP transport) speak. Both the auth catch-all and the
// MCP route hand a Fastify request to a Web-standard handler and forward the
// Web response back, so the conversion lives here once.
import type { FastifyReply, FastifyRequest } from "fastify";
import { fromNodeHeaders } from "better-auth/node";

/** Builds a Web `Request` from an incoming Fastify request. */
export function toWebRequest(request: FastifyRequest): Request {
  const url = new URL(request.url, `http://${request.headers.host}`);
  // GET/HEAD/DELETE never carry a body; passing one to `Request` throws. For the
  // rest, forward a string body verbatim and JSON-encode a parsed object.
  const hasBody = request.method !== "GET" && request.method !== "HEAD" && request.method !== "DELETE";
  const body = hasBody
    ? typeof request.body === "string"
      ? request.body
      : request.body
        ? JSON.stringify(request.body)
        : undefined
    : undefined;
  return new Request(url.toString(), {
    method: request.method,
    headers: fromNodeHeaders(request.headers),
    body,
  });
}

/** Copies a Web `Response` back onto a Fastify reply, preserving multiple cookies. */
export async function bridgeWebResponse(response: Response, reply: FastifyReply): Promise<void> {
  reply.status(response.status);
  // Emit each Set-Cookie value individually — forEach() collapses multiple
  // Set-Cookie headers into one comma-joined string (undici behaviour), which
  // corrupts multi-cookie auth responses. getSetCookie() returns them as an
  // array so each one is forwarded as a separate header.
  const cookies = response.headers.getSetCookie();
  if (cookies.length > 0) {
    reply.raw.setHeader("set-cookie", cookies);
  }
  response.headers.forEach((value, key) => {
    if (key.toLowerCase() === "set-cookie") return; // already handled above
    reply.header(key, value);
  });
  reply.send(response.body ? await response.text() : null);
}
