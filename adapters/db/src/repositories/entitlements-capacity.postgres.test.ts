import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { EntitlementsServiceImpl } from "@headless-lms/core/entitlements";
import { actorWith } from "@headless-lms/core/organizations";
import { ConflictError, NotFoundError } from "@headless-lms/core/shared/errors";
import { genId } from "@headless-lms/core/shared/id";
import type { Tx } from "../client.js";
import { runMigrations } from "../migrate.js";
import { DrizzleUnitOfWork } from "../unit-of-work.js";
import { DrizzleContentRepository } from "./content.js";
import { DrizzleEntitlementsRepository } from "./entitlements.js";
import { DrizzleOutboxAppender } from "./outbox.js";

const url = process.env.TEST_DATABASE_URL;

class SlowCountRepository extends DrizzleEntitlementsRepository {
  override async grantedOrgUserIds(orgId: string, contentId: string): Promise<string[]> {
    const ids = await super.grantedOrgUserIds(orgId, contentId);
    await new Promise((resolve) => setTimeout(resolve, 150));
    return ids;
  }
}

describe.skipIf(!url)("grants to an event on Postgres", () => {
  let pool: pg.Pool;
  let content: DrizzleContentRepository;
  let service: EntitlementsServiceImpl;
  const org = genId("organization");
  const [sarah, james, emma] = [genId("orgUser"), genId("orgUser"), genId("orgUser")];
  const system = actorWith({ id: "system", orgId: org, owner: true });

  beforeAll(async () => {
    await runMigrations(url!);
    pool = new pg.Pool({ connectionString: url, max: 6 });
    const db = drizzle(pool);
    content = new DrizzleContentRepository(db);
    const owner = genId("user");
    await pool.query("insert into users (id, email) values ($1, $2)", [owner, `${owner}@test`]);
    await pool.query(
      "insert into organizations (id, name, slug, owner_id) values ($1, 'Spanish in 90 Days', $1, $2)",
      [org, owner],
    );
    for (const orgUserId of [sarah, james, emma]) {
      const user = genId("user");
      await pool.query("insert into users (id, email) values ($1, $2)", [user, `${user}@test`]);
      await pool.query("insert into org_users (org_id, id, user_id) values ($1, $2, $3)", [
        org,
        orgUserId,
        user,
      ]);
    }
    service = new EntitlementsServiceImpl({
      repo: new DrizzleEntitlementsRepository(db),
      content: {
        getSpace: async () => null,
        listSpaces: async () => [],
        getEvent: async (eventId) => {
          const event = await content.findEventById(org, eventId);
          if (!event) {
            throw new Error("missing event");
          }
          return event;
        },
      },
      permissions: { holders: async () => [], systemActor: () => system },
      uow: new DrizzleUnitOfWork(db, (tx: Tx) => ({
        entitlements: new SlowCountRepository(tx),
        spaces: new DrizzleContentRepository(tx),
        outbox: new DrizzleOutboxAppender(tx),
      })),
    });
  });

  afterAll(async () => {
    await pool?.end();
  });

  async function publishedEvent(capacity: number): Promise<string> {
    const event = await content.createEvent(org, {
      title: "Conversation practice",
      startsAt: new Date(Date.now() + 86_400_000),
      endsAt: new Date(Date.now() + 90_000_000),
      timeZone: "Europe/London",
    });
    await content.updateEvent(org, event.id, { status: "published" });
    await content.patchEventSettings(org, event.id, { capacity });
    return event.id;
  }

  it("gives the last place to one of two concurrent registrations and refuses the other full", async () => {
    const eventId = await publishedEvent(2);
    await service.grant(
      { orgUserId: sarah, contentId: eventId, expiresAt: null },
      actorWith({ id: sarah, orgId: org }),
    );

    const results = await Promise.allSettled(
      [james, emma].map((orgUserId) =>
        service.grant(
          { orgUserId, contentId: eventId, expiresAt: null },
          actorWith({ id: orgUserId, orgId: org }),
        ),
      ),
    );

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const refused = results.find((result) => result.status === "rejected");
    expect(refused?.reason).toBeInstanceOf(ConflictError);
    expect((refused?.reason as ConflictError).code).toBe("full");
    await expect(
      new DrizzleEntitlementsRepository(drizzle(pool)).grantedOrgUserIds(org, eventId),
    ).resolves.toHaveLength(2);
  });

  it("gives the last place to one of two concurrent staff grants", async () => {
    const eventId = await publishedEvent(1);
    const staff = actorWith({ id: sarah, orgId: org, owner: true });

    const results = await Promise.allSettled(
      [james, emma].map((orgUserId) =>
        service.grant({ orgUserId, contentId: eventId, expiresAt: null }, staff),
      ),
    );

    expect(results.map((result) => result.status).sort()).toEqual(["fulfilled", "rejected"]);
    const refused = results.find((result) => result.status === "rejected");
    expect((refused?.reason as ConflictError).code).toBe("full");
  });

  it("answers not found for a person who is not in the org", async () => {
    const eventId = await publishedEvent(5);
    await expect(
      service.grant(
        { orgUserId: genId("orgUser"), contentId: eventId, expiresAt: null },
        actorWith({ id: sarah, orgId: org, owner: true }),
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
