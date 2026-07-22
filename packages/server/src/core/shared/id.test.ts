import { describe, it, expect } from "vitest";
import KSUID from "ksuid";
import { genId, isId, ID_PREFIXES, type IdType } from "./id.js";

const types = Object.keys(ID_PREFIXES) as IdType[];

describe("genId", () => {
  it("prefixes every id type with `${prefix}_`", () => {
    for (const t of types) {
      expect(genId(t).startsWith(`${ID_PREFIXES[t]}_`)).toBe(true);
    }
  });

  it("appends a 27-char base62 KSUID body after the prefix", () => {
    const body = genId("organization").slice("org_".length);
    expect(body).toHaveLength(27);
    expect(body).toMatch(/^[0-9A-Za-z]{27}$/);
  });

  it("produces unique ids", () => {
    const ids = new Set(Array.from({ length: 1000 }, () => genId("student")));
    expect(ids.size).toBe(1000);
  });

  it("is lexicographically ordered by embedded timestamp (KSUID time-sortability)", () => {
    // KSUID sorts by its second-granularity timestamp prefix. Build two bodies a
    // second apart (payloads chosen so the *later* one would lose on payload alone)
    // to prove the timestamp dominates the string order.
    const early = `crs_${KSUID.fromParts(1_500_000_000_000, Buffer.alloc(16, 0xff)).string}`;
    const late = `crs_${KSUID.fromParts(1_500_000_001_000, Buffer.alloc(16, 0x00)).string}`;
    expect([late, early].sort()).toEqual([early, late]);
  });

  it("generates outbox event ids with the evt prefix", () => {
    expect(genId("event").startsWith("evt_")).toBe(true);
  });
});

describe("isId", () => {
  it("accepts a matching prefix and rejects a mismatched one", () => {
    const id = genId("asset");
    expect(isId("asset", id)).toBe(true);
    expect(isId("course", id)).toBe(false);
  });
});
