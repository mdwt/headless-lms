import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { ConflictError, NotFoundError } from "@headless-lms/core/shared/errors";
import { genId } from "@headless-lms/core/shared/id";
import { runMigrations } from "../migrate.js";
import { DrizzleContentRepository } from "./content.js";
import { DrizzleAssetsRepository } from "./assets.js";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("DrizzleContentRepository events on Postgres", () => {
  let pool: pg.Pool;
  let repo: DrizzleContentRepository;
  const org = genId("organization");
  const slides = genId("asset");
  const handout = genId("asset");
  const location = {
    venue: null,
    online: { url: "https://zoom.us/j/123", details: "Passcode 4821" },
  };

  beforeAll(async () => {
    await runMigrations(url!);
    pool = new pg.Pool({ connectionString: url, max: 2 });
    repo = new DrizzleContentRepository(drizzle(pool));
    const owner = genId("user");
    await pool.query("insert into users (id, email) values ($1, $2)", [owner, `${owner}@test`]);
    await pool.query(
      "insert into organizations (id, name, slug, owner_id) values ($1, 'Spanish in 90 Days', $1, $2)",
      [org, owner],
    );
    for (const id of [slides, handout]) {
      await pool.query(
        "insert into assets (org_id, id, key, kind, filename, content_type, status, uploaded_by) values ($1, $2, $2, 'document', 'slides.pdf', 'application/pdf', 'ready', 'orm_sarah')",
        [org, id],
      );
    }
  });

  afterAll(async () => {
    await pool?.end();
  });

  function create(title: string, startsAt: string, endsAt: string) {
    return repo.createEvent(org, {
      title,
      startsAt: new Date(startsAt),
      endsAt: new Date(endsAt),
      timeZone: "Europe/London",
    });
  }

  it("creates a draft event with no location and the default settings", async () => {
    const event = await create(
      "Conversation practice",
      "2026-05-12T16:00:00Z",
      "2026-05-12T17:00:00Z",
    );

    expect(event).toMatchObject({
      orgId: org,
      type: "event",
      title: "Conversation practice",
      description: "",
      status: "draft",
      startsAt: new Date("2026-05-12T16:00:00Z"),
      location: { venue: null, online: null },
      recording: null,
      settings: { type: "public", capacity: null, notifications: true, replay: true },
    });
    expect(event.id.startsWith("evn_")).toBe(true);
  });

  it("merges a settings patch into the stored row and keeps the other fields", async () => {
    const event = await create("Office hours", "2026-05-15T10:00:00Z", "2026-05-15T11:00:00Z");

    await repo.patchEventSettings(org, event.id, { capacity: 20 });
    const settings = await repo.patchEventSettings(org, event.id, { type: "private" });

    expect(settings).toEqual({ type: "private", capacity: 20, notifications: true, replay: true });
    expect((await repo.findEventById(org, event.id))?.settings).toEqual(settings);
    await repo.deleteEventSettings(org, event.id);
    expect((await repo.findEventById(org, event.id))?.settings.capacity).toBeNull();
  });

  it("updates the fields sent, the location and recording among them", async () => {
    const event = await create("Workshop", "2026-06-01T09:00:00Z", "2026-06-01T12:00:00Z");
    const recording = { url: "https://video.test/1", details: null };

    const updated = await repo.updateEvent(org, event.id, {
      location,
      recording,
      status: "canceled",
    });

    expect(updated).toMatchObject({ title: "Workshop", location, recording, status: "canceled" });
    expect(await repo.updateEvent(org, "evn_missing", { title: "x" })).toBeNull();
  });

  it("refuses an end that is not after the start", async () => {
    const event = await create("Short call", "2026-07-01T09:00:00Z", "2026-07-01T10:00:00Z");

    await expect(
      repo.updateEvent(org, event.id, { endsAt: new Date("2026-07-01T09:00:00Z") }),
    ).rejects.toThrow();
  });

  it("lists the events that overlap a range, by status, search and sort", async () => {
    const may = await repo.listEvents(org, {
      page: 1,
      pageSize: 20,
      from: new Date("2026-05-01T00:00:00Z"),
      to: new Date("2026-06-01T00:00:00Z"),
    });
    expect(may.rows.map((row) => row.title)).toEqual(["Conversation practice", "Office hours"]);
    expect(may.total).toBe(2);

    const latestFirst = await repo.listEvents(org, { page: 1, pageSize: 20, sort: "-startsAt" });
    expect(latestFirst.rows[0]?.title).toBe("Short call");

    const canceled = await repo.listEvents(org, { page: 1, pageSize: 20, status: "canceled" });
    expect(canceled.rows.map((row) => row.title)).toEqual(["Workshop"]);

    const searched = await repo.listEvents(org, { page: 1, pageSize: 20, search: "office" });
    expect(searched.rows.map((row) => row.title)).toEqual(["Office hours"]);

    const one = may.rows[0]!.id;
    const scoped = await repo.listEvents(org, { page: 1, pageSize: 20 }, [one]);
    expect(scoped.rows.map((row) => row.id)).toEqual([one]);
  });

  it("keeps the attached files in order, renames, reorders and removes them", async () => {
    const event = await create("Q&A", "2026-08-01T09:00:00Z", "2026-08-01T10:00:00Z");

    await repo.addEventAsset(org, event.id, { assetId: slides });
    await repo.addEventAsset(org, event.id, { assetId: handout, displayName: "Handout" });
    await expect(repo.addEventAsset(org, event.id, { assetId: slides })).rejects.toThrow(
      ConflictError,
    );
    await repo.renameEventAsset(org, event.id, slides, "Slides");
    const reordered = await repo.reorderEventAssets(org, event.id, [handout, slides]);

    expect(reordered.map((link) => [link.assetId, link.displayName, link.seq])).toEqual([
      [handout, "Handout", 0],
      [slides, "Slides", 1],
    ]);
    expect((await repo.removeEventAsset(org, event.id, handout)).map((l) => l.assetId)).toEqual([
      slides,
    ]);
    await expect(repo.listEventAssets(org, "evn_missing")).resolves.toEqual([]);
    await expect(repo.addEventAsset(org, "evn_missing", { assetId: slides })).rejects.toThrow(
      NotFoundError,
    );
  });

  it("deletes an event through the registry and its file links with it, keeping the files", async () => {
    const event = await create("Farewell", "2026-09-01T09:00:00Z", "2026-09-01T10:00:00Z");
    await repo.addEventAsset(org, event.id, { assetId: slides });

    expect(await repo.deleteEvent(org, event.id)).toBe(true);

    expect(await repo.findEventById(org, event.id)).toBeNull();
    expect(await repo.listEventAssets(org, event.id)).toEqual([]);
    const { rows } = await pool.query("select id from assets where org_id = $1 and id = $2", [
      org,
      slides,
    ]);
    expect(rows).toHaveLength(1);
    expect(await repo.deleteEvent(org, event.id)).toBe(false);
  });

  it("stores a space's cover, background and icon, and keeps an image in use from deletion", async () => {
    const community = await repo.createCommunity(org, { title: "Makers" }, genId("community"));
    const space = await repo.createSpace(org, community.id, { name: "General" });
    expect(space).toMatchObject({ coverAssetId: null, backgroundAssetId: null, iconAssetId: null });

    const updated = await repo.updateSpace(org, community.id, space.id, {
      coverAssetId: slides,
      iconAssetId: handout,
    });
    expect(updated).toMatchObject({
      coverAssetId: slides,
      backgroundAssetId: null,
      iconAssetId: handout,
    });
    const assets = new DrizzleAssetsRepository(drizzle(pool));
    await expect(assets.delete(org, handout)).rejects.toThrow(ConflictError);

    await repo.updateSpace(org, community.id, space.id, { coverAssetId: null, iconAssetId: null });
    expect(await repo.findSpace(org, space.id)).toMatchObject({
      coverAssetId: null,
      iconAssetId: null,
    });
  });
});
