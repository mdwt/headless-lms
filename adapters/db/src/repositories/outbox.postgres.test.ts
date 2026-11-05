import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { genId } from "@headless-lms/core/shared/id";
import { runMigrations } from "../migrate.js";
import { DrizzleOutboxAppender, DrizzleOutboxStore } from "./outbox.js";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("DrizzleOutboxStore on Postgres", () => {
  const database = `outbox_${genId("event")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")}`;
  let admin: pg.Client;
  let pools: pg.Pool[] = [];
  let a: DrizzleOutboxStore;
  let b: DrizzleOutboxStore;
  let appender: DrizzleOutboxAppender;

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: url });
    await admin.connect();
    await admin.query(`create database "${database}"`);
    const target = new URL(url!);
    target.pathname = `/${database}`;
    await runMigrations(target.toString());
    pools = [0, 1].map(() => new pg.Pool({ connectionString: target.toString(), max: 2 }));
    a = new DrizzleOutboxStore(drizzle(pools[0]!));
    b = new DrizzleOutboxStore(drizzle(pools[1]!));
    appender = new DrizzleOutboxAppender(drizzle(pools[0]!));
  });

  afterAll(async () => {
    await Promise.all(pools.map((pool) => pool.end()));
    await admin?.query(`drop database if exists "${database}" with (force)`);
    await admin?.end();
  });

  const append = (count: number) =>
    appender.append(
      Array.from({ length: count }, () => ({
        type: "entitlement.created" as const,
        version: 1,
        orgId: "org-1",
        data: {},
      })),
    );

  it("two relays fetching at once never get the same message", async () => {
    await append(40);
    const [first, second] = await Promise.all([a.fetchBatch(25), b.fetchBatch(25)]);
    const ids = [...first, ...second].map((message) => message.id);
    expect(ids).toHaveLength(40);
    expect(new Set(ids).size).toBe(40);
  });

  it("a fetched message is not fetched again while its claim holds, by either relay", async () => {
    await append(3);
    const fetched = await a.fetchBatch(10);
    expect(fetched).toHaveLength(3);
    expect(await a.fetchBatch(10)).toEqual([]);
    expect(await b.fetchBatch(10)).toEqual([]);
  });

  it("a failed message is fetched again once its retry time comes, and a processed one never", async () => {
    await append(2);
    const [failed, done] = await a.fetchBatch(10);
    await a.markFailed(failed!.id, "boom", new Date(Date.now() - 1));
    await a.markProcessed(done!.id);
    const again = await b.fetchBatch(10);
    expect(again.map((message) => message.id)).toEqual([failed!.id]);
    expect(again[0]!.attempts).toBe(1);
  });

  it("a claim that lapses lets another relay fetch the message", async () => {
    await append(1);
    const [claimed] = await a.fetchBatch(10);
    await pools[0]!.query(
      "update event_outbox set next_attempt_at = now() - interval '1 second' where id = $1",
      [claimed!.id],
    );
    const taken = await b.fetchBatch(10);
    expect(taken.map((message) => message.id)).toEqual([claimed!.id]);
  });
});
