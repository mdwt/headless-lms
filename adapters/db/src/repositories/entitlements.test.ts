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
    await repo.listGrantsExpiredBy("org-1", now, 100, "ent_9");
    const { text, values } = queries[0]!;
    expect(text).toMatch(
      /"entitlements"\."id" > \$\d+\) order by "entitlements"\."id" asc limit \$\d+$/,
    );
    expect(values).toEqual(expect.arrayContaining(["ent_9", 100]));
    expect(text).toContain('"entitlements"."expires_at" <= $');
    expect(text).toMatch(/not exists \(\s*select 1 from "entitlement_expiry_notices"/);
    expect(text).toContain(
      '"entitlement_expiry_notices"."expires_at" = "entitlements"."expires_at"',
    );
    expect(values).toContain(now.toISOString());
  });

  it("selects ending grants per published community they open with no notice for that term", async () => {
    const { repo, queries } = capturingDb();
    await repo.listGrantsEndingBetween("org-1", now, until, 100, {
      entitlementId: "ent_9",
      communityId: "cmy_2",
    });
    const { text, values } = queries[0]!;
    expect(text).toMatch(
      /\("entitlements"\."id", "communities"\."id"\) > \(\$\d+, \$\d+\)\) order by "entitlements"\."id" asc, "communities"\."id" asc limit \$\d+$/,
    );
    expect(values).toEqual(expect.arrayContaining(["ent_9", "cmy_2", 100]));
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

  it("lists the orgs with a due notice across every org in one query", async () => {
    const { repo, queries } = capturingDb([["org-2"], ["org-1"]]);
    await expect(repo.orgIdsWithDueNotices(now, until)).resolves.toEqual(["org-1", "org-2"]);
    expect(queries).toHaveLength(1);
    const { text, values } = queries[0]!;
    expect(text).toMatch(/^\(select distinct "org_id" from "entitlements"/);
    expect(text).toContain(") union (select distinct");
    expect(text).toContain("entitlement_expiry_notices");
    expect(text).toContain("entitlement_ending_soon_notices");
    expect(text).not.toMatch(/"entitlements"\."org_id" = \$/);
    expect(values).toEqual(expect.arrayContaining([now.toISOString(), until.toISOString()]));
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
    await repo.countActiveSpaceMembers("org-1", "spc_1", ["ou_mod"]);
    const { text, values } = queries[0]!;
    expect(text).toContain("pc.status = 'published'");
    expect(text).toContain('"space_members"."org_user_id"');
    expect(text).toMatch(/not "space_members"\."org_user_id" in \(\$\d+\)/);
    expect(values).toContain("ou_mod");
  });

  it("answers the grant and space row for many people in one query, reading no role", async () => {
    const { repo, queries } = capturingDb([["ou_1", true, false]]);
    await expect(repo.accessAmong("org-1", "cmy_1", "spc_1", ["ou_1"])).resolves.toEqual([
      { orgUserId: "ou_1", granted: true, activeInSpace: false },
    ]);
    expect(queries).toHaveLength(1);
    const { text, values } = queries[0]!;
    expect(text).not.toContain('"org_users"."role"');
    expect(text).toContain("pc.status = 'published'");
    expect(text).toContain('sm.org_id = "org_users"."org_id"');
    expect(text).toContain('sm.org_user_id = "org_users"."id"');
    expect(values).toEqual(expect.arrayContaining(["community"]));
  });

  it("takes the holders of communities:read as members beside the grant holders", async () => {
    const { repo, queries } = capturingDb([]);
    await repo.communityMemberIds("org-1", "cmy_1", ["ou_reader"]);
    const { text, values } = queries[0]!;
    expect(text).toMatch(/"org_users"\."id" in \(\$\d+\) or/);
    expect(text).not.toContain('"org_users"."role"');
    expect(values).toEqual(expect.arrayContaining(["ou_reader", "cmy_1"]));
  });

  it("opens the communities read on, or held through a published grant", async () => {
    const { repo, queries } = capturingDb([["cmy_1"], ["cmy_2"]]);
    await expect(
      repo.openCommunityIds("org-1", "ou_1", { all: false, ids: ["cmy_9"] }),
    ).resolves.toEqual(["cmy_1", "cmy_2"]);
    const { text, values } = queries[0]!;
    expect(text).not.toContain('"org_users"');
    expect(text).toContain("pc.status = 'published'");
    expect(values).toEqual(expect.arrayContaining(["org-1", "ou_1", "cmy_9"]));
    await repo.openCommunityIds("org-1", "ou_1", { all: true, ids: [] });
    expect(queries[1]!.text).not.toContain("pc.status");
  });

  it("answers whether a person holds an active grant", async () => {
    const { repo, queries } = capturingDb([[true]]);
    await repo.holdsAnyGrant("org-1", "ou_1");
    expect(queries[0]!.text).toContain('"entitlements"."status" = \'active\'');
    expect(queries[0]!.values).toEqual(expect.arrayContaining(["org-1", "ou_1"]));
  });
});

describe("transitions", () => {
  it("locks a space member row for update", async () => {
    const { repo, queries } = capturingDb([]);
    await repo.lockSpaceMember("org-1", "spc_1", "ou_1");
    expect(queries[0]!.text).toMatch(/for update/);
  });

  it("upserts a grant and locks an existing one for update", async () => {
    const { repo, queries } = capturingDb([]);
    await repo
      .insert("org-1", { orgUserId: "ou_1", contentId: "cmy_1", expiresAt: null, source: "manual" })
      .catch(() => undefined);
    expect(queries[0]!.text).toMatch(
      /on conflict \("org_id","org_user_id","content_id"\) do update/,
    );
    await repo.lockGrant("org-1", { orgUserId: "ou_1", contentId: "cmy_1" });
    expect(queries[1]!.text).toMatch(/for update/);
  });
});

describe("grants to an event", () => {
  const grant = { orgUserId: "ou_1", contentId: "evn_1", expiresAt: null };
  const row = {
    orgId: "org-1",
    id: "ent_1",
    orgUserId: "ou_1",
    bundleId: null,
    contentId: "evn_1",
    status: "active",
    source: "self",
    grantedAt: new Date(),
    expiresAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  it("writes the source it is given", async () => {
    const { repo, queries } = capturingDb([Object.values(row)]);
    await repo.insert("org-1", { ...grant, source: "self" });
    await repo.insert("org-1", { ...grant, source: "automation" });
    expect(queries[0]!.values).toContain("self");
    expect(queries[0]!.values).not.toContain("manual");
    expect(queries[1]!.values).toContain("automation");
  });

  it("takes a transaction lock keyed on the content id", async () => {
    const { repo, queries } = capturingDb();
    await repo.lockCapacity("org-1", "evn_1");
    expect(queries[0]!.text).toMatch(/pg_advisory_xact_lock\(hashtext\(\$1\)\)/);
    expect(queries[0]!.values).toEqual(["entitlements:org-1:evn_1"]);
  });

  it("lists and searches grants by the event title", async () => {
    const { repo, queries } = capturingDb();
    await repo.list("org-1", { page: 1, pageSize: 20, search: "practice", type: "event" });
    expect(queries[0]!.text).toContain('left join "events"');
    expect(queries[0]!.text).toContain('"events"."title"');
    expect(queries[1]!.text).toContain('left join "events"');
  });
});

describe("holders", () => {
  it("lists the people whose active grants open the content", async () => {
    const { repo, queries } = capturingDb([["ou_1"], ["ou_2"]]);
    await expect(repo.grantedOrgUserIds("org-1", "crs_1")).resolves.toEqual(["ou_1", "ou_2"]);
    const { text, values } = queries[0]!;
    expect(text).toMatch(/^select distinct "org_user_id" from "content_access"/);
    expect(values).toEqual(["org-1", "crs_1"]);
  });
});
