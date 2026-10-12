import { describe, expect, it } from "vitest";
import {
  clientDisplayName,
  clientHosts,
  defaultSelected,
  isDeleteScope,
  isOAuthFlow,
  loginRedirect,
  pickerScopes,
  SCOPE_NOTES,
  SCOPE_RESOURCES,
  toSearchParams,
} from "./oauth-flow";

describe("loginRedirect", () => {
  it("always shows the form during an oauth sign-in", () => {
    expect(loginRedirect({ client_id: "c", sig: "abc" }, true)).toBeNull();
    expect(loginRedirect({ client_id: "c", sig: "abc" }, false)).toBeNull();
  });
  it("sends a signed-in user to onboarding outside oauth", () => {
    expect(loginRedirect({}, true)).toBe("/onboarding");
    expect(loginRedirect({}, false)).toBeNull();
  });
});

describe("clientDisplayName", () => {
  it("uses the registered client name", () => {
    expect(clientDisplayName("cid", true, { client_id: "cid", client_name: "Claude" })).toBe(
      "Claude",
    );
  });
  it("falls back to the client id", () => {
    expect(clientDisplayName("cid", false, { client_name: "Claude" })).toBe("cid");
    expect(clientDisplayName("cid", true, { client_name: "" })).toBe("cid");
    expect(clientDisplayName("cid", true, { client_name: 7 })).toBe("cid");
    expect(clientDisplayName("cid", true, null)).toBe("cid");
  });
});

describe("clientHosts", () => {
  it("reads the redirect host and an https client id's host", () => {
    expect(
      clientHosts({
        client_id: "https://claude.ai/oauth/mcp-oauth-client-metadata",
        redirect_uri: "https://claude.ai/api/mcp/auth_callback",
      }),
    ).toEqual({ redirectHost: "claude.ai", clientIdHost: "claude.ai" });
    expect(
      clientHosts(
        new URLSearchParams("client_id=abc&redirect_uri=http%3A%2F%2F127.0.0.1%3A9999%2Fcb"),
      ),
    ).toEqual({ redirectHost: "127.0.0.1:9999", clientIdHost: null });
  });
  it("ignores a client id that is not an https url", () => {
    expect(clientHosts({ client_id: "http://evil.test/meta" }).clientIdHost).toBeNull();
    expect(clientHosts({ client_id: "abc123" }).clientIdHost).toBeNull();
  });
  it("tolerates missing and invalid urls", () => {
    expect(clientHosts({})).toEqual({ redirectHost: null, clientIdHost: null });
    expect(clientHosts({ redirect_uri: "not a url", client_id: "" })).toEqual({
      redirectHost: null,
      clientIdHost: null,
    });
    expect(clientHosts({ redirect_uri: ["https://a.test/cb", "https://b.test/cb"] })).toEqual({
      redirectHost: null,
      clientIdHost: null,
    });
    expect(clientHosts({ redirect_uri: "com.example.app:/callback" }).redirectHost).toBeNull();
  });
});

describe("isOAuthFlow", () => {
  it("is true when the page carries a signed authorize query", () => {
    expect(isOAuthFlow(new URLSearchParams("client_id=c&sig=abc&exp=1"))).toBe(true);
    expect(isOAuthFlow({ client_id: "c", sig: "abc" })).toBe(true);
  });
  it("is false otherwise", () => {
    expect(isOAuthFlow(new URLSearchParams(""))).toBe(false);
    expect(isOAuthFlow({ client_id: "c" })).toBe(false);
  });
});

describe("pickerScopes", () => {
  const options = [
    { scope: "courses:read", allowed: true },
    { scope: "courses:write", allowed: false },
    { scope: "courses:delete", allowed: false },
    { scope: "students:read", allowed: true },
    { scope: "comments:read", allowed: true },
  ];

  it("keeps the requested scopes the role allows, in catalogue order", () => {
    expect(
      pickerScopes("comments:read offline_access courses:write courses:read openid", options),
    ).toEqual(["courses:read", "comments:read"]);
  });
  it("is empty when nothing requested is allowed", () => {
    expect(pickerScopes("courses:write courses:delete offline_access", options)).toEqual([]);
    expect(pickerScopes(null, options)).toEqual([]);
    expect(pickerScopes(undefined, options)).toEqual([]);
  });
});

describe("scope presentation", () => {
  it("ticks only read scopes by default", () => {
    expect(
      [
        "courses:read",
        "courses:write",
        "courses:delete",
        "students:invite",
        "comments:moderate",
        "analytics:read",
      ].filter(defaultSelected),
    ).toEqual(["courses:read", "analytics:read"]);
  });
  it("flags only delete scopes", () => {
    expect(
      ["bundles:delete", "bundles:write", "automations:delete", "media:read"].filter(isDeleteScope),
    ).toEqual(["bundles:delete", "automations:delete"]);
  });
  it("notes every write scope that can remove something", () => {
    expect(Object.keys(SCOPE_NOTES)).toEqual([
      "downloads:write",
      "bundles:write",
      "access:write",
      "comments:moderate",
    ]);
  });
  it("orders the resources as the catalogue does", () => {
    expect(SCOPE_RESOURCES.map(({ resource, label }) => `${resource}=${label}`)).toEqual([
      "courses=Courses",
      "downloads=Downloads",
      "bundles=Bundles",
      "media=Media",
      "students=Students",
      "access=Access",
      "analytics=Analytics",
      "automations=Workflows and webhooks",
      "comments=Comments",
    ]);
  });
});

describe("toSearchParams", () => {
  it("round-trips repeated keys as separate entries", () => {
    const params = toSearchParams({ resource: ["https://a", "https://b"], client_id: "c" });
    expect(params.getAll("resource")).toEqual(["https://a", "https://b"]);
    expect(params.get("client_id")).toBe("c");
  });
  it("drops undefined values", () => {
    const params = toSearchParams({ a: undefined, b: "1" });
    expect(params.has("a")).toBe(false);
    expect(params.toString()).toBe("b=1");
  });
});
