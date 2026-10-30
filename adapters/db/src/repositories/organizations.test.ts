import { describe, it, expect } from "vitest";
import { drizzle } from "drizzle-orm/node-postgres";
import { ConflictError } from "@headless-lms/core/shared/errors";
import { DrizzleOrganizationsRepository } from "./organizations.js";

function repoWith(fail?: { code: string }) {
  const client = {
    async query() {
      if (fail) {
        throw Object.assign(new Error("violates foreign key constraint"), fail);
      }
      return { rows: [], rowCount: 0 };
    },
  };
  const db = drizzle({ client: client as never });
  return new DrizzleOrganizationsRepository(db);
}

describe("DrizzleOrganizationsRepository", () => {
  it("turns an org user delete the references refuse into a conflict", async () => {
    const repo = repoWith({ code: "23503" });
    await expect(repo.deleteOrgUser("org1", "orm_1")).rejects.toBeInstanceOf(ConflictError);
    await expect(repo.deleteOrgUser("org1", "orm_1")).rejects.toThrow("cannot be deleted");
  });

  it("returns null when no org user matched", async () => {
    expect(await repoWith().deleteOrgUser("org1", "orm_1")).toBeNull();
  });
});
