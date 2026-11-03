import { connect, constants, type ClientHttp2Session } from "node:http2";

export interface Http2Response {
  status: number;
  body: string;
}

export type Http2Transport = (
  origin: string,
  path: string,
  headers: Record<string, string>,
  body: string,
) => Promise<Http2Response>;

const REQUEST_TIMEOUT_MS = 10_000;

export function http2Transport(): Http2Transport {
  const sessions = new Map<string, ClientHttp2Session>();

  const sessionFor = (origin: string): ClientHttp2Session => {
    const existing = sessions.get(origin);
    if (existing && !existing.closed && !existing.destroyed) {
      return existing;
    }
    const session = connect(origin);
    session.unref();
    const forget = () => {
      if (sessions.get(origin) === session) {
        sessions.delete(origin);
      }
    };
    session.on("error", forget);
    session.on("close", forget);
    session.on("goaway", forget);
    sessions.set(origin, session);
    return session;
  };

  return (origin, path, headers, body) =>
    new Promise<Http2Response>((resolve, reject) => {
      let request;
      try {
        request = sessionFor(origin).request({
          [constants.HTTP2_HEADER_METHOD]: "POST",
          [constants.HTTP2_HEADER_PATH]: path,
          ...headers,
        });
      } catch (err) {
        reject(err);
        return;
      }
      let status = 0;
      const chunks: Buffer[] = [];
      request.setTimeout(REQUEST_TIMEOUT_MS, () => {
        request.close(constants.NGHTTP2_CANCEL);
        reject(new Error(`no response from ${origin} within ${REQUEST_TIMEOUT_MS} ms`));
      });
      request.on("response", (responseHeaders) => {
        status = Number(responseHeaders[constants.HTTP2_HEADER_STATUS]);
      });
      request.on("data", (chunk: Buffer) => chunks.push(chunk));
      request.on("end", () => resolve({ status, body: Buffer.concat(chunks).toString("utf8") }));
      request.on("error", reject);
      request.end(body);
    });
}
