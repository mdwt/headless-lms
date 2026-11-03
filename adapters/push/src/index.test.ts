import { createECDH, createPublicKey, generateKeyPairSync, randomBytes, verify } from "node:crypto";
import { describe, expect, it } from "vitest";
import webpush from "web-push";
import type { PushDevice, PushMessage } from "@headless-lms/core/types";
import {
  APNS_PRODUCTION,
  APNS_SANDBOX,
  FCM_SCOPE,
  PushAdapter,
  type Http2Transport,
} from "./index.js";

const ec = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const APNS_KEY = ec.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const rsa = generateKeyPairSync("rsa", { modulusLength: 2048 });
const FCM_KEY = rsa.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const VAPID = webpush.generateVAPIDKeys();

const APNS = { teamId: "TEAM1", keyId: "KEY1", key: APNS_KEY, bundleIds: ["com.example.app"] };
const FCM = {
  serviceAccount: {
    project_id: "proj-1",
    client_email: "push@proj-1.iam.gserviceaccount.com",
    private_key: FCM_KEY,
    token_uri: "https://oauth2.example.test/token",
  },
};
const WEBPUSH = {
  publicKey: VAPID.publicKey,
  privateKey: VAPID.privateKey,
  subject: "mailto:ops@example.com",
};

const MESSAGE: PushMessage = {
  title: "James mentioned you",
  body: "See you at practice",
  data: {
    notificationId: "ntf_1",
    type: "mention",
    subject: { type: "comment", id: "cmt_1" },
    parent: { type: "post", id: "pst_1" },
    communityId: "cmy_1",
    spaceId: "spc_1",
  },
};

function apnsDevice(id: string, overrides: Partial<PushDevice> = {}): PushDevice {
  return {
    id,
    provider: "apns",
    token: `apns-token-${id}`,
    p256dh: null,
    auth: null,
    appId: "com.example.app",
    environment: "production",
    ...overrides,
  };
}

function fcmDevice(id: string): PushDevice {
  return {
    id,
    provider: "fcm",
    token: `fcm-token-${id}`,
    p256dh: null,
    auth: null,
    appId: null,
    environment: null,
  };
}

function webpushDevice(id: string, overrides: Partial<PushDevice> = {}): PushDevice {
  const keys = createECDH("prime256v1");
  keys.generateKeys();
  return {
    id,
    provider: "webpush",
    token: `https://push.example.test/send/${id}`,
    p256dh: keys.getPublicKey().toString("base64url"),
    auth: randomBytes(16).toString("base64url"),
    appId: null,
    environment: null,
    ...overrides,
  };
}

type Http2Call = { origin: string; path: string; headers: Record<string, string>; body: string };

function fakeHttp2(...responses: ({ status: number; reason?: string } | Error)[]) {
  const calls: Http2Call[] = [];
  const transport: Http2Transport = async (origin, path, headers, body) => {
    calls.push({ origin, path, headers, body });
    const next = responses.length > 1 ? responses.shift()! : responses[0]!;
    if (next instanceof Error) {
      throw next;
    }
    return {
      status: next.status,
      body: next.reason ? JSON.stringify({ reason: next.reason }) : "",
    };
  };
  return { calls, transport };
}

type FetchCall = { url: string; init: RequestInit };
type Reply = Response | Error | ((url: string) => Response | Error);

function fakeFetch(...replies: Reply[]) {
  const calls: FetchCall[] = [];
  const fetchFn = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const next = replies.length > 1 ? replies.shift()! : replies[0]!;
    const reply = typeof next === "function" ? next(String(url)) : next;
    if (reply instanceof Error) {
      throw reply;
    }
    return reply.clone();
  }) as typeof fetch;
  return { calls, fetchFn };
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function fcmFailure(status: number, statusText: string, errorCode?: string): Response {
  return json(status, {
    error: {
      code: status,
      status: statusText,
      message: "failed",
      details: errorCode
        ? [{ "@type": "type.googleapis.com/google.firebase.fcm.v1.FcmError", errorCode }]
        : [],
    },
  });
}

const TOKEN = () =>
  json(200, { access_token: "ya29.token", expires_in: 3600, token_type: "Bearer" });

function fcmRoutes(
  send: Response | Error | (() => Response | Error),
  token: () => Response = TOKEN,
) {
  return (url: string) => {
    if (url === FCM.serviceAccount.token_uri) {
      return token();
    }
    return typeof send === "function" ? send() : send;
  };
}

function decodeJwt(jwt: string) {
  const [header, claims, signature] = jwt.split(".");
  return {
    header: JSON.parse(Buffer.from(header!, "base64url").toString()),
    claims: JSON.parse(Buffer.from(claims!, "base64url").toString()),
    signed: Buffer.from(`${header}.${claims}`),
    signature: Buffer.from(signature!, "base64url"),
  };
}

describe("PushAdapter with APNs", () => {
  it("sends over HTTP/2 with a signed provider token and the app id as topic", async () => {
    const { calls, transport } = fakeHttp2({ status: 200 });
    const adapter = new PushAdapter(
      { apns: APNS },
      { http2: transport, now: () => 1_700_000_000_000 },
    );

    const result = await adapter.send([apnsDevice("dev_1")], MESSAGE);

    expect(result).toEqual({ deadDeviceIds: [] });
    expect(calls).toHaveLength(1);
    const [call] = calls;
    expect(call!.origin).toBe(APNS_PRODUCTION);
    expect(call!.path).toBe("/3/device/apns-token-dev_1");
    expect(call!.headers).toMatchObject({
      "apns-topic": "com.example.app",
      "apns-push-type": "alert",
      "apns-priority": "10",
      "content-type": "application/json",
    });
    expect(JSON.parse(call!.body)).toEqual({
      aps: { alert: { title: MESSAGE.title, body: MESSAGE.body } },
      data: MESSAGE.data,
    });
    const jwt = decodeJwt(call!.headers.authorization!.replace(/^bearer /, ""));
    expect(jwt.header).toEqual({ alg: "ES256", kid: "KEY1" });
    expect(jwt.claims).toEqual({ iss: "TEAM1", iat: 1_700_000_000 });
    expect(
      verify(
        "sha256",
        jwt.signed,
        { key: createPublicKey(ec.privateKey), dsaEncoding: "ieee-p1363" },
        jwt.signature,
      ),
    ).toBe(true);
  });

  it("sends a sandbox device to the sandbox host", async () => {
    const { calls, transport } = fakeHttp2({ status: 200 });
    const adapter = new PushAdapter({ apns: APNS }, { http2: transport });

    await adapter.send([apnsDevice("dev_1", { environment: "sandbox" })], MESSAGE);

    expect(calls[0]!.origin).toBe(APNS_SANDBOX);
  });

  it("reuses the provider token for 50 minutes and signs a new one after", async () => {
    let now = 1_700_000_000_000;
    const { calls, transport } = fakeHttp2({ status: 200 });
    const adapter = new PushAdapter({ apns: APNS }, { http2: transport, now: () => now });

    await adapter.send([apnsDevice("dev_1")], MESSAGE);
    now += 49 * 60 * 1000;
    await adapter.send([apnsDevice("dev_1")], MESSAGE);
    now += 2 * 60 * 1000;
    await adapter.send([apnsDevice("dev_1")], MESSAGE);

    const tokens = calls.map((call) => call.headers.authorization);
    expect(tokens[1]).toBe(tokens[0]);
    expect(tokens[2]).not.toBe(tokens[0]);
  });

  it.each([
    [410, "Unregistered"],
    [400, "BadDeviceToken"],
    [400, "DeviceTokenNotForTopic"],
  ])("reports the device dead on %i %s", async (status, reason) => {
    const { transport } = fakeHttp2({ status, reason });
    const adapter = new PushAdapter({ apns: APNS }, { http2: transport });

    await expect(adapter.send([apnsDevice("dev_1")], MESSAGE)).resolves.toEqual({
      deadDeviceIds: ["dev_1"],
    });
  });

  it.each([
    [429, "TooManyRequests"],
    [500, "InternalServerError"],
    [503, "ServiceUnavailable"],
  ])("throws on %i %s when no device accepted", async (status, reason) => {
    const { transport } = fakeHttp2({ status, reason });
    const adapter = new PushAdapter({ apns: APNS }, { http2: transport });

    await expect(adapter.send([apnsDevice("dev_1")], MESSAGE)).rejects.toThrow(
      `apns ${status} ${reason}`,
    );
  });

  it("throws on a network error when no device accepted", async () => {
    const { transport } = fakeHttp2(new Error("ECONNRESET"));
    const adapter = new PushAdapter({ apns: APNS }, { http2: transport });

    await expect(adapter.send([apnsDevice("dev_1")], MESSAGE)).rejects.toThrow("ECONNRESET");
  });

  it("neither throws nor reports dead on a failure that is not worth retrying", async () => {
    const { transport } = fakeHttp2({ status: 400, reason: "BadTopic" });
    const adapter = new PushAdapter({ apns: APNS }, { http2: transport });

    await expect(adapter.send([apnsDevice("dev_1")], MESSAGE)).resolves.toEqual({
      deadDeviceIds: [],
    });
  });

  it("signs a new provider token after APNs answers ExpiredProviderToken, and retries", async () => {
    let now = 1_700_000_000_000;
    const { calls, transport } = fakeHttp2(
      { status: 403, reason: "ExpiredProviderToken" },
      { status: 200 },
    );
    const adapter = new PushAdapter({ apns: APNS }, { http2: transport, now: () => now });

    await expect(adapter.send([apnsDevice("dev_1")], MESSAGE)).rejects.toThrow(
      "ExpiredProviderToken",
    );
    now += 1000;
    await adapter.send([apnsDevice("dev_1")], MESSAGE);

    expect(calls[1]!.headers.authorization).not.toBe(calls[0]!.headers.authorization);
  });

  it("does not send to a device without an app id", async () => {
    const { calls, transport } = fakeHttp2({ status: 200 });
    const adapter = new PushAdapter({ apns: APNS }, { http2: transport });

    await expect(adapter.send([apnsDevice("dev_1", { appId: null })], MESSAGE)).resolves.toEqual({
      deadDeviceIds: [],
    });
    expect(calls).toHaveLength(0);
  });
});

describe("PushAdapter with FCM", () => {
  it("exchanges a signed service-account assertion for an access token and sends HTTP v1", async () => {
    const { calls, fetchFn } = fakeFetch(
      fcmRoutes(json(200, { name: "projects/proj-1/messages/1" })),
    );
    const adapter = new PushAdapter({ fcm: FCM }, { fetch: fetchFn, now: () => 1_700_000_000_000 });

    await expect(adapter.send([fcmDevice("dev_1")], MESSAGE)).resolves.toEqual({
      deadDeviceIds: [],
    });

    expect(calls.map((call) => call.url)).toEqual([
      "https://oauth2.example.test/token",
      "https://fcm.googleapis.com/v1/projects/proj-1/messages:send",
    ]);
    const form = new URLSearchParams(String(calls[0]!.init.body));
    expect(form.get("grant_type")).toBe("urn:ietf:params:oauth:grant-type:jwt-bearer");
    const jwt = decodeJwt(form.get("assertion")!);
    expect(jwt.header).toEqual({ alg: "RS256", typ: "JWT" });
    expect(jwt.claims).toEqual({
      iss: "push@proj-1.iam.gserviceaccount.com",
      scope: FCM_SCOPE,
      aud: "https://oauth2.example.test/token",
      iat: 1_700_000_000,
      exp: 1_700_003_600,
    });
    expect(verify("sha256", jwt.signed, createPublicKey(rsa.privateKey), jwt.signature)).toBe(true);
    expect(new Headers(calls[1]!.init.headers).get("authorization")).toBe("Bearer ya29.token");
    expect(JSON.parse(String(calls[1]!.init.body))).toEqual({
      message: {
        token: "fcm-token-dev_1",
        notification: { title: MESSAGE.title, body: MESSAGE.body },
        data: {
          notificationId: "ntf_1",
          type: "mention",
          subject: JSON.stringify({ type: "comment", id: "cmt_1" }),
          parent: JSON.stringify({ type: "post", id: "pst_1" }),
          communityId: "cmy_1",
          spaceId: "spc_1",
        },
      },
    });
  });

  it("leaves out an absent subject, parent, community or space from the data", async () => {
    const { calls, fetchFn } = fakeFetch(fcmRoutes(json(200, {})));
    const adapter = new PushAdapter({ fcm: FCM }, { fetch: fetchFn });

    await adapter.send([fcmDevice("dev_1")], {
      ...MESSAGE,
      data: { ...MESSAGE.data, subject: null, parent: null, communityId: null, spaceId: null },
    });

    expect(JSON.parse(String(calls[1]!.init.body)).message.data).toEqual({
      notificationId: "ntf_1",
      type: "mention",
    });
  });

  it("keeps the access token until it is about to expire, and one exchange serves concurrent sends", async () => {
    let now = 1_700_000_000_000;
    const { calls, fetchFn } = fakeFetch(fcmRoutes(json(200, {})));
    const adapter = new PushAdapter({ fcm: FCM }, { fetch: fetchFn, now: () => now });

    await adapter.send([fcmDevice("dev_1"), fcmDevice("dev_2")], MESSAGE);
    now += 58 * 60 * 1000;
    await adapter.send([fcmDevice("dev_1")], MESSAGE);
    now += 2 * 60 * 1000;
    await adapter.send([fcmDevice("dev_1")], MESSAGE);

    expect(calls.filter((call) => call.url === FCM.serviceAccount.token_uri)).toHaveLength(2);
  });

  it.each([
    [404, "NOT_FOUND", "UNREGISTERED"],
    [400, "INVALID_ARGUMENT", "INVALID_ARGUMENT"],
    [403, "PERMISSION_DENIED", "SENDER_ID_MISMATCH"],
  ])("reports the device dead on %i %s", async (status, statusText, errorCode) => {
    const { fetchFn } = fakeFetch(fcmRoutes(fcmFailure(status, statusText, errorCode)));
    const adapter = new PushAdapter({ fcm: FCM }, { fetch: fetchFn });

    await expect(adapter.send([fcmDevice("dev_1")], MESSAGE)).resolves.toEqual({
      deadDeviceIds: ["dev_1"],
    });
  });

  it.each([
    [429, "RESOURCE_EXHAUSTED", "QUOTA_EXCEEDED"],
    [500, "INTERNAL", "INTERNAL"],
    [503, "UNAVAILABLE", "UNAVAILABLE"],
  ])("throws on %i %s when no device accepted", async (status, statusText, errorCode) => {
    const { fetchFn } = fakeFetch(fcmRoutes(fcmFailure(status, statusText, errorCode)));
    const adapter = new PushAdapter({ fcm: FCM }, { fetch: fetchFn });

    await expect(adapter.send([fcmDevice("dev_1")], MESSAGE)).rejects.toThrow(
      `fcm ${status} ${errorCode}`,
    );
  });

  it("throws on a network error when no device accepted", async () => {
    const { fetchFn } = fakeFetch(fcmRoutes(new TypeError("fetch failed")));
    const adapter = new PushAdapter({ fcm: FCM }, { fetch: fetchFn });

    await expect(adapter.send([fcmDevice("dev_1")], MESSAGE)).rejects.toThrow("fetch failed");
  });

  it("drops the access token when FCM rejects it, and retries", async () => {
    const { calls, fetchFn } = fakeFetch(
      fcmRoutes(fcmFailure(401, "UNAUTHENTICATED")),
      fcmRoutes(fcmFailure(401, "UNAUTHENTICATED")),
      fcmRoutes(json(200, {})),
    );
    const adapter = new PushAdapter({ fcm: FCM }, { fetch: fetchFn });

    await expect(adapter.send([fcmDevice("dev_1")], MESSAGE)).rejects.toThrow("fcm 401");
    await adapter.send([fcmDevice("dev_1")], MESSAGE);

    expect(calls.filter((call) => call.url === FCM.serviceAccount.token_uri)).toHaveLength(2);
  });

  it("neither throws nor reports dead on a failure that is not worth retrying", async () => {
    const { fetchFn } = fakeFetch(fcmRoutes(fcmFailure(403, "PERMISSION_DENIED")));
    const adapter = new PushAdapter({ fcm: FCM }, { fetch: fetchFn });

    await expect(adapter.send([fcmDevice("dev_1")], MESSAGE)).resolves.toEqual({
      deadDeviceIds: [],
    });
  });

  it("throws when the token endpoint fails with a retryable status", async () => {
    const { fetchFn } = fakeFetch(fcmRoutes(json(200, {}), () => json(503, {})));
    const adapter = new PushAdapter({ fcm: FCM }, { fetch: fetchFn });

    await expect(adapter.send([fcmDevice("dev_1")], MESSAGE)).rejects.toThrow(
      "token endpoint responded 503",
    );
  });

  it("does not retry when the token endpoint refuses the service account", async () => {
    const { fetchFn } = fakeFetch(
      fcmRoutes(json(200, {}), () => json(400, { error: "invalid_grant" })),
    );
    const adapter = new PushAdapter({ fcm: FCM }, { fetch: fetchFn });

    await expect(adapter.send([fcmDevice("dev_1")], MESSAGE)).resolves.toEqual({
      deadDeviceIds: [],
    });
  });

  it("refuses a service account without its key fields", () => {
    expect(() => new PushAdapter({ fcm: { serviceAccount: { project_id: "proj-1" } } })).toThrow(
      "FCM service account is missing client_email",
    );
  });
});

describe("PushAdapter with Web Push", () => {
  it("posts the encrypted payload to the endpoint with VAPID authorization", async () => {
    const { calls, fetchFn } = fakeFetch(new Response(null, { status: 201 }));
    const adapter = new PushAdapter({ webpush: WEBPUSH }, { fetch: fetchFn });
    const device = webpushDevice("dev_1");

    await expect(adapter.send([device], MESSAGE)).resolves.toEqual({ deadDeviceIds: [] });

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(device.token);
    expect(calls[0]!.init.method).toBe("POST");
    const headers = new Headers(calls[0]!.init.headers);
    expect(headers.get("content-encoding")).toBe("aes128gcm");
    expect(headers.get("ttl")).toBe("2419200");
    expect(headers.get("authorization")).toMatch(
      new RegExp(`^vapid t=[\\w-]+\\.[\\w-]+\\.[\\w-]+, k=${VAPID.publicKey}$`),
    );
    const jwt = decodeJwt(headers.get("authorization")!.split(/t=|, k=/)[1]!);
    expect(jwt.claims).toMatchObject({ aud: "https://push.example.test", sub: WEBPUSH.subject });
    const body = Buffer.from(calls[0]!.init.body as Uint8Array);
    expect(body.length).toBeGreaterThan(JSON.stringify(MESSAGE).length);
    expect(body.toString("utf8")).not.toContain(MESSAGE.title);
  });

  it.each([404, 410])("reports the device dead on %i", async (status) => {
    const { fetchFn } = fakeFetch(new Response(null, { status }));
    const adapter = new PushAdapter({ webpush: WEBPUSH }, { fetch: fetchFn });

    await expect(adapter.send([webpushDevice("dev_1")], MESSAGE)).resolves.toEqual({
      deadDeviceIds: ["dev_1"],
    });
  });

  it.each([429, 500, 503])("throws on %i when no device accepted", async (status) => {
    const { fetchFn } = fakeFetch(new Response(null, { status }));
    const adapter = new PushAdapter({ webpush: WEBPUSH }, { fetch: fetchFn });

    await expect(adapter.send([webpushDevice("dev_1")], MESSAGE)).rejects.toThrow(
      `webpush ${status}`,
    );
  });

  it("throws on a network error when no device accepted", async () => {
    const { fetchFn } = fakeFetch(new TypeError("fetch failed"));
    const adapter = new PushAdapter({ webpush: WEBPUSH }, { fetch: fetchFn });

    await expect(adapter.send([webpushDevice("dev_1")], MESSAGE)).rejects.toThrow("fetch failed");
  });

  it.each([400, 403, 413])("neither throws nor reports dead on %i", async (status) => {
    const { fetchFn } = fakeFetch(new Response(null, { status }));
    const adapter = new PushAdapter({ webpush: WEBPUSH }, { fetch: fetchFn });

    await expect(adapter.send([webpushDevice("dev_1")], MESSAGE)).resolves.toEqual({
      deadDeviceIds: [],
    });
  });

  it("does not send to a device without its keys", async () => {
    const { calls, fetchFn } = fakeFetch(new Response(null, { status: 201 }));
    const adapter = new PushAdapter({ webpush: WEBPUSH }, { fetch: fetchFn });

    await expect(
      adapter.send([webpushDevice("dev_1", { p256dh: null, auth: null })], MESSAGE),
    ).resolves.toEqual({ deadDeviceIds: [] });
    expect(calls).toHaveLength(0);
  });
});

describe("PushAdapter across devices", () => {
  const webpushStatus = (statuses: Record<string, number | Error>) =>
    fakeFetch((url: string) => {
      const status = statuses[url.split("/").pop()!]!;
      return status instanceof Error ? status : new Response(null, { status });
    });

  it("succeeds when one device accepted although another failed with a retryable error", async () => {
    const { fetchFn } = webpushStatus({ dev_1: 201, dev_2: 503 });
    const adapter = new PushAdapter({ webpush: WEBPUSH }, { fetch: fetchFn });

    await expect(
      adapter.send([webpushDevice("dev_1"), webpushDevice("dev_2")], MESSAGE),
    ).resolves.toEqual({ deadDeviceIds: [] });
  });

  it("reports the dead devices when another device accepted", async () => {
    const { fetchFn } = webpushStatus({ dev_1: 201, dev_2: 410 });
    const adapter = new PushAdapter({ webpush: WEBPUSH }, { fetch: fetchFn });

    await expect(
      adapter.send([webpushDevice("dev_1"), webpushDevice("dev_2")], MESSAGE),
    ).resolves.toEqual({ deadDeviceIds: ["dev_2"] });
  });

  it("reports every device dead without throwing when all were dead", async () => {
    const { fetchFn } = webpushStatus({ dev_1: 404, dev_2: 410 });
    const adapter = new PushAdapter({ webpush: WEBPUSH }, { fetch: fetchFn });

    await expect(
      adapter.send([webpushDevice("dev_1"), webpushDevice("dev_2")], MESSAGE),
    ).resolves.toEqual({ deadDeviceIds: ["dev_1", "dev_2"] });
  });

  it("throws when none accepted and one failure was retryable, although another was dead", async () => {
    const { fetchFn } = webpushStatus({ dev_1: 410, dev_2: new TypeError("fetch failed") });
    const adapter = new PushAdapter({ webpush: WEBPUSH }, { fetch: fetchFn });

    await expect(
      adapter.send([webpushDevice("dev_1"), webpushDevice("dev_2")], MESSAGE),
    ).rejects.toThrow(/dev_1: webpush 410; dev_2: webpush: fetch failed/);
  });

  it("sends each device through its own provider", async () => {
    const http2 = fakeHttp2({ status: 200 });
    const { calls, fetchFn } = fakeFetch((url: string) =>
      url === FCM.serviceAccount.token_uri ? TOKEN() : new Response("{}", { status: 200 }),
    );
    const adapter = new PushAdapter(
      { apns: APNS, fcm: FCM, webpush: WEBPUSH },
      { fetch: fetchFn, http2: http2.transport },
    );

    await adapter.send([apnsDevice("dev_1"), fcmDevice("dev_2"), webpushDevice("dev_3")], MESSAGE);

    expect(http2.calls).toHaveLength(1);
    expect(calls.map((call) => call.url).sort()).toEqual([
      "https://fcm.googleapis.com/v1/projects/proj-1/messages:send",
      "https://oauth2.example.test/token",
      "https://push.example.test/send/dev_3",
    ]);
  });

  it("does not send to a device whose provider is not configured", async () => {
    const { calls, fetchFn } = fakeFetch(new Response(null, { status: 201 }));
    const adapter = new PushAdapter({ webpush: WEBPUSH }, { fetch: fetchFn });

    await expect(adapter.send([fcmDevice("dev_1")], MESSAGE)).resolves.toEqual({
      deadDeviceIds: [],
    });
    expect(calls).toHaveLength(0);
  });

  it("sends nothing for no devices", async () => {
    const adapter = new PushAdapter({ webpush: WEBPUSH });

    await expect(adapter.send([], MESSAGE)).resolves.toEqual({ deadDeviceIds: [] });
  });
});
