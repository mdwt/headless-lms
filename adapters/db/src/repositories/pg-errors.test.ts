import { describe, it, expect } from "vitest";
import { ConflictError } from "@headless-lms/core/shared/errors";
import { DbQueryError, translateDbError, translateDbErrors } from "./pg-errors.js";

function drizzleLikeError(code: string, extra: Record<string, string> = {}) {
  return Object.assign(new Error("Failed query: ...\nparams: secret"), {
    query: "select 1",
    params: ["secret"],
    cause: Object.assign(new Error("driver failure"), { code, ...extra }),
  });
}

describe("translateDbErrors (class boundary)", () => {
  class FakeRepo {
    async find(): Promise<never> {
      throw drizzleLikeError("23505", { detail: "Key (slug)=(x) already exists." });
    }
    async list(): Promise<never> {
      throw drizzleLikeError("57014");
    }
    sync(): never {
      throw drizzleLikeError("23503", { constraint: "fk" });
    }
    async ok(): Promise<string> {
      return "fine";
    }
  }
  translateDbErrors(FakeRepo);

  it("translates async rejections into domain errors with a client-safe message", async () => {
    const err = await new FakeRepo().find().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ConflictError);
    expect((err as ConflictError).message).toBe('slug "x" is already in use');
    expect((err as ConflictError).message).not.toContain("Key (");
  });

  it("sanitizes non-constraint failures into DbQueryError", async () => {
    const err = await new FakeRepo().list().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DbQueryError);
    expect((err as DbQueryError).message).toBe("driver failure");
    expect((err as DbQueryError).pg).toEqual({ code: "57014" });
  });

  it("translates synchronous throws without leaking schema internals", () => {
    let thrown: unknown;
    try {
      new FakeRepo().sync();
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(DbQueryError);
    expect(thrown).not.toBeInstanceOf(ConflictError);
    const dbError = thrown as DbQueryError;
    expect(dbError.message).toBe("driver failure");
    expect(dbError.message).not.toContain("secret");
    expect(dbError.pg).toEqual({ code: "23503", constraint: "fk" });
  });

  it("leaves successful calls untouched", async () => {
    await expect(new FakeRepo().ok()).resolves.toBe("fine");
  });
});

describe("translateDbError", () => {
  it("is idempotent for already-translated errors", () => {
    const conflict = new ConflictError("dup");
    expect(translateDbError(conflict)).toBe(conflict);
    const dbErr = new DbQueryError("boom", {});
    expect(translateDbError(dbErr)).toBe(dbErr);
  });

  it("passes non-database errors through", () => {
    const plain = new Error("not db");
    expect(translateDbError(plain)).toBe(plain);
  });
});
