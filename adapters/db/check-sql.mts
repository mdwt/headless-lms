import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { DrizzleStudentsRepository } from "./src/repositories/students.js";
import { DrizzleMembersRepository } from "./src/repositories/members.js";
import { DrizzleEntitlementsRepository } from "./src/repositories/entitlements.js";

const ORG = "org_3HGQMqWN2hqhCtoapiWJlTqxzxq";
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool);

const students = new DrizzleStudentsRepository(db as never);
for (const sort of ["firstName", "-lastName", "email", "entitlementCount", "joinedAt"]) {
  const p = await students.list(ORG, { page: 1, pageSize: 10, search: "a", sort });
  console.log(`students sort=${sort}: ${p.rows.length} rows, total ${p.total}`);
}
console.log(
  "sample student:",
  JSON.stringify((await students.list(ORG, { page: 1, pageSize: 1 })).rows[0]),
);

const members = new DrizzleMembersRepository(db as never);
for (const sort of ["firstName", "-lastName", "email", "role"]) {
  const p = await members.list(ORG, { page: 1, pageSize: 10, search: "e", sort } as never);
  console.log(`members sort=${sort}: ${p.rows.length} rows, total ${p.total}`);
}
console.log(
  "sample member:",
  JSON.stringify((await members.list(ORG, { page: 1, pageSize: 1 } as never)).rows[0]),
);

const ents = new DrizzleEntitlementsRepository(db as never);
for (const sort of ["firstName", "-lastName", "email", "grantedAt"]) {
  const p = await ents.list(ORG, { page: 1, pageSize: 10, sort } as never);
  console.log(`entitlements sort=${sort}: ${p.rows.length} rows, total ${p.total}`);
}

await pool.end();
