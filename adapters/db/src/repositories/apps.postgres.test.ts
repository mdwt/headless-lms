import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { genId } from "@headless-lms/core/shared/id";
import { ConflictError, InvalidInputError } from "@headless-lms/core/shared/errors";
import type { App } from "@headless-lms/core/types";
import { runMigrations } from "../migrate.js";
import { DrizzleUnitOfWork } from "../unit-of-work.js";
import { DrizzleAppsRepository } from "./apps.js";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("apps on Postgres", () => {
  let pool: pg.Pool;
  let apps: DrizzleAppsRepository;
  const owner = genId("user");
  const acme = genId("organization");
  const globex = genId("organization");
  const gone = genId("organization");
  const tag = acme.toLowerCase().replace(/[^a-z0-9]/g, "");
  const domain = (label: string) => `https://${label}.${tag}.test`;

  const app = (orgId: string, label: string, serves: Partial<App> = {}): App => ({
    orgId,
    id: genId("app"),
    name: label,
    slug: label,
    domain: domain(label),
    courses: true,
    community: true,
    ...serves,
  });
  const learn = app(acme, "learn", { community: false });
  const club = app(acme, "club", { courses: false });

  beforeAll(async () => {
    await runMigrations(url!);
    pool = new pg.Pool({ connectionString: url });
    apps = new DrizzleAppsRepository(drizzle(pool));
    await pool.query("insert into users (id, external_id, email) values ($1, $1, $2)", [
      owner,
      `${owner}@test`,
    ]);
    for (const org of [acme, globex, gone]) {
      await pool.query(
        "insert into organizations (id, external_id, name, slug, owner_id) values ($1, $1, 'Org', $1, $2)",
        [org, owner],
      );
    }
    await apps.create(learn);
    await apps.create(club);
  });

  afterAll(async () => {
    await pool?.end();
  });

  it("lists an organization's apps and reads one by id or by domain", async () => {
    expect(await apps.list(acme)).toEqual([learn, club]);
    expect(await apps.list(globex)).toEqual([]);
    expect(await apps.find(acme, club.id)).toEqual(club);
    expect(await apps.find(globex, club.id)).toBeNull();
    expect(await apps.findByDomain(domain("club"))).toEqual(club);
    expect(await apps.findByDomain(`${domain("club")}/`)).toBeNull();
    expect(await apps.findByDomain(`https://club.${tag}`)).toBeNull();
  });

  it("holds a domain to one app across every organization", async () => {
    const taken = apps.create(app(globex, "school", { domain: domain("learn") }));
    await expect(taken).rejects.toBeInstanceOf(ConflictError);
    await expect(taken).rejects.toMatchObject({
      message: "That domain is already in use",
      code: "domain_taken",
    });
    expect(await apps.list(globex)).toEqual([]);
  });

  it("holds an organization to one app that serves courses and one that serves the community", async () => {
    const courses = apps.create(app(acme, "third", { community: false }));
    await expect(courses).rejects.toThrow("already has an app that serves courses");
    const community = apps.create(app(acme, "third", { courses: false }));
    await expect(community).rejects.toThrow("already has an app that serves the community");
    await expect(apps.update(acme, learn.id, { community: true })).rejects.toBeInstanceOf(
      ConflictError,
    );
    expect(await apps.list(acme)).toEqual([learn, club]);
  });

  it("holds a slug to one app in an organization, and lets another organization use it", async () => {
    await expect(apps.update(acme, club.id, { slug: "learn" })).rejects.toThrow(
      "That slug is already in use",
    );
    const school = await apps.create(app(globex, "learn", { domain: domain("globex") }));
    expect(await apps.list(globex)).toEqual([school]);
  });

  it("refuses an app that serves neither courses nor the community", async () => {
    await expect(
      apps.create(app(gone, "nothing", { courses: false, community: false })),
    ).rejects.toBeInstanceOf(InvalidInputError);
    await expect(apps.update(acme, learn.id, { courses: false })).rejects.toBeInstanceOf(
      InvalidInputError,
    );
    expect(await apps.find(acme, learn.id)).toEqual(learn);
  });

  it("changes only what a patch names, and follows a change of domain", async () => {
    expect(await apps.update(acme, club.id, {})).toEqual(club);
    const renamed = await apps.update(acme, club.id, { name: "Acme Club" });
    expect(renamed).toEqual({ ...club, name: "Acme Club" });
    const moved = await apps.update(acme, club.id, { domain: domain("circle") });
    expect(moved?.domain).toBe(domain("circle"));
    expect(await apps.findByDomain(domain("club"))).toBeNull();
    expect((await apps.findByDomain(domain("circle")))?.id).toBe(club.id);
    expect(await apps.update(globex, club.id, { name: "Stolen" })).toBeNull();
  });

  it("deletes an app of its own organization only, and frees its domain", async () => {
    const extra = await apps.create(app(gone, "extra"));
    expect(await apps.delete(acme, extra.id)).toBeNull();
    expect(await apps.delete(gone, extra.id)).toEqual(extra);
    expect(await apps.findByDomain(extra.domain)).toBeNull();
    expect(await apps.create({ ...extra, id: genId("app") })).toMatchObject({
      domain: extra.domain,
    });
  });

  it("deletes an organization's apps with the organization", async () => {
    expect(await apps.list(gone)).toHaveLength(1);
    await pool.query("delete from organizations where id = $1", [gone]);
    expect(await apps.list(gone)).toEqual([]);
  });

  it("rolls an app back with the unit of work it was created in", async () => {
    const uow = new DrizzleUnitOfWork(drizzle(pool), (tx) => ({
      apps: new DrizzleAppsRepository(tx),
    }));
    const rolled = app(globex, "rolled", { courses: false, community: true });
    await expect(
      uow.run(async (scope) => {
        await scope.apps.create(rolled);
        await scope.apps.create(app(globex, "clash", { domain: domain("learn") }));
      }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(await apps.find(globex, rolled.id)).toBeNull();
  });
});
