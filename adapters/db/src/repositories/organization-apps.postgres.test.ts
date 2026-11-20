import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { genId } from "@headless-lms/core/shared/id";
import { ConflictError, InvalidInputError } from "@headless-lms/core/shared/errors";
import type { App } from "@headless-lms/core/types";
import { runMigrations } from "../migrate.js";
import { DrizzleOrganizationsRepository } from "./organizations.js";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("apps on Postgres", () => {
  let pool: pg.Pool;
  let repo: DrizzleOrganizationsRepository;
  const find = async (orgId: string, id: string) =>
    (await repo.listApps(orgId)).find((app) => app.id === id) ?? null;
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
    repo = new DrizzleOrganizationsRepository(drizzle(pool));
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
    await repo.createApp(learn);
    await repo.createApp(club);
  });

  afterAll(async () => {
    await pool?.end();
  });

  it("lists an organization's apps and finds one by its domain", async () => {
    expect(await repo.listApps(acme)).toEqual([learn, club]);
    expect(await repo.listApps(globex)).toEqual([]);
    expect(await find(acme, club.id)).toEqual(club);
    expect(await find(globex, club.id)).toBeNull();
    expect(await repo.findAppByDomain(domain("club"))).toEqual(club);
    expect(await repo.findAppByDomain(`${domain("club")}/`)).toBeNull();
    expect(await repo.findAppByDomain(`https://club.${tag}`)).toBeNull();
  });

  it("holds a domain to one app across every organization", async () => {
    const taken = repo.createApp(app(globex, "school", { domain: domain("learn") }));
    await expect(taken).rejects.toBeInstanceOf(ConflictError);
    await expect(taken).rejects.toMatchObject({
      message: "That domain is already in use",
      code: "domain_taken",
    });
    expect(await repo.listApps(globex)).toEqual([]);
  });

  it("holds an organization to one app that serves courses and one that serves the community", async () => {
    const courses = repo.createApp(app(acme, "third", { community: false }));
    await expect(courses).rejects.toMatchObject({ code: "courses_taken" });
    const community = repo.createApp(app(acme, "third", { courses: false }));
    await expect(community).rejects.toMatchObject({ code: "community_taken" });
    await expect(repo.updateApp(acme, learn.id, { community: true })).rejects.toMatchObject({
      code: "community_taken",
    });
    expect(await repo.listApps(acme)).toEqual([learn, club]);
  });

  it("holds a slug to one app in an organization, and lets another organization use it", async () => {
    await expect(repo.updateApp(acme, club.id, { slug: "learn" })).rejects.toMatchObject({
      code: "slug_taken",
    });
    const school = await repo.createApp(app(globex, "learn", { domain: domain("globex") }));
    expect(await repo.listApps(globex)).toEqual([school]);
  });

  it("refuses an app that serves neither courses nor the community", async () => {
    await expect(
      repo.createApp(app(gone, "nothing", { courses: false, community: false })),
    ).rejects.toBeInstanceOf(InvalidInputError);
    await expect(repo.updateApp(acme, learn.id, { courses: false })).rejects.toBeInstanceOf(
      InvalidInputError,
    );
    expect(await find(acme, learn.id)).toEqual(learn);
  });

  it("changes only what a patch names, and follows a change of domain", async () => {
    expect(await repo.updateApp(acme, club.id, {})).toEqual(club);
    const renamed = await repo.updateApp(acme, club.id, { name: "Acme Club" });
    expect(renamed).toEqual({ ...club, name: "Acme Club" });
    const moved = await repo.updateApp(acme, club.id, { domain: domain("circle") });
    expect(moved?.domain).toBe(domain("circle"));
    expect(await repo.findAppByDomain(domain("club"))).toBeNull();
    expect((await repo.findAppByDomain(domain("circle")))?.id).toBe(club.id);
    expect(await repo.updateApp(globex, club.id, { name: "Stolen" })).toBeNull();
  });

  it("deletes an app of its own organization only, and frees its domain", async () => {
    const extra = await repo.createApp(app(gone, "extra"));
    expect(await repo.deleteApp(acme, extra.id)).toBeNull();
    expect(await repo.deleteApp(gone, extra.id)).toEqual(extra);
    expect(await repo.findAppByDomain(extra.domain)).toBeNull();
    expect(await repo.createApp({ ...extra, id: genId("app") })).toMatchObject({
      domain: extra.domain,
    });
  });

  it("deletes an organization's apps with the organization", async () => {
    expect(await repo.listApps(gone)).toHaveLength(1);
    await pool.query("delete from organizations where id = $1", [gone]);
    expect(await repo.listApps(gone)).toEqual([]);
  });
});
