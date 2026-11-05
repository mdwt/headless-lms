import { describe, expect, it } from "vitest";
import {
  clientDisplayName,
  clientHosts,
  defaultSelected,
  isDeleteScope,
  isExpiredSignInLink,
  isOAuthFlow,
  loginRedirect,
  pickerScopes,
  SCOPE_NOTES,
  heldPermissions,
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

describe("isExpiredSignInLink", () => {
  it("recognises a refused signed oauth query", () => {
    expect(
      isExpiredSignInLink({ error: "invalid_signature", status: 400, statusText: "Bad Request" }),
    ).toBe(true);
  });
  it("ignores every other failure", () => {
    expect(
      isExpiredSignInLink({
        code: "INVALID_EMAIL_OR_PASSWORD",
        message: "Invalid email or password",
        status: 401,
        statusText: "Unauthorized",
      }),
    ).toBe(false);
    expect(isExpiredSignInLink({ error: "invalid_request", status: 400 })).toBe(false);
    expect(isExpiredSignInLink(null)).toBe(false);
    expect(isExpiredSignInLink("invalid_signature")).toBe(false);
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
  const catalogue = [
    "courses:read",
    "courses:write",
    "courses:delete",
    "people:read",
    "courses:moderate",
  ];
  const held = ["courses:read", "people:read", "courses:moderate"];

  it("keeps the requested scopes the person holds, in catalogue order", () => {
    expect(
      pickerScopes(
        "courses:moderate offline_access courses:write courses:read openid",
        catalogue,
        held,
      ),
    ).toEqual(["courses:read", "courses:moderate"]);
  });
  it("is empty when nothing requested is held", () => {
    expect(pickerScopes("courses:write courses:delete offline_access", catalogue, held)).toEqual(
      [],
    );
    expect(pickerScopes(null, catalogue, held)).toEqual([]);
    expect(pickerScopes(undefined, catalogue, held)).toEqual([]);
  });
});

describe("heldPermissions", () => {
  it("joins the org's permissions with every item's, once each", () => {
    expect(
      heldPermissions({
        orgRole: { key: "k", name: "Tutor" },
        isOwner: false,
        org: ["api_keys:read"],
        content: { crs_1: ["courses:read", "courses:write"], crs_2: ["courses:read"] },
      }),
    ).toEqual(["api_keys:read", "courses:read", "courses:write"]);
  });
});

describe("scope presentation", () => {
  it("ticks only read scopes by default", () => {
    expect(
      [
        "courses:read",
        "courses:write",
        "courses:delete",
        "people:write",
        "courses:moderate",
        "analytics:read",
      ].filter(defaultSelected),
    ).toEqual(["courses:read", "analytics:read"]);
  });
  it("flags only delete scopes", () => {
    expect(
      ["bundles:delete", "bundles:write", "automations:delete", "media:read"].filter(isDeleteScope),
    ).toEqual(["bundles:delete", "automations:delete"]);
  });
  it("notes every scope that can remove something", () => {
    expect(Object.keys(SCOPE_NOTES)).toEqual([
      "courses:write",
      "courses:moderate",
      "downloads:write",
      "bundles:write",
      "access:write",
      "communities:write",
      "communities:moderate",
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
