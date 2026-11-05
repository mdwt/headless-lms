import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
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
    pools = [0, 1].map(() => {
      const pool = new pg.Pool({ connectionString: target.toString(), max: 2 });
      pool.on("error", () => {});
      return pool;
    });
    a = new DrizzleOutboxStore(drizzle(pools[0]!));
    b = new DrizzleOutboxStore(drizzle(pools[1]!));
    appender = new DrizzleOutboxAppender(drizzle(pools[0]!));
  });

  afterAll(async () => {
    await Promise.all(pools.map((pool) => pool.end()));
    for (let i = 0; i < 50; i++) {
      const open = await admin.query(
        "select count(*)::int as n from pg_stat_activity where datname = $1",
        [database],
      );
      if (open.rows[0].n === 0) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    await admin.query(`drop database if exists "${database}"`);
    await admin.end();
  });

  beforeEach(async () => {
    await pools[0]!.query("delete from event_outbox");
  });

  const append = async (count: number) => {
    await appender.append(
      Array.from({ length: count }, () => ({
        type: "entitlement.created" as const,
        version: 1,
        orgId: "org-1",
        data: {},
      })),
    );
    await pools[0]!.query(
      "update event_outbox set next_attempt_at = now() - interval '1 second' where processed_at is null and next_attempt_at < now() + interval '10 seconds'",
    );
  };

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
