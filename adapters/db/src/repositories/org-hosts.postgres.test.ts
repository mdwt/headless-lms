import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { genId } from "@headless-lms/core/shared/id";
import { runMigrations } from "../migrate.js";
import { DrizzleOrgHostIndex } from "./org-hosts.js";
import { DrizzleSettingsRepository } from "./settings.js";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("organizations at a host on Postgres", () => {
  let pool: pg.Pool;
  let index: DrizzleOrgHostIndex;
  let settings: DrizzleSettingsRepository;
  const owner = genId("user");
  const acme = genId("organization");
  const other = genId("organization");
  const tag = acme.toLowerCase().replace(/[^a-z0-9]/g, "");
  const learn = `https://learn.${tag}.test`;
  const club = `https://club.${tag}.test`;

  beforeAll(async () => {
    await runMigrations(url!);
    pool = new pg.Pool({ connectionString: url });
    index = new DrizzleOrgHostIndex(drizzle(pool));
    settings = new DrizzleSettingsRepository(drizzle(pool));
    await pool.query("insert into users (id, external_id, email) values ($1, $1, $2)", [
      owner,
      `${owner}@test`,
    ]);
    for (const org of [acme, other]) {
      await pool.query(
        "insert into organizations (id, external_id, name, slug, owner_id) values ($1, $1, 'Acme', $1, $2)",
        [org, owner],
      );
    }
    await settings.patch(acme, "organizations", acme, {
      hosts: { courses: learn, community: club },
    });
    await settings.patch(other, "organizations", other, {
      hosts: { courses: `https://${tag}.platform.test`, community: club },
    });
    await settings.patch(other, "content", other, {
      hosts: { courses: `https://content.${tag}.test` },
    });
  });

  afterAll(async () => {
    await pool?.end();
  });

  it("finds the organization by its course host or its community host", async () => {
    expect(await index.findOrgIdsByHost(learn)).toEqual([acme]);
    expect((await index.findOrgIdsByHost(club)).sort()).toEqual([acme, other].sort());
  });

  it("finds nothing for an unknown host, a prefix of a host, or another namespace's value", async () => {
    expect(await index.findOrgIdsByHost(`https://unknown.${tag}.test`)).toEqual([]);
    expect(await index.findOrgIdsByHost(`https://learn.${tag}`)).toEqual([]);
    expect(await index.findOrgIdsByHost(`https://content.${tag}.test`)).toEqual([]);
  });

  it("follows a change of hosts", async () => {
    const moved = `https://moved.${tag}.test`;
    await settings.patch(acme, "organizations", acme, { hosts: { courses: moved } });
    expect(await index.findOrgIdsByHost(moved)).toEqual([acme]);
    expect(await index.findOrgIdsByHost(learn)).toEqual([]);
  });
});
