import { describe, it, expect, vi } from "vitest";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { DrizzleUnitOfWork } from "./unit-of-work.js";
import { DrizzleOutboxAppender } from "./repositories/outbox.js";
import type { Tx } from "./index.js";

function fakeDb() {
  const values = vi.fn().mockResolvedValue(undefined);
  const insert = vi.fn(() => ({ values }));
  const tx = { insert } as unknown as Tx;
  const transaction = vi.fn(async <T>(fn: (t: Tx) => Promise<T>) => fn(tx));
  return { db: { transaction } as unknown as NodePgDatabase, tx, transaction, insert };
}

describe("DrizzleUnitOfWork", () => {
  it("runs the callback inside db.transaction with the tx-bound scope", async () => {
    const { db, tx, transaction } = fakeDb();
    const makeScope = vi.fn((executor: Tx) => ({ marker: executor }));
    const uow = new DrizzleUnitOfWork(db, makeScope);
    const result = await uow.run(async (scope) => {
      expect(scope.marker).toBe(tx);
      return "done";
    });
    expect(result).toBe("done");
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(makeScope).toHaveBeenCalledWith(tx);
  });

  it("binds an outbox appender in the scope to the SAME transaction executor", async () => {
    const { db, insert } = fakeDb();
    const uow = new DrizzleUnitOfWork(db, (tx) => ({ outbox: new DrizzleOutboxAppender(tx) }));
    await uow.run(async ({ outbox }) => {
      await outbox.append([{ type: "enrollment.created", orgId: "org-1" }]);
    });
    expect(insert).toHaveBeenCalledTimes(1);
  });

  it("propagates a thrown error out of run (drizzle rolls the tx back)", async () => {
    const { db } = fakeDb();
    const uow = new DrizzleUnitOfWork(db, () => ({}));
    await expect(
      uow.run(async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
  });
});
