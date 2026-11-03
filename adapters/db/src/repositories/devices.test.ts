import { describe, it, expect } from "vitest";
import { drizzle } from "drizzle-orm/node-postgres";
import { DrizzleDevicesRepository } from "./devices.js";

function capture(rows: unknown[][] = []) {
  const statements: { text: string; params: unknown[] }[] = [];
  const client = {
    async query(config: string | { text: string; values?: unknown[] }, params: unknown[] = []) {
      const text = typeof config === "string" ? config : config.text;
      const values = typeof config === "string" ? params : (config.values ?? params);
      statements.push({ text, params: values });
      return { rows, rowCount: rows.length };
    },
  };
  return {
    statements,
    repo: new DrizzleDevicesRepository(drizzle({ client: client as never })),
  };
}

const at = new Date("2026-11-03T12:00:00.000Z");
const row = [
  "org_1",
  "dev_1",
  "usr_1",
  "apns",
  "tok",
  null,
  null,
  "com.app",
  "production",
  at.toISOString(),
  at.toISOString(),
];

describe("DrizzleDevicesRepository", () => {
  it("upserts by provider and token, moving the device to the person and refreshing it", async () => {
    const { repo, statements } = capture([row]);
    const device = await repo.upsert(
      "org_1",
      {
        userId: "usr_1",
        provider: "apns",
        token: "tok",
        p256dh: null,
        auth: null,
        appId: "com.app",
        environment: "production",
      },
      at,
    );
    expect(device).toEqual({
      id: "dev_1",
      provider: "apns",
      token: "tok",
      p256dh: null,
      auth: null,
      appId: "com.app",
      environment: "production",
      lastSeenAt: at,
    });
    expect(statements[0]?.text).toMatch(
      /on conflict \("org_id","provider","token"\) do update set "user_id" = \$\d+, "p256dh" = \$\d+, "auth" = \$\d+, "app_id" = \$\d+, "environment" = \$\d+, "last_seen_at" = \$\d+ returning/,
    );
  });

  it("lists a person's devices, only those seen since a time when given", async () => {
    const { repo, statements } = capture([row]);
    await repo.listForUser("org_1", "usr_1", null);
    await repo.listForUser("org_1", "usr_1", at);
    expect(statements[0]?.text).not.toContain(`"last_seen_at" >=`);
    expect(statements[1]?.text).toContain(`"devices"."last_seen_at" >= $3`);
    expect(statements[1]?.text).toMatch(
      /order by "devices"."last_seen_at" desc, "devices"."id" asc$/,
    );
  });

  it("names the people with a device seen since a time in one query", async () => {
    const { repo, statements } = capture([["usr_1"]]);
    await expect(repo.usersWithDevices("org_1", ["usr_1", "usr_2"], at)).resolves.toEqual([
      "usr_1",
    ]);
    expect(statements[0]?.text).toMatch(/^select distinct "user_id" from "devices"/);
    expect(statements[0]?.text).toContain(`"devices"."user_id" in ($2, $3)`);
    expect(statements[0]?.text).toContain(`"devices"."last_seen_at" >= $4`);
    await repo.usersWithDevices("org_1", [], at);
    expect(statements).toHaveLength(1);
  });

  it("deletes a device only for its owner, and dead devices by id", async () => {
    const { repo, statements } = capture([["dev_1"]]);
    await expect(repo.deleteOwn("org_1", "usr_1", "dev_1")).resolves.toBe(true);
    expect(statements[0]?.params).toEqual(["org_1", "usr_1", "dev_1"]);
    await repo.deleteMany("org_1", ["dev_1", "dev_2"]);
    expect(statements[1]?.text).toContain(`"devices"."id" in ($2, $3)`);
    await repo.deleteMany("org_1", []);
    expect(statements).toHaveLength(2);
  });
});
