import { describe, it, expect, vi } from "vitest";
import { sql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/node-postgres";
import { grantExpired, grantUnexpired, holdsCommunity } from "./grant-covers.js";
import { DrizzleAdminRepository } from "./admin.js";
import { DrizzleMemberRepository } from "./member.js";

const dialect = new PgDialect();

function render(fragment: ReturnType<typeof sql>): string {
  return dialect.sqlToQuery(fragment).sql;
}

function capturingDb() {
  const queries: { text: string; values: unknown[] }[] = [];
  const query = vi.fn(async (q: string | { text: string; values?: unknown[] }, v?: unknown[]) => {
    queries.push({
      text: typeof q === "string" ? q : q.text,
      values: v ?? (typeof q === "string" ? [] : (q.values ?? [])),
    });
    return { rows: [], rowCount: 0, fields: [] };
  });
  return { db: drizzle({ client: { query } as never }), queries };
}

describe("expiry predicate", () => {
  it("expires a grant at expires_at and keeps it active strictly before", () => {
    expect(render(grantExpired(sql`x`))).toBe("(x is not null and x <= now())");
    expect(render(grantUnexpired(sql`x`))).toBe("(x is null or x > now())");
  });

  it("counts the admin overview from content_access, the single access definition", async () => {
    const { db, queries } = capturingDb();
    await new DrizzleAdminRepository(db).overview("org-1");
    const text = queries.map((q) => q.text).join("\n");
    expect(text).toContain('from "content_access"');
    expect(text).not.toMatch(/>= now\(\)|< now\(\)/);
  });
});

describe("community membership predicate", () => {
  it("requires a published community beside an active grant", () => {
    const text = render(holdsCommunity(sql`o`, sql`u`, sql`c`));
    expect(text).toContain("pc.status = 'published'");
    expect(text).toContain("ci.type = $1");
  });

  it("drives the directory: staff, or a grant to the published community", async () => {
    const { db, queries } = capturingDb();
    await new DrizzleMemberRepository(db).directory("org-1", "cmy_1", { page: 1, pageSize: 20 });
    expect(queries[0]!.text).toContain("pc.status = 'published'");
    expect(queries[0]!.values).toEqual(expect.arrayContaining(["owner", "admin", "instructor"]));
  });
});
