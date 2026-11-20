import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { genId } from "@headless-lms/core/shared/id";
import { ConflictError, InvalidInputError } from "@headless-lms/core/shared/errors";
import type { App } from "@headless-lms/core/types";
import { runMigrations } from "../migrate.js";
import { DrizzleUnitOfWork } from "../unit-of-work.js";
import { DrizzleOrganizationsRepository } from "./organizations.js";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("apps on Postgres", () => {
  let pool: pg.Pool;
  let apps: DrizzleOrganizationsRepository;
  const find = async (orgId: string, id: string) =>
    (await apps.listApps(orgId)).find((app) => app.id === id) ?? null;
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
    apps = new DrizzleOrganizationsRepository(drizzle(pool));
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
    await apps.createApp(learn);
    await apps.createApp(club);
  });

  afterAll(async () => {
    await pool?.end();
  });

  it("lists an organization's apps and reads one by id or by domain", async () => {
    expect(await apps.listApps(acme)).toEqual([learn, club]);
    expect(await apps.listApps(globex)).toEqual([]);
    expect(await find(acme, club.id)).toEqual(club);
    expect(await find(globex, club.id)).toBeNull();
    expect(await apps.findAppByDomain(domain("club"))).toEqual(club);
    expect(await apps.findAppByDomain(`${domain("club")}/`)).toBeNull();
    expect(await apps.findAppByDomain(`https://club.${tag}`)).toBeNull();
  });

  it("holds a domain to one app across every organization", async () => {
    const taken = apps.createApp(app(globex, "school", { domain: domain("learn") }));
    await expect(taken).rejects.toBeInstanceOf(ConflictError);
    await expect(taken).rejects.toMatchObject({
      message: "That domain is already in use",
      code: "domain_taken",
    });
    expect(await apps.listApps(globex)).toEqual([]);
  });

  it("holds an organization to one app that serves courses and one that serves the community", async () => {
    const courses = apps.createApp(app(acme, "third", { community: false }));
    await expect(courses).rejects.toMatchObject({ code: "courses_taken" });
    const community = apps.createApp(app(acme, "third", { courses: false }));
    await expect(community).rejects.toMatchObject({ code: "community_taken" });
    await expect(apps.updateApp(acme, learn.id, { community: true })).rejects.toMatchObject({
      code: "community_taken",
    });
    expect(await apps.listApps(acme)).toEqual([learn, club]);
  });

  it("holds a slug to one app in an organization, and lets another organization use it", async () => {
    await expect(apps.updateApp(acme, club.id, { slug: "learn" })).rejects.toMatchObject({
      code: "slug_taken",
    });
    const school = await apps.createApp(app(globex, "learn", { domain: domain("globex") }));
    expect(await apps.listApps(globex)).toEqual([school]);
  });

  it("refuses an app that serves neither courses nor the community", async () => {
    await expect(
      apps.createApp(app(gone, "nothing", { courses: false, community: false })),
    ).rejects.toBeInstanceOf(InvalidInputError);
    await expect(apps.updateApp(acme, learn.id, { courses: false })).rejects.toBeInstanceOf(
      InvalidInputError,
    );
    expect(await find(acme, learn.id)).toEqual(learn);
  });

  it("changes only what a patch names, and follows a change of domain", async () => {
    expect(await apps.updateApp(acme, club.id, {})).toEqual(club);
    const renamed = await apps.updateApp(acme, club.id, { name: "Acme Club" });
    expect(renamed).toEqual({ ...club, name: "Acme Club" });
    const moved = await apps.updateApp(acme, club.id, { domain: domain("circle") });
    expect(moved?.domain).toBe(domain("circle"));
    expect(await apps.findAppByDomain(domain("club"))).toBeNull();
    expect((await apps.findAppByDomain(domain("circle")))?.id).toBe(club.id);
    expect(await apps.updateApp(globex, club.id, { name: "Stolen" })).toBeNull();
  });

  it("deletes an app of its own organization only, and frees its domain", async () => {
    const extra = await apps.createApp(app(gone, "extra"));
    expect(await apps.deleteApp(acme, extra.id)).toBeNull();
    expect(await apps.deleteApp(gone, extra.id)).toEqual(extra);
    expect(await apps.findAppByDomain(extra.domain)).toBeNull();
    expect(await apps.createApp({ ...extra, id: genId("app") })).toMatchObject({
      domain: extra.domain,
    });
  });

  it("deletes an organization's apps with the organization", async () => {
    expect(await apps.listApps(gone)).toHaveLength(1);
    await pool.query("delete from organizations where id = $1", [gone]);
    expect(await apps.listApps(gone)).toEqual([]);
  });

  it("rolls an app back with the unit of work it was created in", async () => {
    const uow = new DrizzleUnitOfWork(drizzle(pool), (tx) => ({
      apps: new DrizzleOrganizationsRepository(tx),
    }));
    const rolled = app(globex, "rolled", { courses: false, community: true });
    await expect(
      uow.run(async (scope) => {
        await scope.apps.createApp(rolled);
        await scope.apps.createApp(app(globex, "clash", { domain: domain("learn") }));
      }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(await find(globex, rolled.id)).toBeNull();
  });
});
