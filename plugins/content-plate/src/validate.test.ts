import { describe, expect, it } from "vitest";

import { isNodeList, validate } from "./validate";

describe("validate", () => {
  it("accepts a list of nodes with children arrays", () => {
    const config = [
      { type: "h1", children: [{ text: "Title" }] },
      { type: "p", children: [{ text: "Body", bold: true }] },
    ];
    expect(validate(config)).toEqual({ ok: true });
    expect(isNodeList(config)).toBe(true);
  });

  it("rejects non-arrays", () => {
    expect(validate(null)).toEqual({ ok: false, errors: ["config must be an array of nodes"] });
    expect(validate({ type: "p" })).toEqual({
      ok: false,
      errors: ["config must be an array of nodes"],
    });
    expect(isNodeList(undefined)).toBe(false);
  });

  it("reports each malformed node", () => {
    const result = validate([{ type: "p", children: [] }, { type: "p" }, 42]);
    expect(result).toEqual({
      ok: false,
      errors: ["node 1 has no children array", "node 2 is not an object"],
    });
  });

  it("treats an empty array as not-a-value (editor falls back to empty paragraph)", () => {
    expect(isNodeList([])).toBe(false);
  });
});
