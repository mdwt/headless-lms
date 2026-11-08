import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { genId } from "@headless-lms/core/shared/id";
import { runMigrations } from "../migrate.js";
import { DrizzleRolesRepository } from "./roles.js";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("the caller read on Postgres", () => {
  let pool: pg.Pool;
  let counted: pg.Pool;
  let roles: DrizzleRolesRepository;
  const org = genId("organization");
  const orgExternal = `ba_${org}`;
  const sarah = { user: genId("user"), external: `ba_${genId("user")}`, orgUser: genId("orgUser") };
  const ivy = { user: genId("user"), external: `ba_${genId("user")}`, orgUser: genId("orgUser") };
  const stranger = { user: genId("user"), external: `ba_${genId("user")}` };
  const queries: string[] = [];

  beforeAll(async () => {
    await runMigrations(url!);
    pool = new pg.Pool({ connectionString: url });
    counted = new pg.Pool({ connectionString: url });
    const query = counted.query.bind(counted);
    counted.query = ((...args: Parameters<typeof query>) => {
      const first = args[0] as string | { text: string };
      queries.push(typeof first === "string" ? first : first.text);
      return query(...args);
    }) as typeof counted.query;
    roles = new DrizzleRolesRepository(drizzle(counted));
    for (const person of [sarah, ivy, stranger]) {
      await pool.query("insert into users (id, external_id, email) values ($1, $2, $3)", [
        person.user,
        person.external,
        `${person.user}@test`,
      ]);
    }
    await pool.query(
      "insert into organizations (id, external_id, name, slug, owner_id) values ($1, $2, 'Makers Club', $1, $3)",
      [org, orgExternal, sarah.user],
    );
    await pool.query(
      "insert into org_users (org_id, id, user_id, status) values ($1, $2, $3, 'active'), ($1, $4, $5, 'invited')",
      [org, sarah.orgUser, sarah.user, ivy.orgUser, ivy.user],
    );
    await pool.query(
      "insert into role_assignments (org_id, id, org_user_id, role_key, assigned_by) values ($1, $2, $3, 'owner', 'system')",
      [org, genId("roleAssignment"), sarah.orgUser],
    );
    await pool.query(
      "insert into org_roles (org_id, id, key, name, base, permissions) values ($1, $2, 'host', 'Event host', 'moderator', $3)",
      [org, genId("orgRole"), JSON.stringify({ "events:write": true })],
    );
  });

  afterAll(async () => {
    await Promise.all([pool?.end(), counted?.end()]);
  });

  it("reads the org, the user, the org user, the assignments and the org roles in one query", async () => {
    queries.length = 0;
    const facts = await roles.callerFacts(orgExternal, sarah.external);
    expect(queries).toHaveLength(1);
    expect(facts).toMatchObject({
      orgId: org,
      userId: sarah.user,
      orgUser: {
        orgUserId: sarah.orgUser,
        status: "active",
        assignments: [{ roleKey: "owner", contentId: null, contentType: null }],
        storedRoles: [
          expect.objectContaining({ key: "host", permissions: { "events:write": true } }),
        ],
      },
    });
  });

  it("answers an invited org user, a person with no org user, an unknown user and an unknown org", async () => {
    await expect(roles.callerFacts(orgExternal, ivy.external)).resolves.toMatchObject({
      userId: ivy.user,
      orgUser: { orgUserId: ivy.orgUser, status: "invited", assignments: [] },
    });
    await expect(roles.callerFacts(orgExternal, stranger.external)).resolves.toEqual({
      orgId: org,
      userId: stranger.user,
      orgUser: null,
    });
    await expect(roles.callerFacts(orgExternal, "ba_nobody")).resolves.toEqual({
      orgId: org,
      userId: null,
      orgUser: null,
    });
    await expect(roles.callerFacts("ba_no_org", sarah.external)).resolves.toBeNull();
  });
});
