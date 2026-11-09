import { describe, expect, it } from "vitest";
import {
  accessTokenAuthorization,
  consentOrgId,
  grantFromClaims,
  isCompactJws,
  needsOrgChoice,
  orgIdFromMetadata,
  roleFromMetadata,
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

describe("consentOrgId", () => {
  const members = async () => ["org_a", "org_b"];

  it("binds the consent to an active org the user is a member of", async () => {
    expect(await consentOrgId("org_b", members)).toBe("org_b");
  });
  it("refuses an active org the user is not a member of", async () => {
    expect(await consentOrgId("org_student_portal", members)).toBeNull();
    expect(await consentOrgId("org_a", async () => [])).toBeNull();
  });
  it("refuses a session without an active org", async () => {
    expect(await consentOrgId(null, members)).toBeNull();
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
      limit: { scopes: ["courses:read", "courses:write"] },
    });
  });
  it("keeps only catalogue scopes from the scope claim", () => {
    expect(
      grantFromClaims({ ...claims, scope: "openid offline_access courses:publish  media:read" })
        ?.limit,
    ).toEqual({ scopes: ["media:read"] });
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
    expect(grantFromClaims({ ...claims, scope: undefined })?.limit).toEqual({ scopes: [] });
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

describe("roleFromMetadata", () => {
  it("reads the key's role from parsed or serialized metadata", () => {
    expect(roleFromMetadata({ organizationId: "org_1", role: "instructor" })).toBe("instructor");
    expect(roleFromMetadata(JSON.stringify({ role: "owner" }))).toBe("owner");
  });
  it("returns null for a key without a role", () => {
    expect(roleFromMetadata({ organizationId: "org_1" })).toBeNull();
    expect(roleFromMetadata({ role: "" })).toBeNull();
    expect(roleFromMetadata(null)).toBeNull();
  });
});
