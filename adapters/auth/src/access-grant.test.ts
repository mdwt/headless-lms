import { describe, expect, it } from "vitest";
import { needsOrgChoice } from "./access-grant.js";

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
