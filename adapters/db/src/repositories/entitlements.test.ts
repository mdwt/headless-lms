import { describe, it, expect, vi } from "vitest";
import { drizzle } from "drizzle-orm/node-postgres";
import { DrizzleEntitlementsRepository } from "./entitlements.js";

function capturingDb(rows: unknown[][] = []) {
  const queries: { text: string; values: unknown[] }[] = [];
  const query = vi.fn(async (q: string | { text: string }, v?: unknown[]) => {
    queries.push({ text: typeof q === "string" ? q : q.text, values: v ?? [] });
    return { rows, rowCount: rows.length, fields: [] };
  });
  return {
    repo: new DrizzleEntitlementsRepository(drizzle({ client: { query } as never })),
    queries,
  };
}

const now = new Date("2026-06-01T00:00:00Z");
const until = new Date("2026-06-08T00:00:00Z");

describe("expiry notices", () => {
  it("selects only due grants with no expiry notice for their current term", async () => {
    const { repo, queries } = capturingDb();
    await repo.listGrantsExpiredBy("org-1", now);
    const { text, values } = queries[0]!;
    expect(text).toContain('"entitlements"."expires_at" <= $');
    expect(text).toMatch(/not exists \(\s*select 1 from "entitlement_expiry_notices"/);
    expect(text).toContain(
      '"entitlement_expiry_notices"."expires_at" = "entitlements"."expires_at"',
    );
    expect(values).toContain(now.toISOString());
  });

  it("selects ending grants per published community they open with no notice for that term", async () => {
    const { repo, queries } = capturingDb();
    await repo.listGrantsEndingBetween("org-1", now, until);
    const { text, values } = queries[0]!;
    expect(text).toContain('inner join "communities"');
    expect(text).toContain('"communities"."status" = $');
    expect(values).toContain("published");
    expect(text).toContain('"entitlement_ending_soon_notices"."community_id" = "communities"."id"');
    expect(text).toContain(
      '"entitlement_ending_soon_notices"."expires_at" = "entitlements"."expires_at"',
    );
  });

  it("claims a notice with a plain insert of the term it was listed with", async () => {
    const expiresAt = new Date("2026-05-01T00:00:00Z");
    const won = capturingDb([{ entitlement_id: "ent_1" }] as never);
    await expect(
      won.repo.claimNotice("org-1", { kind: "expired", entitlementId: "ent_1", expiresAt }, now),
    ).resolves.toBe(true);
    expect(won.queries).toHaveLength(1);
    const expired = won.queries[0]!;
    expect(expired.text).toMatch(
      /^insert into "entitlement_expiry_notices" \("org_id", "entitlement_id", "expires_at", "notified_at"\)\s+values \(\$1, \$2, \$3::timestamptz, \$4::timestamptz\)\s+on conflict do nothing\s+returning "entitlement_id"$/,
    );
    expect(expired.text).not.toContain("select");
    expect(expired.text).not.toContain("for share");
    expect(expired.values).toEqual(["org-1", "ent_1", expiresAt.toISOString(), now.toISOString()]);

    const lost = capturingDb([]);
    await expect(
      lost.repo.claimNotice(
        "org-1",
        { kind: "ending_soon", entitlementId: "ent_1", communityId: "cmy_1", expiresAt },
        now,
      ),
    ).resolves.toBe(false);
    expect(lost.queries).toHaveLength(1);
    const ending = lost.queries[0]!;
    expect(ending.text).toMatch(
      /^insert into "entitlement_ending_soon_notices" \("org_id", "entitlement_id", "community_id", "expires_at", "notified_at"\)\s+values \(\$1, \$2, \$3, \$4::timestamptz, \$5::timestamptz\)\s+on conflict do nothing\s+returning "entitlement_id"$/,
    );
    expect(ending.text).not.toContain("join");
    expect(ending.text).not.toContain("for share");
    expect(ending.values).toEqual([
      "org-1",
      "ent_1",
      "cmy_1",
      expiresAt.toISOString(),
      now.toISOString(),
    ]);
  });

  it("answers whether anything is due in one query", async () => {
    const { repo, queries } = capturingDb([]);
    await expect(repo.hasDueNotices("org-1", now, until)).resolves.toBe(false);
    expect(queries).toHaveLength(1);
    expect(queries[0]!.text).toContain("entitlement_expiry_notices");
    expect(queries[0]!.text).toContain("entitlement_ending_soon_notices");
  });
});

describe("community access", () => {
  it("refuses a community that is not published", async () => {
    const { repo, queries } = capturingDb([]);
    await repo.hasCommunityAccess("org-1", "ou_1", "cmy_1");
    expect(queries[0]!.text).toContain("pc.status = 'published'");
  });

  it("lists the published communities a grant opens through the opens rule", async () => {
    const { repo, queries } = capturingDb([]);
    await repo.communitiesOpenedBy("org-1", { contentId: null, bundleId: "bnd_1" });
    const { text, values } = queries[0]!;
    expect(text).toContain("from bundle_items bi");
    expect(text).toContain('"communities"."status" = $');
    expect(values).toEqual(expect.arrayContaining(["published", "bnd_1"]));
  });

  it("counts toward capacity only active rows whose holder still holds the community", async () => {
    const { repo, queries } = capturingDb([[0]]);
    await repo.countActiveSpaceMembers("org-1", "spc_1");
    const { text } = queries[0]!;
    expect(text).toContain("pc.status = 'published'");
    expect(text).toContain('"space_members"."org_user_id"');
  });

  it("answers role, membership and space row for many people in one query", async () => {
    const { repo, queries } = capturingDb([["ou_1", "student", true, false]]);
    await expect(repo.accessAmong("org-1", "cmy_1", "spc_1", ["ou_1"])).resolves.toEqual([
      { orgUserId: "ou_1", role: "student", member: true, activeInSpace: false },
    ]);
    expect(queries).toHaveLength(1);
    const { text, values } = queries[0]!;
    expect(text).toContain('"org_users"."role" in ($');
    expect(text).toContain("pc.status = 'published'");
    expect(text).toContain('sm.org_id = "org_users"."org_id"');
    expect(text).toContain('sm.org_user_id = "org_users"."id"');
    expect(values).toEqual(expect.arrayContaining(["owner", "admin", "instructor", "community"]));
  });

  it("lists staff and moderators holding the published community as its moderators", async () => {
    const { repo, queries } = capturingDb([]);
    await repo.communityModeratorIds("org-1", "cmy_1");
    const { text, values } = queries[0]!;
    expect(text).toMatch(/"org_users"."role" in \(\$\d+, \$\d+, \$\d+, \$\d+\)/);
    expect(text).toContain("pc.status = 'published'");
    expect(text).toContain("ci.type = $");
    expect(values).toEqual(
      expect.arrayContaining(["owner", "admin", "instructor", "moderator", "cmy_1", "community"]),
    );
    expect(values).not.toContain("student");
  });
});

describe("transitions", () => {
  it("locks a space member row for update", async () => {
    const { repo, queries } = capturingDb([]);
    await repo.lockSpaceMember("org-1", "spc_1", "ou_1");
    expect(queries[0]!.text).toMatch(/for update/);
  });

  it("inserts an absent grant without touching an existing one and locks the existing one", async () => {
    const { repo, queries } = capturingDb([]);
    await expect(
      repo.insertIfAbsent("org-1", { orgUserId: "ou_1", contentId: "cmy_1", expiresAt: null }),
    ).resolves.toBeNull();
    expect(queries[0]!.text).toMatch(
      /on conflict \("org_id","org_user_id","content_id"\) do nothing/,
    );
    await repo.lockGrant("org-1", { orgUserId: "ou_1", contentId: "cmy_1" });
    expect(queries[1]!.text).toMatch(/for update/);
  });
});
