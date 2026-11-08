import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { genId } from "@headless-lms/core/shared/id";
import { runMigrations } from "../migrate.js";
import { DrizzleContentRepository } from "./content.js";
import { DrizzleAdminRepository } from "./admin.js";
import { DrizzleMemberRepository } from "./member.js";

const url = process.env.TEST_DATABASE_URL;
const DAY = 86_400_000;

describe.skipIf(!url)("event reports on Postgres", () => {
  let pool: pg.Pool;
  let db: NodePgDatabase;
  let content: DrizzleContentRepository;
  let member: DrizzleMemberRepository;
  let admin: DrizzleAdminRepository;
  const org = genId("organization");
  const people = {
    james: genId("orgUser"),
    emma: genId("orgUser"),
    tom: genId("orgUser"),
    lucy: genId("orgUser"),
    ben: genId("orgUser"),
    olivia: genId("orgUser"),
  };
  const now = new Date();
  let upcoming: string;
  let hidden: string;
  let past: string;
  let canceled: string;
  let draft: string;

  async function event(
    title: string,
    startsIn: number,
    status: "draft" | "published" | "canceled",
    type: "public" | "private" = "public",
  ): Promise<string> {
    const created = await content.createEvent(org, {
      title,
      startsAt: new Date(now.getTime() + startsIn),
      endsAt: new Date(now.getTime() + startsIn + 3_600_000),
      timeZone: "Europe/London",
    });
    if (status !== "draft") {
      await content.updateEvent(org, created.id, { status });
    }
    if (type === "private") {
      await content.patchEventSettings(org, created.id, { type });
    }
    return created.id;
  }

  async function grant(
    orgUserId: string,
    target: { contentId?: string; bundleId?: string },
    source: string,
    grantedAt: string,
    status: "active" | "revoked" = "active",
  ): Promise<void> {
    await pool.query(
      `insert into entitlements (org_id, id, org_user_id, content_id, bundle_id, status, source, granted_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        org,
        genId("entitlement"),
        orgUserId,
        target.contentId ?? null,
        target.bundleId ?? null,
        status,
        source,
        grantedAt,
      ],
    );
  }

  beforeAll(async () => {
    await runMigrations(url!);
    pool = new pg.Pool({ connectionString: url });
    db = drizzle(pool);
    content = new DrizzleContentRepository(db);
    member = new DrizzleMemberRepository(db);
    admin = new DrizzleAdminRepository(db);
    const owner = genId("user");
    await pool.query("insert into users (id, email) values ($1, $2)", [owner, `${owner}@test`]);
    await pool.query(
      "insert into organizations (id, name, slug, owner_id) values ($1, 'Spanish in 90 Days', $1, $2)",
      [org, owner],
    );
    for (const [name, orgUserId] of Object.entries(people)) {
      const user = genId("user");
      await pool.query("insert into users (id, email, first_name) values ($1, $2, $3)", [
        user,
        `${user}@test`,
        name === "lucy" ? null : name[0]!.toUpperCase() + name.slice(1),
      ]);
      await pool.query("insert into org_users (org_id, id, user_id) values ($1, $2, $3)", [
        org,
        orgUserId,
        user,
      ]);
    }
    upcoming = await event("Conversation practice", 3 * DAY, "published");
    hidden = await event("Hot seat with Emma", 2 * DAY, "published", "private");
    past = await event("Last week's call", -7 * DAY, "published");
    canceled = await event("Canceled call", 4 * DAY, "canceled");
    draft = await event("Draft call", 5 * DAY, "draft");

    await grant(people.james, { contentId: upcoming }, "self", "2026-05-01T09:00:00Z");
    await grant(people.emma, { contentId: upcoming }, "manual", "2026-05-02T09:00:00Z");
    await grant(people.tom, { contentId: upcoming }, "automation", "2026-05-02T10:00:00Z");
    await grant(people.olivia, { contentId: upcoming }, "checkout", "2026-05-03T09:00:00Z");
    await grant(people.ben, { contentId: upcoming }, "self", "2026-05-01T08:00:00Z", "revoked");
    const bundle = genId("bundle");
    await pool.query(
      "insert into bundles (org_id, id, name) values ($1, $2, 'Spring cohort pass')",
      [org, bundle],
    );
    await pool.query(
      "insert into bundle_items (org_id, bundle_id, content_id) values ($1, $2, $3)",
      [org, bundle, upcoming],
    );
    await grant(people.lucy, { bundleId: bundle }, "manual", "2026-04-20T09:00:00Z");
    await grant(people.james, { bundleId: bundle }, "manual", "2026-04-21T09:00:00Z");
    await grant(people.emma, { contentId: hidden }, "manual", "2026-05-02T09:00:00Z");
    await grant(people.emma, { contentId: canceled }, "manual", "2026-05-02T09:00:00Z");
  });

  afterAll(async () => {
    await pool?.end();
  });

  it("lists each attendee once by grant date, a direct grant before the bundle", async () => {
    const page = await member.eventAttendees(org, upcoming, { page: 1, pageSize: 20 });
    expect(page.total).toBe(5);
    expect(
      page.rows.map((row) => [
        row.orgUserId,
        row.displayName,
        row.source,
        row.grantedAt.toISOString(),
      ]),
    ).toEqual([
      [people.lucy, null, "bundle", "2026-04-20T09:00:00.000Z"],
      [people.james, "James", "self", "2026-05-01T09:00:00.000Z"],
      [people.emma, "Emma", "manual", "2026-05-02T09:00:00.000Z"],
      [people.tom, "Tom", "automation", "2026-05-02T10:00:00.000Z"],
      [people.olivia, "Olivia", "manual", "2026-05-03T09:00:00.000Z"],
    ]);
    const second = await admin.eventAttendees(org, upcoming, { page: 2, pageSize: 2 });
    expect(second.rows.map((row) => row.orgUserId)).toEqual([people.emma, people.tom]);
    expect(second.total).toBe(5);
    const beyond = await admin.eventAttendees(org, upcoming, { page: 9, pageSize: 2 });
    expect(beyond).toMatchObject({ rows: [], total: 5 });
  });

  it("counts the attendees by source, the revoked grants and the direct grants before the start", async () => {
    const event = await content.findEventById(org, upcoming);
    await expect(admin.eventAnalytics(org, upcoming, event!.startsAt)).resolves.toEqual({
      attendees: 5,
      bySource: { self: 1, manual: 2, automation: 1, bundle: 1 },
      revoked: 1,
      grantsOverTime: [
        { date: "2026-05-01", count: 1 },
        { date: "2026-05-02", count: 2 },
        { date: "2026-05-03", count: 1 },
      ],
    });
    const early = await admin.eventAnalytics(org, upcoming, new Date("2026-05-02T09:30:00Z"));
    expect(early.grantsOverTime).toEqual([
      { date: "2026-05-01", count: 1 },
      { date: "2026-05-02", count: 1 },
    ]);
  });

  const page = { page: 1, pageSize: 20 };
  const reader = (orgUserId: string, readIds: string[] = [], readAll = false) => ({
    orgUserId,
    readAll,
    readIds,
  });

  it("lists a member the upcoming published public events and the ones they attend, soonest first", async () => {
    const forBen = await member.events(org, page, reader(people.ben), now);
    expect(forBen.rows).toEqual([upcoming]);
    const forEmma = await member.events(org, page, reader(people.emma), now);
    expect(forEmma).toMatchObject({ rows: [hidden, upcoming, canceled], total: 3 });
    const going = await member.events(org, { ...page, attending: true }, reader(people.emma), now);
    expect(going.rows).toEqual([hidden, upcoming, canceled]);
    const bensGoing = await member.events(
      org,
      { ...page, attending: true },
      reader(people.ben),
      now,
    );
    expect(bensGoing.rows).toEqual([]);
  });

  it("lists the ended events latest first, and every published or canceled one to a reader", async () => {
    const ended = await member.events(org, { ...page, when: "past" }, reader(people.ben), now);
    expect(ended.rows).toEqual([past]);
    const all = await member.events(org, page, reader(people.ben, [], true), now);
    expect(all.rows).toEqual([hidden, upcoming, canceled]);
    expect(all.rows).not.toContain(draft);
    const one = await member.events(org, page, reader(people.ben, [hidden]), now);
    expect(one.rows).toEqual([hidden, upcoming]);
  });

  it("counts the published events that have not ended in the org overview", async () => {
    await expect(admin.overview(org)).resolves.toMatchObject({ upcomingEvents: 2 });
  });
});
