import { describe, expect, it } from "vitest";
import {
  accessTokenAuthorization,
  grantFromClaims,
  isCompactJws,
  needsOrgChoice,
  orgIdFromMetadata,
  permissionsToScopes,
  scopesToPermissions,
} from "./access-grant.js";

describe("needsOrgChoice", () => {
  const members = async () => ["org_a", "org_b"];

  it("asks for an org when the session has none", async () => {
    expect(await needsOrgChoice(null, members)).toBe(true);
  });
  it("asks for an org when the active org is not one of the user's memberships", async () => {
    expect(await needsOrgChoice("org_student_portal", members)).toBe(true);
    expect(await needsOrgChoice("org_a", async () => [])).toBe(true);
  });
  it("keeps an active org the user is a member of", async () => {
    expect(await needsOrgChoice("org_b", members)).toBe(false);
  });
});

describe("accessTokenAuthorization", () => {
  it("reads a Bearer or DPoP authorization header", () => {
    expect(accessTokenAuthorization("Bearer abc.def")).toEqual({
      scheme: "Bearer",
      token: "abc.def",
    });
    expect(accessTokenAuthorization("bearer abc")).toEqual({ scheme: "Bearer", token: "abc" });
    expect(accessTokenAuthorization("DPoP abc")).toEqual({ scheme: "DPoP", token: "abc" });
  });
  it("ignores other schemes, empty values and arrays", () => {
    expect(accessTokenAuthorization("Basic abc")).toBeNull();
    expect(accessTokenAuthorization("Bearer ")).toBeNull();
    expect(accessTokenAuthorization(undefined)).toBeNull();
    expect(accessTokenAuthorization(["Bearer a", "Bearer b"])).toBeNull();
  });
});

describe("isCompactJws", () => {
  it("accepts three non-empty dot-separated parts", () => {
    expect(isCompactJws("aaa.bbb.ccc")).toBe(true);
  });
  it("rejects anything else", () => {
    expect(isCompactJws("hlms_abcdef")).toBe(false);
    expect(isCompactJws("aaa.bbb")).toBe(false);
    expect(isCompactJws("aaa.bbb.ccc.ddd")).toBe(false);
    expect(isCompactJws("aaa..ccc")).toBe(false);
    expect(isCompactJws(".bbb.ccc")).toBe(false);
    expect(isCompactJws("aaa.bbb.")).toBe(false);
    expect(isCompactJws("")).toBe(false);
  });
});

describe("grantFromClaims", () => {
  const claims = {
    sub: "usr_1",
    client_id: "client_1",
    org_id: "org_1",
    scope: "courses:read courses:write offline_access",
  };

  it("builds a grant from verified token claims", () => {
    expect(grantFromClaims(claims)).toEqual({
      userId: "usr_1",
      clientId: "client_1",
      orgId: "org_1",
      scopes: ["courses:read", "courses:write"],
    });
  });
  it("keeps only catalogue scopes from the scope claim", () => {
    expect(
      grantFromClaims({ ...claims, scope: "openid offline_access courses:publish  media:read" })
        ?.scopes,
    ).toEqual(["media:read"]);
  });
  it("falls back to azp for the client id", () => {
    expect(grantFromClaims({ ...claims, client_id: undefined, azp: "client_2" })?.clientId).toBe(
      "client_2",
    );
  });
  it("rejects a token without an org, subject or client", () => {
    expect(grantFromClaims({ ...claims, org_id: undefined })).toBeNull();
    expect(grantFromClaims({ ...claims, sub: undefined })).toBeNull();
    expect(grantFromClaims({ ...claims, client_id: undefined })).toBeNull();
  });
  it("treats a missing scope claim as no scopes", () => {
    expect(grantFromClaims({ ...claims, scope: undefined })?.scopes).toEqual([]);
  });
});

describe("orgIdFromMetadata", () => {
  it("reads the org from parsed or serialized metadata", () => {
    expect(orgIdFromMetadata({ organizationId: "org_1" })).toBe("org_1");
    expect(orgIdFromMetadata(JSON.stringify({ organizationId: "org_1" }))).toBe("org_1");
  });
  it("returns null for anything else", () => {
    expect(orgIdFromMetadata(null)).toBeNull();
    expect(orgIdFromMetadata("not json")).toBeNull();
    expect(orgIdFromMetadata({ organizationId: 7 })).toBeNull();
  });
});

describe("scopesToPermissions", () => {
  it("groups scopes into api key permissions by resource", () => {
    expect(scopesToPermissions(["courses:read", "courses:write", "media:read"])).toEqual({
      courses: ["read", "write"],
      media: ["read"],
    });
  });
  it("drops duplicates and anything outside the catalogue", () => {
    expect(
      scopesToPermissions(["courses:read", "courses:read", "offline_access", "courses:publish"]),
    ).toEqual({ courses: ["read"] });
  });
});

describe("permissionsToScopes", () => {
  it("reads api key permissions back as scopes in catalogue order", () => {
    expect(permissionsToScopes({ media: ["read"], courses: ["write", "read"] })).toEqual([
      "courses:read",
      "courses:write",
      "media:read",
    ]);
  });
  it("ignores permissions that are not catalogue scopes", () => {
    expect(
      permissionsToScopes({ courses: ["read", "publish"], profile: ["read"], media: "read" }),
    ).toEqual(["courses:read"]);
    expect(permissionsToScopes(null)).toEqual([]);
    expect(permissionsToScopes(undefined)).toEqual([]);
  });
  it("round-trips the scopes an api key was created with", () => {
    const scopes = ["students:read", "students:invite", "automations:delete"];
    expect(permissionsToScopes(scopesToPermissions(scopes))).toEqual(scopes);
  });
});
