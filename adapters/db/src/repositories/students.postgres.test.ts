import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { genId } from "@headless-lms/core/shared/id";
import { runMigrations } from "../migrate.js";
import { DrizzleAdminRepository } from "./admin.js";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("students list on Postgres", () => {
  let pool: pg.Pool;
  let admin: DrizzleAdminRepository;
  const org = genId("organization");
  const people = {
    sarah: genId("orgUser"),
    james: genId("orgUser"),
    emma: genId("orgUser"),
    tom: genId("orgUser"),
  };

  async function course(title: string, published: number, unpublished = 0): Promise<string[]> {
    const id = genId("course");
    const moduleId = genId("module");
    await pool.query("insert into content_items (org_id, id, type) values ($1, $2, 'course')", [
      org,
      id,
    ]);
    await pool.query("insert into courses (org_id, id, title, slug) values ($1, $2, $3, $2)", [
      org,
      id,
      title,
    ]);
    await pool.query(
      "insert into modules (org_id, id, course_id, title, seq) values ($1, $2, $3, 'Week 1', 1)",
      [org, moduleId, id],
    );
    const activities: string[] = [];
    for (let seq = 1; seq <= published + unpublished; seq++) {
      const activity = genId("activity");
      await pool.query(
        "insert into activities (org_id, id, module_id, course_id, seq, settings) values ($1, $2, $3, $4, $5, $6)",
        [org, activity, moduleId, id, seq, JSON.stringify({ published: seq <= published })],
      );
      activities.push(activity);
    }
    return [id, ...activities];
  }

  async function grant(
    orgUserId: string,
    target: { contentId?: string; bundleId?: string },
    status: "active" | "revoked" = "active",
  ): Promise<void> {
    await pool.query(
      `insert into entitlements (org_id, id, org_user_id, content_id, bundle_id, status, source)
       values ($1, $2, $3, $4, $5, $6, 'manual')`,
      [
        org,
        genId("entitlement"),
        orgUserId,
        target.contentId ?? null,
        target.bundleId ?? null,
        status,
      ],
    );
  }

  async function progress(
    orgUserId: string,
    activityId: string,
    completed: boolean,
    updatedAt: string,
  ): Promise<void> {
    await pool.query(
      `insert into progress_records (org_id, id, org_user_id, target_type, target_id, completed_at, updated_at)
       values ($1, $2, $3, 'activity', $4, $5, $6)`,
      [org, genId("progress"), orgUserId, activityId, completed ? updatedAt : null, updatedAt],
    );
  }

  async function list(sort?: string) {
    const page = await admin.listStudents(
      org,
      { page: 1, pageSize: 20, ...(sort && { sort }) },
      "member",
    );
    return page.rows;
  }

  beforeAll(async () => {
    await runMigrations(url!);
    pool = new pg.Pool({ connectionString: url });
    admin = new DrizzleAdminRepository(drizzle(pool));
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
        name[0]!.toUpperCase() + name.slice(1),
      ]);
      await pool.query("insert into org_users (org_id, id, user_id) values ($1, $2, $3)", [
        org,
        orgUserId,
        user,
      ]);
    }
    const [grammar, g1, g2, g3, g4, gDraft] = await course("Grammar", 4, 1);
    const [speaking, s1] = await course("Speaking", 2);
    const [empty] = await course("Coming soon", 0);
    const [revoked, r1] = await course("Old course", 1);
    const bundle = genId("bundle");
    await pool.query("insert into bundles (org_id, id, name) values ($1, $2, 'Starter pack')", [
      org,
      bundle,
    ]);
    await pool.query(
      "insert into bundle_items (org_id, bundle_id, content_id) values ($1, $2, $3)",
      [org, bundle, speaking],
    );

    await grant(people.sarah, { contentId: grammar });
    await grant(people.sarah, { bundleId: bundle });
    await progress(people.sarah, g1!, true, "2026-05-01T09:00:00Z");
    await progress(people.sarah, g2!, true, "2026-05-02T09:00:00Z");
    await progress(people.sarah, g3!, true, "2026-05-03T09:00:00Z");
    await progress(people.sarah, g4!, false, "2026-05-04T09:00:00Z");
    await progress(people.sarah, gDraft!, true, "2026-05-04T08:00:00Z");
    await progress(people.sarah, s1!, true, "2026-05-05T09:00:00Z");

    await grant(people.james, { contentId: grammar });
    await grant(people.james, { contentId: empty });
    await grant(people.james, { contentId: revoked }, "revoked");
    await progress(people.james, g1!, true, "2026-04-01T09:00:00Z");
    await progress(people.james, r1!, true, "2026-04-02T09:00:00Z");

    await grant(people.emma, { contentId: speaking });
  });

  afterAll(async () => {
    await pool?.end();
  });

  it("averages each student's progress over the courses they can open", async () => {
    const rows = await list();
    const byId = Object.fromEntries(rows.map((row) => [row.id, row.avgProgress]));
    expect(byId[people.sarah]).toBe(63);
    expect(byId[people.james]).toBe(13);
    expect(byId[people.emma]).toBe(0);
    expect(byId[people.tom]).toBe(0);
  });

  it("matches the average on the student's own analytics", async () => {
    for (const id of Object.values(people)) {
      const [student, analytics] = await Promise.all([
        admin.getStudent(org, id),
        admin.studentAnalytics(org, id),
      ]);
      expect(student?.avgProgress).toBe(analytics?.avgProgress);
    }
  });

  it("sorts by average progress", async () => {
    expect((await list("-avgProgress")).slice(0, 2).map((row) => row.id)).toEqual([
      people.sarah,
      people.james,
    ]);
    expect((await list("avgProgress")).slice(-2).map((row) => row.id)).toEqual([
      people.james,
      people.sarah,
    ]);
  });

  it("puts students who were never active after the active ones, in either direction", async () => {
    const never = [people.emma, people.tom].sort();
    const newest = await list("-lastActiveAt");
    expect(newest.slice(0, 2).map((row) => row.id)).toEqual([people.sarah, people.james]);
    expect(
      newest
        .slice(2)
        .map((row) => row.id)
        .sort(),
    ).toEqual(never);
    const oldest = await list("lastActiveAt");
    expect(oldest.slice(0, 2).map((row) => row.id)).toEqual([people.james, people.sarah]);
    expect(oldest.slice(2).map((row) => row.lastActiveAt)).toEqual([null, null]);
  });
});
